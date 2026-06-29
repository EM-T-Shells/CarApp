// stripe-webhook Edge Function
//
// Handles two types of inbound requests:
//   1. App-invoked actions (via supabase.functions.invoke) — identified by the
//      absence of a Stripe-Signature header. Currently supports:
//        • create_deposit_intent — creates a Stripe PaymentIntent for the 15%
//          deposit and records a pending payment row.
//        • capture_balance — charges the remaining balance, completes the job,
//          and transfers the provider's payout to their Connect account.
//        • refund_deposit — refunds the deposit on a non-forfeit cancellation.
//        • cancel_booking — customer cancels; refunds the full deposit (>24h)
//          or the deposit less a $15 flat fee (<=24h). (Blocker #5)
//        • provider_cancel_booking — provider cancels a confirmed booking;
//          full customer refund + $25 penalty recorded on the booking.
//        • mark_no_show — provider marks a no-show; customer forfeits the full
//          amount (deposit kept, no refund), booking moves to no_show.
//        • accept_booking — provider accepts within the 2h window; the booking
//          moves pending_provider_approval → confirmed (Blocker #4).
//        • decline_booking — provider declines; the booking is cancelled and
//          the deposit refunded to the customer.
//        • expire_pending_approvals — pg_cron sweep that auto-cancels and
//          refunds approvals still pending past their 2h deadline.
//        • connect_onboarding — creates/reuses a provider's Express account and
//          returns a hosted onboarding link.
//        • connect_status — re-checks onboarding after the provider returns and
//          drains any payouts stranded before the account became payable.
//
//   2. Stripe webhook events (from Stripe's servers) — identified by the
//      Stripe-Signature header. Signature is verified before processing.
//      Currently handles:
//        • payment_intent.succeeded — marks payment succeeded; opens the
//          provider-approval window (deposit no longer auto-confirms).
//        • payment_intent.payment_failed — marks payment failed.
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno&no-check=true';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Clients ───────────────────────────────────────────────────────────

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role client — bypasses RLS for trusted server-side writes.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deep link the provider is sent back to after Stripe Connect onboarding. The
// bank step re-checks status on this link (see app/(provider)/bank.tsx). The
// app's URL scheme is "carapp" (app.json). refresh_url is hit when the link
// expires before completion; we route both back to the same screen, which will
// re-request a fresh link if needed.
const CONNECT_RETURN_URL = 'carapp://provider/bank?connect=return';
const CONNECT_REFRESH_URL = 'carapp://provider/bank?connect=refresh';

// Minimum before/after photos required before a job can be completed
// (Non-Negotiable #3 / Flow 5.5). Mirrors MIN_PHOTOS_TO_COMPLETE on the client.
const MIN_PHOTOS_TO_COMPLETE = 4;

// Manual provider-approval window (Blocker #4). On deposit success the booking
// moves to pending_provider_approval; the provider has this long to accept
// before the auto-cancel sweep refunds the deposit and cancels the booking.
const APPROVAL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// Cancellation policy (Blocker #5 / PRD v5). Enforced here, never in the UI.
//   • Customer cancels within 24h → retain this flat fee, refund the rest.
//   • Provider cancels within 24h → full customer refund + this penalty
//     recorded on the booking for ops to deduct from a future payout.
// Mirrors CUSTOMER_LATE_CANCEL_FEE_CENTS / PROVIDER_CANCEL_PENALTY_CENTS on
// the client (src/utils/money.ts).
const LATE_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const CUSTOMER_LATE_CANCEL_FEE_CENTS = 1500; // $15
const PROVIDER_CANCEL_PENALTY_CENTS = 2500; // $25

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Fire-and-forget invocation of a notify-* Edge Function. Pushes are
// best-effort, so a failure here must never roll back the payment / booking
// writes that triggered it.
async function fireNotify(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.functions.invoke(fn, { body });
  } catch (err) {
    console.warn(`${fn} invoke failed`, err);
  }
}

// ── Entry point ───────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripeSignature = req.headers.get('stripe-signature');

    if (stripeSignature) {
      return await handleStripeWebhook(req, stripeSignature);
    }

    return await handleAppAction(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── App-invoked actions ───────────────────────────────────────────────

async function handleAppAction(req: Request): Promise<Response> {
  const body = await req.json() as {
    action: string;
    booking_id?: string;
    amount?: number;
    provider_id?: string;
    reason?: string;
  };

  switch (body.action) {
    case 'create_deposit_intent':
      return await createDepositIntent(body as { action: string; booking_id: string; amount: number });
    case 'capture_balance':
      return await captureBalance(body as { action: string; booking_id: string });
    case 'refund_deposit':
      return await refundDeposit(body as { action: string; booking_id: string });
    case 'cancel_booking':
      return await cancelBooking(body as { action: string; booking_id: string });
    case 'provider_cancel_booking':
      return await providerCancelBooking(body as { action: string; booking_id: string; reason?: string });
    case 'mark_no_show':
      return await markNoShow(body as { action: string; booking_id: string });
    case 'accept_booking':
      return await acceptBooking(body as { action: string; booking_id: string });
    case 'decline_booking':
      return await declineBooking(body as { action: string; booking_id: string; reason?: string });
    case 'expire_pending_approvals':
      return await expirePendingApprovals();
    case 'connect_onboarding':
      return await connectOnboarding(body as { action: string; provider_id: string });
    case 'connect_status':
      return await connectStatus(body as { action: string; provider_id: string });
    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }
}

async function createDepositIntent(body: {
  action: string;
  booking_id: string;
  amount: number; // cents
}): Promise<Response> {
  const { booking_id, amount } = body;

  // Fetch booking to verify it exists and get the customer ID.
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, status')
    .eq('id', booking_id)
    .single();

  if (bookingError || !booking) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (booking.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Booking is not in a payable state' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch customer to get or create their Stripe customer ID.
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', booking.customer_id)
    .single();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Customer not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let stripeCustomerId: string = user.stripe_customer_id;

  // Create a Stripe customer on first payment.
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });

    stripeCustomerId = customer.id;

    await supabase
      .from('users')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', user.id);
  }

  // Create the Stripe PaymentIntent. The client confirms it using the
  // returned clientSecret via @stripe/stripe-react-native.
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: stripeCustomerId,
    automatic_payment_methods: { enabled: true },
    // Save the card so the remaining 85% balance can be charged off-session
    // when the provider completes the job (Flow 5.6 capture_balance).
    setup_future_usage: 'off_session',
    metadata: {
      booking_id,
      payment_type: 'deposit',
    },
  });

  // Record a pending payment row. Status is updated to 'succeeded' or
  // 'failed' when the payment_intent webhook event fires.
  const { error: insertError } = await supabase.from('payments').insert({
    booking_id,
    user_id: booking.customer_id,
    stripe_payment_intent_id: paymentIntent.id,
    payment_type: 'deposit',
    amount: amount / 100, // DB stores dollars (NUMERIC), not cents
    status: 'pending',
  });

  if (insertError) {
    // Roll back by cancelling the intent so the customer is never charged
    // for a booking we can't record.
    await stripe.paymentIntents.cancel(paymentIntent.id);
    return new Response(JSON.stringify({ error: 'Failed to record payment' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// ── Refund (Flow 2.12) ────────────────────────────────────────────────
//
// Issues a full refund of the deposit payment for the booking. Called by
// the client cancel handler when the cancellation falls OUTSIDE the
// 24-hour forfeit window. Idempotent against the payments table — if the
// deposit row is already `refunded` the function short-circuits with ok.

// Core deposit-refund routine, shared by the customer cancel path
// (refund_deposit / cancel_booking actions), provider decline/cancel, and the
// auto-cancel sweep.
// Idempotent against the payments table: once the deposit row is `refunded`
// there is no succeeded deposit left to find, so repeat calls return skipped.
// Returns a discriminated result the callers map onto their own responses.
type RefundResult =
  | { ok: true; skipped: string }
  | { ok: true; refund_id: string; status: string | null; refunded_amount: number }
  | { ok: false; status: number; error: string };

// Optional partial-refund amount (cents). When omitted the full deposit is
// refunded. Used by the late-cancel path to retain the $15 flat fee.
async function issueDepositRefund(
  booking_id: string,
  reason: Stripe.RefundCreateParams.Reason = 'requested_by_customer',
  refundAmountCents?: number,
): Promise<RefundResult> {
  // Locate the successful deposit payment for this booking.
  const { data: deposit, error: depositError } = await supabase
    .from('payments')
    .select('id, stripe_payment_intent_id, amount, status, user_id')
    .eq('booking_id', booking_id)
    .eq('payment_type', 'deposit')
    .eq('status', 'succeeded')
    .maybeSingle();

  if (depositError) {
    return { ok: false, status: 500, error: depositError.message };
  }

  if (!deposit) {
    // Nothing succeeded yet (or already refunded) — treat as a no-op so the
    // caller's cancel flow can proceed without erroring.
    return { ok: true, skipped: 'no deposit' };
  }

  if (!deposit.stripe_payment_intent_id) {
    return { ok: false, status: 422, error: 'Deposit has no Stripe PaymentIntent id' };
  }

  // Deposit is stored in dollars (NUMERIC); Stripe works in cents.
  const depositCents = Math.round(Number(deposit.amount) * 100);

  // Clamp any requested partial amount into [0, depositCents]. A zero refund
  // (e.g. a $15 fee >= the whole deposit) is a no-op: keep the deposit, mark
  // nothing refunded, but still let the caller's cancel proceed.
  const amountCents =
    refundAmountCents === undefined
      ? depositCents
      : Math.max(0, Math.min(refundAmountCents, depositCents));

  if (amountCents === 0) {
    return { ok: true, skipped: 'fee equals deposit' };
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: deposit.stripe_payment_intent_id,
      amount: amountCents,
      reason,
      metadata: { booking_id, payment_id: deposit.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe refund failed';
    return { ok: false, status: 502, error: message };
  }

  // Mark the original deposit as refunded and record a separate refund row
  // so the payments history shows both transactions. A partial refund still
  // flips the deposit to `refunded` (the retained fee is platform revenue,
  // not a still-collectable deposit).
  await supabase
    .from('payments')
    .update({ status: 'refunded' })
    .eq('id', deposit.id);

  await supabase.from('payments').insert({
    booking_id,
    user_id: deposit.user_id,
    stripe_payment_intent_id: deposit.stripe_payment_intent_id,
    payment_type: 'refund',
    amount: amountCents / 100, // DB stores dollars
    status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
  });

  return {
    ok: true,
    refund_id: refund.id,
    status: refund.status,
    refunded_amount: amountCents,
  };
}

async function refundDeposit(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const result = await issueDepositRefund(body.booking_id);
  if (!result.ok) {
    return jsonResponse({ error: result.error }, result.status);
  }
  return jsonResponse(result, 200);
}

// ── Cancellation policy (Blocker #5 / PRD v5) ──────────────────────────
//
// All three paths enforce policy server-side and guard on the booking's
// current status so a retried call is a safe no-op rather than a double
// transition or a double refund.
//
// Cancellable statuses for a customer/provider cancel: a booking that is
// pending payment, awaiting approval, confirmed, or en route. Once the job is
// in_progress/completed it can no longer be cancelled (the customer no-show
// path covers a confirmed job the customer never showed up for).
const CANCELLABLE_STATUSES = [
  'pending',
  'pending_provider_approval',
  'confirmed',
  'en_route',
];

// Whether the appointment is within the 24h late-cancel window.
function isWithinLateCancelWindow(scheduledAtIso: string | null): boolean {
  if (!scheduledAtIso) return false;
  const scheduled = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(scheduled)) return false;
  const diff = scheduled - Date.now();
  return diff >= 0 && diff <= LATE_CANCEL_WINDOW_MS;
}

// Customer-initiated cancellation. Outside 24h → full deposit refund. Within
// 24h → retain the $15 flat fee and refund the remainder of the deposit.
async function cancelBooking(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const { booking_id } = body;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, scheduled_at, deposit_amount')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return jsonResponse({ error: `Cannot cancel a booking in status ${booking.status}` }, 409);
  }

  const late = isWithinLateCancelWindow(booking.scheduled_at);
  const depositCents = Math.round(Number(booking.deposit_amount ?? 0) * 100);
  const feeCents = late ? Math.min(depositCents, CUSTOMER_LATE_CANCEL_FEE_CENTS) : 0;
  const refundCents = late ? Math.max(depositCents - feeCents, 0) : depositCents;

  // Transition first, guarded on status so concurrent calls don't double-refund.
  const { data: cancelled, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: 'customer',
      cancellation_fee: late ? feeCents / 100 : null,
      deposit_forfeited: late, // a fee was retained from the deposit
      approval_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', CANCELLABLE_STATUSES)
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!cancelled || cancelled.length === 0) {
    return jsonResponse({ error: 'Booking is no longer cancellable' }, 409);
  }

  const refund = await issueDepositRefund(
    booking_id,
    'requested_by_customer',
    refundCents,
  );
  if (!refund.ok) {
    // Booking is cancelled but the refund failed — leave it for ops/retry
    // rather than silently dropping the customer's money.
    return jsonResponse({ error: refund.error, cancelled: true }, refund.status);
  }

  await fireNotify('notify-booking-cancelled', {
    booking_id,
    cancelled_by: 'customer',
    fee_cents: feeCents,
    refund_cents: refundCents,
  });

  return jsonResponse(
    { ok: true, status: 'cancelled', late, fee_cents: feeCents, refund },
    200,
  );
}

// Provider-initiated cancellation of a booking they had accepted. The customer
// is made whole (full deposit refund) and the $25 penalty is recorded on the
// booking for ops to deduct from a future payout (no live charge in MVP).
async function providerCancelBooking(body: {
  action: string;
  booking_id: string;
  reason?: string;
}): Promise<Response> {
  const { booking_id, reason } = body;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, scheduled_at')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    return jsonResponse({ error: `Cannot cancel a booking in status ${booking.status}` }, 409);
  }

  // Penalty only applies inside the 24h window (PRD: "Provider cancels within
  // 24h → $25 penalty"). Earlier than that, no penalty.
  const late = isWithinLateCancelWindow(booking.scheduled_at);
  const penaltyCents = late ? PROVIDER_CANCEL_PENALTY_CENTS : 0;

  const { data: cancelled, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: 'provider',
      cancellation_fee: late ? penaltyCents / 100 : null,
      declined_reason: reason ?? null,
      approval_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', CANCELLABLE_STATUSES)
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!cancelled || cancelled.length === 0) {
    return jsonResponse({ error: 'Booking is no longer cancellable' }, 409);
  }

  // Provider's fault → customer gets the full deposit back.
  const refund = await issueDepositRefund(booking_id, 'requested_by_customer');
  if (!refund.ok) {
    return jsonResponse({ error: refund.error, cancelled: true }, refund.status);
  }

  await fireNotify('notify-booking-cancelled', {
    booking_id,
    cancelled_by: 'provider',
    penalty_cents: penaltyCents,
  });

  return jsonResponse(
    { ok: true, status: 'cancelled', late, penalty_cents: penaltyCents, refund },
    200,
  );
}

// Customer no-show. The provider marks the job a no-show: the customer forfeits
// the full booking amount (the deposit is kept, NO refund) and the booking
// moves to the terminal no_show status. No provider penalty.
async function markNoShow(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const { booking_id } = body;

  // A no-show only makes sense for a job that was confirmed/active but never
  // started. Guard against marking a completed/cancelled job.
  const NO_SHOW_FROM = ['confirmed', 'en_route'];

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({
      status: 'no_show',
      no_show_at: new Date().toISOString(),
      deposit_forfeited: true, // full booking amount forfeited; deposit kept
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', NO_SHOW_FROM)
    .select('id');

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!updated || updated.length === 0) {
    return jsonResponse({ error: 'Booking cannot be marked as a no-show' }, 409);
  }

  await fireNotify('notify-booking-cancelled', {
    booking_id,
    cancelled_by: 'no_show',
  });

  return jsonResponse({ ok: true, status: 'no_show' }, 200);
}

// ── Provider approval window (Blocker #4 / Flow H1) ────────────────────
//
// After deposit success a booking sits in pending_provider_approval with a
// 2-hour approval_expires_at. The provider resolves it one of three ways:
//   • accept_booking  → confirmed   (customer + provider notified)
//   • decline_booking → cancelled + deposit refunded
//   • timeout         → expire_pending_approvals auto-cancels + refunds
//
// All three guard on the current status so a retried call (or a sweep racing a
// manual accept) is a safe no-op rather than a double transition.

async function acceptBooking(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const { booking_id } = body;

  const { data: accepted, error } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      approval_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'pending_provider_approval') // Guard: only from the window.
    .select('id');

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!accepted || accepted.length === 0) {
    // Already resolved (accepted, declined, or expired) — surface a 409 so the
    // client can refetch and show the real state.
    return jsonResponse({ error: 'Booking is no longer awaiting approval' }, 409);
  }

  await fireNotify('notify-booking-confirmed', { booking_id });
  return jsonResponse({ ok: true, status: 'confirmed' }, 200);
}

async function declineBooking(body: {
  action: string;
  booking_id: string;
  reason?: string;
}): Promise<Response> {
  const { booking_id, reason } = body;

  // Cancel first, guarded on the window so we only refund a booking we
  // actually transitioned out of pending_provider_approval.
  const { data: declined, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      declined_reason: reason ?? null,
      approval_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'pending_provider_approval')
    .select('id');

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!declined || declined.length === 0) {
    return jsonResponse({ error: 'Booking is no longer awaiting approval' }, 409);
  }

  // Provider declined → full deposit refund (no forfeit, not the customer's fault).
  const refund = await issueDepositRefund(booking_id, 'requested_by_customer');
  if (!refund.ok) {
    // The booking is cancelled but the refund failed — leave it for ops/retry
    // rather than silently dropping the customer's money.
    return jsonResponse({ error: refund.error, cancelled: true }, refund.status);
  }

  await fireNotify('notify-booking-declined', { booking_id });
  return jsonResponse({ ok: true, status: 'cancelled', refund }, 200);
}

// Auto-cancel sweep, invoked by pg_cron every minute (see migration
// 0001_booking_provider_approval_model.sql). Cancels and refunds every
// approval whose 2-hour window has elapsed. Per-booking failures are logged
// and skipped so one bad refund doesn't stall the rest of the batch.
async function expirePendingApprovals(): Promise<Response> {
  const nowIso = new Date().toISOString();

  const { data: overdue, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('status', 'pending_provider_approval')
    .lte('approval_expires_at', nowIso);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let cancelled = 0;
  const failed: string[] = [];

  for (const { id } of overdue ?? []) {
    // Guarded transition — if a provider accepts between the SELECT and here,
    // the update matches nothing and we skip the refund.
    const { data: swept } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        declined_reason: 'Auto-cancelled: provider did not respond within 2 hours',
        approval_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending_provider_approval')
      .select('id');

    if (!swept || swept.length === 0) continue;

    const refund = await issueDepositRefund(id, 'requested_by_customer');
    if (!refund.ok) {
      console.warn(`expire_pending_approvals: refund failed for ${id}: ${refund.error}`);
      failed.push(id);
      continue;
    }

    cancelled += 1;
    await fireNotify('notify-booking-declined', { booking_id: id, expired: true });
  }

  return jsonResponse({ ok: true, cancelled, failed }, 200);
}

// ── Stripe Connect onboarding (Flow 4.6) ──────────────────────────────
//
// Provider payouts require a Stripe Connect (Express) account. This pair of
// actions replaces the old client-side stub:
//   • connect_onboarding — creates the Express account on first run (persisting
//     stripe_account_id), then returns a hosted account-link URL the provider
//     opens to enter their bank details.
//   • connect_status — re-checks the account after the provider returns; flips
//     bank_status to approved once charges_enabled && payouts_enabled, and
//     drains any payouts that were stranded pending before onboarding finished.

async function connectOnboarding(body: {
  action: string;
  provider_id: string;
}): Promise<Response> {
  const { provider_id } = body;

  const { data: provider, error: providerError } = await supabase
    .from('provider_profiles')
    .select('id, user_id, stripe_account_id')
    .eq('id', provider_id)
    .single();

  if (providerError || !provider) {
    return jsonResponse({ error: 'Provider not found' }, 404);
  }

  let accountId: string | null = provider.stripe_account_id;

  // Create the Express account on first onboarding and persist it so repeat
  // runs (e.g. expired link) reuse the same account.
  if (!accountId) {
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { provider_id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe account create failed';
      return jsonResponse({ error: message }, 502);
    }

    accountId = account.id;

    const { error: saveError } = await supabase
      .from('provider_profiles')
      .update({ stripe_account_id: accountId })
      .eq('id', provider_id);

    if (saveError) {
      return jsonResponse({ error: 'Failed to save Stripe account' }, 500);
    }
  }

  let link: Stripe.AccountLink;
  try {
    link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: CONNECT_REFRESH_URL,
      return_url: CONNECT_RETURN_URL,
      type: 'account_onboarding',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe account link failed';
    return jsonResponse({ error: message }, 502);
  }

  // Onboarding is underway — reflect that on the vetting step.
  await supabase
    .from('provider_vetting')
    .update({ bank_status: 'submitted' })
    .eq('provider_id', provider_id)
    .neq('bank_status', 'approved');

  return jsonResponse({ configured: true, url: link.url, account_id: accountId }, 200);
}

async function connectStatus(body: {
  action: string;
  provider_id: string;
}): Promise<Response> {
  const { provider_id } = body;

  const { data: provider, error: providerError } = await supabase
    .from('provider_profiles')
    .select('id, stripe_account_id')
    .eq('id', provider_id)
    .single();

  if (providerError || !provider) {
    return jsonResponse({ error: 'Provider not found' }, 404);
  }

  if (!provider.stripe_account_id) {
    // Onboarding never started — nothing to verify.
    return jsonResponse({ state: 'not_started' }, 200);
  }

  let account: Stripe.Account;
  try {
    account = await stripe.accounts.retrieve(provider.stripe_account_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe account retrieve failed';
    return jsonResponse({ error: message }, 502);
  }

  const ready = Boolean(account.charges_enabled && account.payouts_enabled);

  if (!ready) {
    // Express can return the provider to return_url while the account is still
    // under review. Keep the step in-progress rather than wrongly approving.
    await supabase
      .from('provider_vetting')
      .update({ bank_status: 'submitted' })
      .eq('provider_id', provider_id)
      .neq('bank_status', 'approved');

    return jsonResponse({ state: 'pending' }, 200);
  }

  await supabase
    .from('provider_vetting')
    .update({ bank_status: 'approved' })
    .eq('provider_id', provider_id);

  // Account is now payable — drain any payouts that completed before the
  // provider finished onboarding. Fire-and-forget so the status response
  // returns immediately instead of blocking on N transfers; remaining payouts
  // (past the batch cap or transient failures) are picked up on the next call.
  drainPendingPayouts(provider_id, provider.stripe_account_id).catch((err) => {
    console.warn('drainPendingPayouts failed', err);
  });

  return jsonResponse({ state: 'approved' }, 200);
}

// Transfer up to a capped batch of a provider's stranded payouts (completed
// before onboarding, so still pending with no transfer). Capped + oldest-first
// so a provider with many test-job payouts can't stall a single invocation.
async function drainPendingPayouts(
  providerId: string,
  stripeAccountId: string,
): Promise<void> {
  const { data: pending } = await supabase
    .from('payouts')
    .select('id, booking_id, amount, status, stripe_transfer_id')
    .eq('provider_id', providerId)
    .eq('status', 'pending')
    .is('stripe_transfer_id', null)
    .order('id', { ascending: true })
    .limit(20);

  if (!pending || pending.length === 0) return;

  for (const payout of pending) {
    await transferPayout(payout, stripeAccountId);
  }
}

// ── Capture balance (Flow 5.6) ────────────────────────────────────────
//
// Called when a provider marks a job complete. Charges the customer's saved
// card for the remaining 85% off-session, records a `balance` payment row,
// transitions the booking to `completed`, and queues the provider payout.
// Idempotent: a second call after the balance already succeeded re-completes
// the booking (if needed) and returns ok without double-charging.

async function captureBalance(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const { booking_id } = body;

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, total_amount, deposit_amount, provider_payout')
    .eq('id', booking_id)
    .single();

  if (bookingError || !booking) {
    return jsonResponse({ error: 'Booking not found' }, 404);
  }

  if (booking.status === 'cancelled') {
    return jsonResponse({ error: 'Booking is cancelled' }, 409);
  }

  // Non-Negotiable #3: a job cannot be completed without the minimum number of
  // before/after photos. The client enforces this too (Flow 5.5) but the gate
  // must live here so the rule can't be bypassed via a direct API call. Skip
  // the check on idempotent re-runs of an already-captured booking below.
  const { count: photoCount, error: photoError } = await supabase
    .from('booking_photos')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', booking_id);

  if (photoError) {
    return jsonResponse({ error: 'Failed to verify job photos' }, 500);
  }

  // Idempotency — if a balance payment already succeeded, just finish.
  const { data: existingBalance } = await supabase
    .from('payments')
    .select('id, status')
    .eq('booking_id', booking_id)
    .eq('payment_type', 'balance')
    .eq('status', 'succeeded')
    .maybeSingle();

  if (existingBalance) {
    await completeAndQueuePayout(booking);
    return jsonResponse({ ok: true, skipped: 'already captured' }, 200);
  }

  // Enforce the photo minimum before charging the balance / completing. Checked
  // only for not-yet-captured bookings so an already-completed job (above) is
  // never re-blocked by a later policy change.
  if ((photoCount ?? 0) < MIN_PHOTOS_TO_COMPLETE) {
    return jsonResponse(
      {
        error: `At least ${MIN_PHOTOS_TO_COMPLETE} before/after photos are required to complete the job.`,
        photo_count: photoCount ?? 0,
        required: MIN_PHOTOS_TO_COMPLETE,
      },
      400,
    );
  }

  const total = Number(booking.total_amount ?? 0);
  const deposit = Number(booking.deposit_amount ?? 0);
  const balanceCents = Math.round(Math.max(total - deposit, 0) * 100);

  // No remaining balance — complete the job and queue payout without a charge.
  if (balanceCents <= 0) {
    await completeAndQueuePayout(booking);
    return jsonResponse({ ok: true, skipped: 'no balance' }, 200);
  }

  // Resolve the customer's saved payment method from the deposit PaymentIntent.
  const { data: depositPayment } = await supabase
    .from('payments')
    .select('stripe_payment_intent_id')
    .eq('booking_id', booking_id)
    .eq('payment_type', 'deposit')
    .eq('status', 'succeeded')
    .maybeSingle();

  let paymentMethodId: string | null = null;
  let customerId: string | null = null;

  if (depositPayment?.stripe_payment_intent_id) {
    const depositIntent = await stripe.paymentIntents.retrieve(
      depositPayment.stripe_payment_intent_id,
    );
    paymentMethodId =
      typeof depositIntent.payment_method === 'string'
        ? depositIntent.payment_method
        : depositIntent.payment_method?.id ?? null;
    customerId =
      typeof depositIntent.customer === 'string'
        ? depositIntent.customer
        : depositIntent.customer?.id ?? null;
  }

  // Fallback: the user's stored Stripe customer id.
  if (!customerId) {
    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', booking.customer_id)
      .single();
    customerId = user?.stripe_customer_id ?? null;
  }

  if (!customerId || !paymentMethodId) {
    return jsonResponse(
      { error: 'No saved payment method on file to charge the balance' },
      422,
    );
  }

  let balanceIntent: Stripe.PaymentIntent;
  try {
    balanceIntent = await stripe.paymentIntents.create({
      amount: balanceCents,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { booking_id, payment_type: 'balance' },
    });
  } catch (err) {
    // Off-session charges can require customer authentication (3DS) or be
    // declined; surface the message so the provider can ask the customer.
    const message = err instanceof Error ? err.message : 'Balance charge failed';
    return jsonResponse({ error: message }, 402);
  }

  await supabase.from('payments').insert({
    booking_id,
    user_id: booking.customer_id,
    stripe_payment_intent_id: balanceIntent.id,
    payment_type: 'balance',
    amount: balanceCents / 100,
    status: balanceIntent.status === 'succeeded' ? 'succeeded' : 'pending',
  });

  await completeAndQueuePayout(booking);

  return jsonResponse(
    { ok: true, payment_intent_id: balanceIntent.id, status: balanceIntent.status },
    200,
  );
}

// Transition a booking to completed and queue the provider's payout. Both
// writes are guarded so repeated calls are safe.
async function completeAndQueuePayout(booking: {
  id: string;
  provider_id: string | null;
  provider_payout: number | null;
}): Promise<void> {
  const now = new Date().toISOString();

  const { data: justCompleted } = await supabase
    .from('bookings')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', booking.id)
    .neq('status', 'completed')
    .select('id');

  // Send the "rate your provider" push only on the real transition to
  // completed (not on idempotent re-runs of capture_balance).
  if (justCompleted && justCompleted.length > 0) {
    await fireNotify('notify-job-complete', { booking_id: booking.id });
  }

  if (!booking.provider_id) return;

  const payoutAmount = Number(booking.provider_payout ?? 0);

  // One payout row per booking.
  const { data: existingPayout } = await supabase
    .from('payouts')
    .select('id, booking_id, amount, status, stripe_transfer_id')
    .eq('booking_id', booking.id)
    .maybeSingle();

  let payoutRow = existingPayout;

  if (!payoutRow && payoutAmount > 0) {
    const { data: inserted } = await supabase
      .from('payouts')
      .insert({
        provider_id: booking.provider_id,
        booking_id: booking.id,
        amount: payoutAmount,
        status: 'pending',
      })
      .select('id, booking_id, amount, status, stripe_transfer_id')
      .single();
    payoutRow = inserted ?? null;
  }

  // Bump the provider's completed-job count, and grab the Connect account in
  // the same read so we can move the money.
  const { data: profile } = await supabase
    .from('provider_profiles')
    .select('total_jobs, stripe_account_id')
    .eq('id', booking.provider_id)
    .single();

  if (profile) {
    await supabase
      .from('provider_profiles')
      .update({ total_jobs: (profile.total_jobs ?? 0) + 1 })
      .eq('id', booking.provider_id);
  }

  // Move real money to the provider. Requires a Connect account; if onboarding
  // isn't done yet the payout stays pending and is drained when connect_status
  // flips them to approved.
  if (payoutRow && profile?.stripe_account_id) {
    await transferPayout(payoutRow, profile.stripe_account_id);
  }
}

// Create a Stripe transfer for a single pending payout and mark it paid. Safe
// to call repeatedly: skips payouts that aren't pending or already have a
// transfer, and leaves the row pending (logged) on Stripe failure so a later
// drain can retry — never throws into the caller's completion path.
async function transferPayout(
  payout: {
    id: string;
    booking_id: string | null;
    amount: number | null;
    status: string | null;
    stripe_transfer_id: string | null;
  },
  stripeAccountId: string,
): Promise<void> {
  if (payout.status !== 'pending' || payout.stripe_transfer_id) return;

  const amountCents = Math.round(Number(payout.amount ?? 0) * 100);
  if (amountCents <= 0) return;

  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: stripeAccountId,
      transfer_group: payout.booking_id ?? undefined,
      metadata: { booking_id: payout.booking_id ?? '', payout_id: payout.id },
    });
  } catch (err) {
    // Decline / insufficient platform balance — leave pending for retry.
    console.warn(`transfer failed for payout ${payout.id}`, err);
    return;
  }

  await supabase
    .from('payouts')
    .update({
      status: 'paid',
      stripe_transfer_id: transfer.id,
      paid_at: new Date().toISOString(),
    })
    .eq('id', payout.id);

  if (payout.booking_id) {
    await fireNotify('notify-payout-processed', { booking_id: payout.booking_id });
  }
}

// ── Stripe webhook events ─────────────────────────────────────────────

async function handleStripeWebhook(req: Request, signature: string): Promise<Response> {
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!webhookSecret) {
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      await onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case 'payment_intent.payment_failed':
      await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    // payout.paid fires on the provider's Connected account — requires
    // listening to Connect events. Handled in a future iteration.
    default:
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function onPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const { booking_id, payment_type } = paymentIntent.metadata;

  await supabase
    .from('payments')
    .update({ status: 'succeeded', processed_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntent.id);

  // Deposit success → move the booking into the manual provider-approval
  // window (Blocker #4). The provider must accept within 2 hours or the
  // booking auto-cancels and the deposit is refunded (expire_pending_approvals).
  // Deposit success does NOT confirm the booking — accept_booking does.
  if (payment_type === 'deposit' && booking_id) {
    const expiresAt = new Date(Date.now() + APPROVAL_WINDOW_MS).toISOString();
    const { data: awaiting } = await supabase
      .from('bookings')
      .update({
        status: 'pending_provider_approval',
        approval_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking_id)
      .eq('status', 'pending') // Guard: only move forward if still pending.
      .select('id');

    // Only notify on the real pending → pending_provider_approval transition
    // so retried webhook deliveries don't double-send.
    if (awaiting && awaiting.length > 0) {
      await fireNotify('notify-booking-requested', { booking_id });
    }
  }
}

async function onPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  await supabase
    .from('payments')
    .update({ status: 'failed', processed_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}
