// stripe-webhook Edge Function
//
// App-invoked payment actions (via supabase.functions.invoke). Deployed with
// verify_jwt: true — Supabase rejects unauthenticated callers before any of
// the service-role work below runs.
//
// Stripe's own webhook deliveries do NOT arrive here. They go to the
// stripe-events function, which is deployed with verify_jwt: false (Stripe
// cannot attach a Supabase JWT) and authenticates via Stripe-Signature.
// Keeping them apart means this endpoint never has to be publicly reachable.
//
// Supported actions:
//        • create_deposit_intent — creates a Stripe PaymentIntent for the 15%
//          deposit and records a pending payment row. Returns the customer id
//          and an ephemeral key so the client can open PaymentSheet.
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
//        • submit_quote — provider prices an unpriced request: sets the start
//          inside the customer's arrival window, commits a duration, records
//          the itemised surcharges, and moves the booking to
//          pending_customer_approval. Charges nothing (§2: nothing is charged
//          until the customer approves the final price).
//        • decline_booking — provider declines; the booking is cancelled and
//          the deposit refunded to the customer.
//        • accept_quote — customer approves the quoted price; the deposit is
//          charged off-session to the card saved at request time, or the
//          client falls back to PaymentSheet when there is none.
//        • create_setup_intent / confirm_setup_intent — save the customer's
//          card when they send a request (no hold, no charge), then verify it
//          with Stripe and tell the provider the request is waiting.
//        • request_more_photos / provide_customer_info — the provider sends an
//          unpriced request back for more information; the customer returns it.
//        • adjust_job_duration / withdraw_adjustment / respond_adjustment — the
//          provider proposes a longer or dearer job on a confirmed booking and
//          the customer approves it, or declines and the booking is cancelled
//          with a full refund.
//        • propose_reschedule / respond_reschedule — either party proposes a new
//          start for a confirmed booking; only the other party can accept it.
//        • expire_pending_approvals — pg_cron sweep that auto-cancels and
//          refunds approvals still pending past their 2h deadline.
//        • connect_onboarding — creates/reuses a provider's Express account and
//          returns a hosted onboarding link.
//        • connect_status — re-checks onboarding after the provider returns and
//          drains any payouts stranded before the account became payable.
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno&no-check=true';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  appendLineItems,
  computeAcceptedAmounts,
  DEFAULT_PLATFORM_FEE_RATE,
  prepareAdjustment,
  prepareQuote,
  QUOTABLE_STATUSES,
  rescheduleResponseAllowed,
  validateInfoRequestNote,
  validateRescheduleStart,
  type BookingParty,
} from '../_shared/quote.ts';
import {
  CANCELLABLE_STATUSES,
  cancellationFeeApplies,
  describeOffSessionFailure,
  planDepositCollection,
} from '../_shared/bookingPolicy.ts';

// ── Clients ───────────────────────────────────────────────────────────

// Pinned API version — also handed to ephemeralKeys.create so the key the
// client SDK receives is scoped to the same version this function speaks.
const STRIPE_API_VERSION = '2023-10-16';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: STRIPE_API_VERSION,
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

// The manual provider-approval window (Blocker #4) is opened in stripe-events
// on deposit success, which stamps bookings.approval_expires_at. The sweep
// below reads that column directly, so the 2h constant lives there, not here.

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

// Turn a thrown Stripe error into a typed response instead of letting it
// bubble to the top-level catch, where the client only sees "Edge Function
// returned a non-2xx status code" with no clue what went wrong. Stripe's own
// message ("No such customer: cus_…") is the useful part, so pass it through.
function stripeError(context: string, err: unknown): Response {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`${context}: ${detail}`);
  return jsonResponse({ error: `${context}: ${detail}` }, 502);
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
    // Stripe webhook deliveries are NOT handled here — they land on the
    // stripe-events function, which is deployed with verify_jwt: false so
    // Stripe (which cannot send a Supabase JWT) can reach it, and which
    // authenticates via Stripe-Signature instead. This function stays
    // verify_jwt: true and serves app-invoked actions only.
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
    // submit_quote / adjust_job_duration / propose_reschedule. Validated in
    // ../_shared/quote.ts, never trusted as typed: this endpoint is reachable
    // with any authenticated user's JWT.
    estimated_duration_mins?: unknown;
    scheduled_at?: unknown;
    quote_line_items?: unknown;
    adjustment_line_items?: unknown;
    note?: unknown;
    approve?: unknown;
    accept?: unknown;
  };

  switch (body.action) {
    case 'create_deposit_intent':
      return await createDepositIntent(body as { action: string; booking_id: string; amount?: number });
    case 'capture_balance':
      return await captureBalance(body as { action: string; booking_id: string });
    case 'refund_deposit':
      return await refundDeposit(body as { action: string; booking_id: string });
    case 'cancel_booking':
      // Passed the request so the caller can be checked against the booking:
      // these two now also cancel unpriced requests and pending adjustments,
      // and a cancel reachable with anyone's token is a cancel of anyone's job.
      return await cancelBooking(req, body as { action: string; booking_id: string });
    case 'provider_cancel_booking':
      return await providerCancelBooking(req, body as { action: string; booking_id: string; reason?: string });
    case 'mark_no_show':
      return await markNoShow(body as { action: string; booking_id: string });
    case 'accept_booking':
      return await acceptBooking(body as { action: string; booking_id: string });
    case 'decline_booking':
      return await declineBooking(body as { action: string; booking_id: string; reason?: string });
    case 'submit_quote':
      // Passed the request, not just the body: submit_quote is the first action
      // here that has to know *who* is calling. See submitQuote.
      return await submitQuote(req, body);
    case 'accept_quote':
      // Same reason as submit_quote, with the opposite party: only the customer
      // named on the booking may approve its price. See acceptQuote.
      return await acceptQuote(req, body);
    // Every action below resolves the caller and checks which side of the
    // booking they are on before writing anything. See requireParty.
    case 'create_setup_intent':
      return await createSetupIntent(req, body);
    case 'confirm_setup_intent':
      return await confirmSetupIntent(req, body);
    case 'request_more_photos':
      return await requestMorePhotos(req, body);
    case 'provide_customer_info':
      return await provideCustomerInfo(req, body);
    case 'adjust_job_duration':
      return await adjustJobDuration(req, body);
    case 'withdraw_adjustment':
      return await withdrawAdjustment(req, body);
    case 'respond_adjustment':
      return await respondAdjustment(req, body);
    case 'propose_reschedule':
      return await proposeReschedule(req, body);
    case 'respond_reschedule':
      return await respondReschedule(req, body);
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
  amount?: number; // cents — ignored, see below
}): Promise<Response> {
  const { booking_id } = body;

  // Fetch booking to verify it exists and get the customer ID and the deposit.
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, customer_id, status, deposit_amount')
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

  // Charge what the row says, never what the caller asked for. body.amount is
  // accepted for compatibility with older clients and deliberately discarded:
  // this endpoint is reachable directly with any user's JWT, so trusting it
  // let the caller name their own deposit. The row's deposit_amount is derived
  // server-side by trg_derive_booking_amounts from the provider's published
  // prices, which is the only figure either party ever agreed to.
  const amount = Math.round(Number(booking.deposit_amount ?? 0) * 100);

  if (!Number.isFinite(amount) || amount <= 0) {
    return new Response(JSON.stringify({ error: 'Booking has no deposit to charge' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get or create the customer's Stripe customer ID.
  const stripeCustomer = await getOrCreateStripeCustomer(booking.customer_id);
  if (!stripeCustomer.ok) return stripeCustomer.response;
  const stripeCustomerId = stripeCustomer.customerId;

  // Ephemeral key — scopes the client SDK to this customer for the life of
  // the sheet so PaymentSheet can list and save their payment methods.
  let ephemeralKey: Stripe.EphemeralKey;
  let paymentIntent: Stripe.PaymentIntent;

  try {
    ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: STRIPE_API_VERSION },
    );

    // Create the Stripe PaymentIntent. The client confirms it using the
    // returned clientSecret via PaymentSheet in @stripe/stripe-react-native.
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: stripeCustomerId,
      // Cards only — deliberately NOT automatic_payment_methods. The deposit
      // is 15%; the remaining 85% is charged off-session by capture_balance
      // when the provider completes the job. Klarna cannot be reused
      // off-session at all, and ACH / Amazon Pay are unreliable or too slow
      // for it, so a non-card deposit would book fine and then strand the
      // provider's balance. Apple Pay, Google Pay and Link are card-backed
      // and still appear in the sheet under 'card'.
      payment_method_types: ['card'],
      // Save the card so the remaining 85% balance can be charged off-session
      // when the provider completes the job (Flow 5.6 capture_balance).
      setup_future_usage: 'off_session',
      metadata: {
        booking_id,
        payment_type: 'deposit',
      },
    });
  } catch (err) {
    // Surface the real Stripe message. A stale users.stripe_customer_id left
    // over from a rotated key lands here as "No such customer"; without this
    // the client only ever saw an opaque non-2xx.
    return stripeError('Could not start the deposit payment', err);
  }

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
      // PaymentSheet needs the customer + ephemeral key alongside the intent.
      customerId: stripeCustomerId,
      ephemeralKeySecret: ephemeralKey.secret,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

// Looks up the customer's Stripe customer id, creating one on first use.
// Shared by the deposit PaymentIntent and the request-time SetupIntent, which
// must land on the same Stripe customer: the balance and the quote-first
// deposit are both charged off-session against a card saved to it.
async function getOrCreateStripeCustomer(
  userId: string,
): Promise<{ ok: true; customerId: string } | { ok: false; response: Response }> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, stripe_customer_id')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    return { ok: false, response: jsonResponse({ error: 'Customer not found' }, 404) };
  }

  if (user.stripe_customer_id) {
    return { ok: true, customerId: user.stripe_customer_id };
  }

  let customerId: string;
  try {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
  } catch (err) {
    return { ok: false, response: stripeError('Could not create the Stripe customer', err) };
  }

  await supabase
    .from('users')
    .update({ stripe_customer_id: customerId })
    .eq('id', user.id);

  return { ok: true, customerId };
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
// Which statuses can be cancelled, and which of those carry the 24h fee or
// penalty, live in ../_shared/bookingPolicy.ts so Jest tests the shipping
// lists. In short: anything before the job starts can be cancelled; only a
// committed booking (awaiting approval, confirmed, en route) pays for it.
const cancellableStatuses: string[] = [...CANCELLABLE_STATUSES];

// Cleared on every cancellation. bookings_adjustment_state_check requires the
// adjustment columns to be empty on any status but pending_adjustment_approval,
// so a cancel that left them set would fail outright; a leftover reschedule
// proposal would render as a live question on a cancelled booking.
const CLEARED_PROPOSALS = {
  adjustment_duration_mins: null,
  adjustment_line_items: null,
  adjustment_total_amount: null,
  adjustment_reason: null,
  proposed_scheduled_at: null,
  reschedule_proposed_by: null,
};

// Whether the appointment is within the 24h late-cancel window.
function isWithinLateCancelWindow(scheduledAtIso: string | null): boolean {
  if (!scheduledAtIso) return false;
  const scheduled = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(scheduled)) return false;
  const diff = scheduled - Date.now();
  return diff >= 0 && diff <= LATE_CANCEL_WINDOW_MS;
}

// Customer-initiated cancellation. Outside 24h → full deposit refund. Within
// 24h → retain the $15 flat fee and refund the remainder of the deposit. No fee
// at all before the booking is committed, or while the provider's adjustment is
// waiting on the customer (see cancellationFeeApplies).
async function cancelBooking(
  req: Request,
  body: {
    action: string;
    booking_id: string;
  },
): Promise<Response> {
  const { booking_id } = body;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, scheduled_at, deposit_amount')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'customer');
  if (!party.ok) return party.response;

  if (!cancellableStatuses.includes(booking.status)) {
    return jsonResponse({ error: `Cannot cancel a booking in status ${booking.status}` }, 409);
  }

  const late =
    cancellationFeeApplies(booking.status) &&
    isWithinLateCancelWindow(booking.scheduled_at);
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
      ...CLEARED_PROPOSALS,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', cancellableStatuses)
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

// Provider-initiated cancellation — of a booking they had accepted, or of an
// unpriced request they are declining. The customer is made whole (full
// deposit refund, a no-op when nothing was charged) and the $25 penalty is
// recorded on the booking for ops to deduct from a future payout (no live
// charge in MVP).
async function providerCancelBooking(
  req: Request,
  body: {
    action: string;
    booking_id: string;
    reason?: string;
  },
): Promise<Response> {
  const { booking_id, reason } = body;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, scheduled_at')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'provider');
  if (!party.ok) return party.response;

  if (!cancellableStatuses.includes(booking.status)) {
    return jsonResponse({ error: `Cannot cancel a booking in status ${booking.status}` }, 409);
  }

  // Penalty only applies inside the 24h window (PRD: "Provider cancels within
  // 24h → $25 penalty"), and only once the booking is committed — declining an
  // unpriced request, or walking away from an adjustment the customer has not
  // answered, is not a broken commitment.
  const late =
    cancellationFeeApplies(booking.status) &&
    isWithinLateCancelWindow(booking.scheduled_at);
  const penaltyCents = late ? PROVIDER_CANCEL_PENALTY_CENTS : 0;

  const { data: cancelled, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: 'provider',
      cancellation_fee: late ? penaltyCents / 100 : null,
      declined_reason: reason ?? null,
      approval_expires_at: null,
      ...CLEARED_PROPOSALS,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', cancellableStatuses)
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
    // 0 when nothing had been charged (a declined request), so the customer is
    // not told about a deposit refund that never happened.
    refund_cents: 'refunded_amount' in refund ? refund.refunded_amount : 0,
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
    // 23P01 from bookings_no_provider_overlap: this provider already committed
    // to an overlapping job, buffers included. Requests do not reserve a slot —
    // several customers may hold one for the same window and the first accept
    // wins — so losing that race is an expected outcome, not a server fault.
    // 409 for the same reason as the guard below: the client should refetch and
    // show the day as it now stands.
    if (error.code === '23P01') {
      return jsonResponse(
        {
          error:
            'That time overlaps a job you have already confirmed. Decline this request or reschedule the other job.',
          code: 'slot_conflict',
        },
        409,
      );
    }
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

// ── Provider quote (Phase 3 / spec §3, §5) ────────────────────────────
//
// The provider prices an unpriced request. Everything this writes —
// estimated_duration_mins, quote_line_items, quoted_total_amount — is outside
// the client's grant list by design (§4), which is precisely why it is an
// action here rather than an app write.
//
// Charges nothing. §2 locked "nothing charged until the customer approves the
// final price", so the deposit moves to accept_quote and this call is free to
// be retried, re-quoted, or abandoned with no money to reason about.

// Resolve the calling user from the bearer token. verify_jwt: true has already
// rejected anyone without a valid JWT before this function runs, but it does
// not say *which* user called, and every action in this file is reachable with
// any authenticated user's token. Mirrors update-provider-location.
async function requireCaller(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return { ok: false, response: jsonResponse({ error: 'Missing authorization' }, 401) };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, response: jsonResponse({ error: 'Invalid session' }, 401) };
  }

  return { ok: true, userId: data.user.id };
}

// Resolve the caller AND which side of this booking they are on. requireCaller
// says who called; this says whether they may act on this booking at all, and
// as whom. `expected` narrows it to one side for actions only one party owns.
//
// A user on both sides of the same booking (a 'both'-role account that booked
// itself) resolves as the customer: every customer action is the safer one.
async function requireParty(
  req: Request,
  booking: { customer_id: string | null; provider_id: string | null },
  expected?: BookingParty,
): Promise<{ ok: true; party: BookingParty; userId: string } | { ok: false; response: Response }> {
  const caller = await requireCaller(req);
  if (!caller.ok) return caller;

  let party: BookingParty | null = null;
  if (booking.customer_id && booking.customer_id === caller.userId) {
    party = 'customer';
  } else if (booking.provider_id) {
    const { data: profile, error } = await supabase
      .from('provider_profiles')
      .select('user_id')
      .eq('id', booking.provider_id)
      .maybeSingle();
    if (error) return { ok: false, response: jsonResponse({ error: error.message }, 500) };
    if (profile?.user_id === caller.userId) party = 'provider';
  }

  if (!party || (expected && party !== expected)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Not authorized to act on this booking' }, 403),
    };
  }

  return { ok: true, party, userId: caller.userId };
}

async function submitQuote(
  req: Request,
  body: {
    booking_id?: string;
    estimated_duration_mins?: unknown;
    scheduled_at?: unknown;
    quote_line_items?: unknown;
  },
): Promise<Response> {
  const { booking_id } = body;

  if (!booking_id) {
    return jsonResponse({ error: 'booking_id is required' }, 400);
  }

  const caller = await requireCaller(req);
  if (!caller.ok) return caller.response;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, provider_id, status, total_amount, requested_window_start, requested_window_end',
    )
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  // Only the assigned provider may price this job. Without this check any
  // authenticated user could set a price on any booking — the one thing §4's
  // whole two-layer guard exists to prevent, reintroduced through the service
  // role's own back door.
  if (!booking.provider_id) {
    return jsonResponse({ error: 'Booking has no provider to quote it' }, 409);
  }

  const { data: profile, error: profileErr } = await supabase
    .from('provider_profiles')
    .select('id, user_id')
    .eq('id', booking.provider_id)
    .maybeSingle();

  if (profileErr) return jsonResponse({ error: profileErr.message }, 500);
  if (!profile || profile.user_id !== caller.userId) {
    return jsonResponse({ error: 'Not authorized to quote this booking' }, 403);
  }

  // Status is re-checked in the UPDATE below; this read is for the error
  // message, which is the difference between "you already quoted this" and a
  // bare 409.
  const quotableStatuses: string[] = [...QUOTABLE_STATUSES];

  if (!quotableStatuses.includes(booking.status)) {
    return jsonResponse(
      { error: `A booking in status ${booking.status} cannot be quoted` },
      409,
    );
  }

  // total_amount is the base derived at insert by trg_derive_booking_amounts
  // from the provider's published prices — subtotal plus the 2% service fee.
  // The surcharges add to it without the fee applying again, so the line items
  // the customer approves sum exactly to what they are charged.
  const prepared = prepareQuote(body, {
    baseTotalCents: Math.round(Number(booking.total_amount ?? 0) * 100),
    window: {
      start: booking.requested_window_start,
      end: booking.requested_window_end,
    },
    nowMs: Date.now(),
  });

  if (!prepared.ok) {
    return jsonResponse({ error: prepared.error }, 400);
  }

  const { scheduledAt, durationMins, lineItems, quotedTotalCents } = prepared.value;

  // Guarded transition, same shape as acceptBooking: if the customer cancelled
  // the request (or another tab already quoted it) between the read above and
  // here, this matches nothing and the provider is told to refetch.
  //
  // quoted_total_amount is deliberately the ONLY money column written.
  // total_amount and deposit_amount stay as they are: a quote is a proposal,
  // and captureBalance computes total_amount − deposit_amount, so moving either
  // one before the customer has agreed would silently rewrite the balance owed
  // on a job that was never re-agreed. Both belong to accept_quote, together.
  const { data: quoted, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'pending_customer_approval',
      scheduled_at: scheduledAt,
      estimated_duration_mins: durationMins,
      quote_line_items: lineItems,
      quoted_total_amount: quotedTotalCents / 100, // DB stores dollars
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .in('status', quotableStatuses)
    .select('id');

  if (updateErr) {
    // 23P01 is not expected here — bookings_no_provider_overlap only covers
    // confirmed/en_route/in_progress, and a quote lands in
    // pending_customer_approval, so a request still does not reserve time and
    // the first accept wins (§7). Mapped anyway so that if the constraint's
    // WHERE clause ever widens, the provider gets the real reason instead of a
    // 500.
    if (updateErr.code === '23P01') {
      return jsonResponse(
        {
          error:
            'That time overlaps a job you have already confirmed. Pick another start inside the window.',
          code: 'slot_conflict',
        },
        409,
      );
    }
    return jsonResponse({ error: updateErr.message }, 500);
  }

  if (!quoted || quoted.length === 0) {
    return jsonResponse({ error: 'This request is no longer awaiting a quote' }, 409);
  }

  // TODO(Phase 3): notify-quote-ready does not exist yet — spec §5 lists it
  // alongside notify-eta-changed. fireNotify swallows the failure, so this is
  // an inert warning rather than a broken quote until that function lands.
  await fireNotify('notify-quote-ready', { booking_id });

  return jsonResponse(
    {
      ok: true,
      status: 'pending_customer_approval',
      scheduled_at: scheduledAt,
      estimated_duration_mins: durationMins,
      quoted_total_cents: quotedTotalCents,
      quote_line_items: lineItems,
    },
    200,
  );
}

// ── Customer approves the quote (Phase 3 / spec §3, §5) ───────────────
//
// The counterpart to submit_quote, and the point where a proposal becomes the
// money owed. It writes the four columns submit_quote deliberately left alone —
// total_amount, deposit_amount, platform_fee, provider_payout — and moves the
// booking to 'pending'.
//
// Why 'pending' and not straight to 'confirmed': the deposit has not been
// collected yet. 'pending' means exactly "the booking exists, nothing has been
// charged", which is the state createDepositIntent requires, so the customer's
// client opens PaymentSheet immediately afterwards through the existing path.
//
// The deposit is charged here (§5: SetupIntent at request, off-session charge
// at approval, one tap). The card is the one create_setup_intent saved when the
// customer sent the request. When there is none — a request sent before card
// saving existed, or one whose sheet never completed — or the bank refuses the
// off-session charge (a decline, or 3-D Secure wanting the customer present),
// the booking stays at 'pending' and the response says 'requires_deposit', so
// the client falls back to the on-session PaymentSheet through
// createDepositIntent. Either way the client never asserts the payment worked:
// stripe-events confirms the booking on the signed payment_intent.succeeded.
//
// ⚠️ Pairs with a change in stripe-events: on deposit success a booking whose
// quoted_total_amount is non-null must be promoted to 'confirmed', not to
// 'pending_provider_approval' — the provider already committed by quoting, and
// asking them to approve again would strand the job. That column is NULL for
// every pre-quote booking, so the legacy promotion is untouched by construction.
async function acceptQuote(
  req: Request,
  body: { booking_id?: string },
): Promise<Response> {
  const { booking_id } = body;

  if (!booking_id) {
    return jsonResponse({ error: 'booking_id is required' }, 400);
  }

  const caller = await requireCaller(req);
  if (!caller.ok) return caller.response;

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, provider_id, status, service_fee, quoted_total_amount, stripe_setup_intent_id',
    )
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  // Only the customer on the booking may approve its price. bookings.customer_id
  // is a users.id, which is the auth uid, so this compares directly — unlike
  // submit_quote, which has to hop through provider_profiles.user_id.
  if (booking.customer_id !== caller.userId) {
    return jsonResponse({ error: 'Not authorized to approve this quote' }, 403);
  }

  if (booking.status !== 'pending_customer_approval') {
    return jsonResponse(
      { error: `A booking in status ${booking.status} has no quote to approve` },
      409,
    );
  }

  // What the provider actually charges against. A booking sitting in
  // pending_customer_approval without one would be a submit_quote bug, but
  // approving it would confirm a job for nothing, so it is refused here too.
  const quotedTotalCents = Math.round(Number(booking.quoted_total_amount ?? 0) * 100);

  // Anything already collected is authoritative over a recomputed percentage.
  // See computeAcceptedAmounts: recomputing on a re-quote silently collects
  // 0.15A + 0.85B instead of B.
  const { data: paidDeposit, error: depositErr } = await supabase
    .from('payments')
    .select('id, amount')
    .eq('booking_id', booking_id)
    .eq('payment_type', 'deposit')
    .eq('status', 'succeeded')
    .maybeSingle();

  if (depositErr) return jsonResponse({ error: depositErr.message }, 500);

  const { data: profile, error: profileErr } = await supabase
    .from('provider_profiles')
    .select('platform_fee_rate')
    .eq('id', booking.provider_id)
    .maybeSingle();

  if (profileErr) return jsonResponse({ error: profileErr.message }, 500);
  if (!profile) return jsonResponse({ error: 'Provider not found for booking' }, 409);

  const amounts = computeAcceptedAmounts({
    quotedTotalCents,
    serviceFeeCents: Math.round(Number(booking.service_fee ?? 0) * 100),
    // COALESCE, matching derive_booking_amounts: a null rate is the default,
    // not a free job. The Founding Provider trigger writes a real 0 for the
    // first 100 approved providers and that must survive as zero.
    platformFeeRate: Number(profile.platform_fee_rate ?? DEFAULT_PLATFORM_FEE_RATE),
    chargedDepositCents: paidDeposit
      ? Math.round(Number(paidDeposit.amount) * 100)
      : null,
  });

  if (!amounts.ok) {
    return jsonResponse({ error: amounts.error }, 409);
  }

  const { totalCents, depositCents, platformFeeCents, providerPayoutCents } =
    amounts.value;

  // How the deposit gets collected. Decided before the guarded update so an
  // unusable card routes straight to the PaymentSheet fallback.
  const saved = paidDeposit ? null : await savedCardFor(booking.stripe_setup_intent_id);
  const plan = planDepositCollection({
    hasSucceededDeposit: Boolean(paidDeposit),
    savedPaymentMethodId: saved?.paymentMethodId ?? null,
  });

  // A re-approval with a deposit already taken has nothing left to collect, so
  // it confirms here: stripe-events only promotes a booking on a deposit that
  // has not happened yet, and 'pending' would strand it. Every first approval
  // returns to 'pending' — "exists, nothing charged" — which is the state both
  // the off-session charge below and createDepositIntent require.
  const nextStatus = plan === 'already_paid' ? 'confirmed' : 'pending';
  const now = new Date().toISOString();

  // Guarded on the approval state, same shape as acceptBooking: if the provider
  // re-quoted or either party cancelled between the read above and here, this
  // matches nothing and the customer is told to refetch rather than approving a
  // price that has since moved.
  const { data: approved, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: nextStatus,
      ...(nextStatus === 'confirmed' ? { confirmed_at: now } : {}),
      total_amount: totalCents / 100, // DB stores dollars
      deposit_amount: depositCents / 100,
      platform_fee: platformFeeCents / 100,
      provider_payout: providerPayoutCents / 100,
      updated_at: now,
    })
    .eq('id', booking_id)
    .eq('status', 'pending_customer_approval')
    .select('id');

  if (updateErr) {
    // Reachable only on the already_paid path, the one that lands in a status
    // the overlap guard covers.
    if (updateErr.code === '23P01') {
      return jsonResponse(
        {
          error: 'The provider no longer has room for this time. Ask them to re-quote.',
          code: 'slot_conflict',
        },
        409,
      );
    }
    return jsonResponse({ error: updateErr.message }, 500);
  }

  if (!approved || approved.length === 0) {
    return jsonResponse(
      { error: 'This quote is no longer awaiting your approval' },
      409,
    );
  }

  if (plan === 'already_paid') {
    await fireNotify('notify-booking-confirmed', { booking_id });
    return jsonResponse(
      {
        ok: true,
        status: 'confirmed',
        next: 'none',
        total_cents: totalCents,
        deposit_cents: depositCents,
      },
      200,
    );
  }

  if (plan === 'charge_saved_card' && saved) {
    const charge = await chargeDepositOffSession({
      bookingId: booking_id,
      userId: booking.customer_id,
      customerId: saved.customerId,
      paymentMethodId: saved.paymentMethodId,
      amountCents: depositCents,
    });

    if (charge.ok) {
      return jsonResponse(
        {
          ok: true,
          status: 'pending',
          // Submitted, not succeeded. stripe-events confirms the booking when
          // Stripe says the charge landed; the client shows "processing".
          next: 'deposit_processing',
          total_cents: totalCents,
          deposit_cents: depositCents,
        },
        200,
      );
    }

    // The approval stands and the booking sits at 'pending', exactly as it
    // would have with no saved card. Fall through to the PaymentSheet, with
    // the reason, so the customer can confirm with their bank or use another
    // card without re-approving the price.
    return jsonResponse(
      {
        ok: true,
        status: 'pending',
        next: 'requires_deposit',
        charge_error: charge.message,
        total_cents: totalCents,
        deposit_cents: depositCents,
      },
      200,
    );
  }

  return jsonResponse(
    {
      ok: true,
      status: 'pending',
      // The client's next step, named rather than inferred: it must open
      // PaymentSheet through createDepositIntent. Per the payment rules the
      // client never asserts that a payment succeeded, so this says what is
      // owed, not that anything has been collected.
      next: 'requires_deposit',
      total_cents: totalCents,
      deposit_cents: depositCents,
    },
    200,
  );
}

// The card a SetupIntent saved, if it saved one. Stripe is asked directly —
// never the client — and anything short of 'succeeded' means there is no card
// to charge, which routes the approval to the PaymentSheet fallback.
async function savedCardFor(
  setupIntentId: string | null,
): Promise<{ customerId: string; paymentMethodId: string } | null> {
  if (!setupIntentId) return null;
  try {
    const intent = await stripe.setupIntents.retrieve(setupIntentId);
    if (intent.status !== 'succeeded') return null;
    const paymentMethodId =
      typeof intent.payment_method === 'string'
        ? intent.payment_method
        : intent.payment_method?.id ?? null;
    const customerId =
      typeof intent.customer === 'string' ? intent.customer : intent.customer?.id ?? null;
    if (!paymentMethodId || !customerId) return null;
    return { customerId, paymentMethodId };
  } catch (err) {
    console.warn(`savedCardFor ${setupIntentId} failed`, err);
    return null;
  }
}

// Charge the deposit against a saved card with the customer absent.
//
// Created, recorded, THEN confirmed. Confirming in the create call would let
// payment_intent.succeeded reach stripe-events before the payments row exists,
// and that handler marks the row by PaymentIntent id — it would match nothing,
// leaving the deposit 'pending' forever, and refunds and the balance capture
// both look for a 'succeeded' deposit.
async function chargeDepositOffSession(input: {
  bookingId: string;
  userId: string;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
}): Promise<{ ok: true; paymentIntentId: string } | { ok: false; message: string }> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: input.amountCents,
      currency: 'usd',
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      // Cards only, for the reason createDepositIntent gives.
      payment_method_types: ['card'],
      metadata: { booking_id: input.bookingId, payment_type: 'deposit' },
    });
  } catch (err) {
    console.error(`deposit intent create failed for ${input.bookingId}`, err);
    return { ok: false, message: describeOffSessionFailure(null) };
  }

  const { error: insertError } = await supabase.from('payments').insert({
    booking_id: input.bookingId,
    user_id: input.userId,
    stripe_payment_intent_id: intent.id,
    payment_type: 'deposit',
    amount: input.amountCents / 100, // DB stores dollars
    status: 'pending',
  });

  if (insertError) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return { ok: false, message: 'Could not record the payment.' };
  }

  try {
    await stripe.paymentIntents.confirm(intent.id, { off_session: true });
    return { ok: true, paymentIntentId: intent.id };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? null;
    await supabase
      .from('payments')
      .update({ status: 'failed', processed_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', intent.id);
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return { ok: false, message: describeOffSessionFailure(code) };
  }
}

// ── Card saved at request time (Phase 3 / spec §2, §5) ────────────────
//
// §2: "Card collection — saved at request (SetupIntent — no hold, no charge);
// deposit charges at approval". The customer's app creates the unpriced row,
// then calls create_setup_intent and opens PaymentSheet in setup mode. Nothing
// is charged and nothing is held. accept_quote later charges the deposit
// against the payment method this saves.

// Statuses a customer may (re)save a card in: while the request is waiting on
// the provider, or on them.
const SETUP_INTENT_STATUSES = [
  'pending_provider_quote',
  'awaiting_customer_info',
  'pending_customer_approval',
];

async function createSetupIntent(
  req: Request,
  body: { booking_id?: string },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'customer');
  if (!party.ok) return party.response;

  if (!SETUP_INTENT_STATUSES.includes(booking.status)) {
    return jsonResponse(
      { error: `A booking in status ${booking.status} cannot save a card` },
      409,
    );
  }

  const stripeCustomer = await getOrCreateStripeCustomer(party.userId);
  if (!stripeCustomer.ok) return stripeCustomer.response;

  let ephemeralKey: Stripe.EphemeralKey;
  let setupIntent: Stripe.SetupIntent;
  try {
    ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomer.customerId },
      { apiVersion: STRIPE_API_VERSION },
    );
    setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomer.customerId,
      // Charged later with the customer absent: the deposit at approval and
      // the balance at completion.
      usage: 'off_session',
      // Cards only, for the reason createDepositIntent gives: a non-card method
      // cannot be reliably charged off-session, which is the whole point.
      payment_method_types: ['card'],
      metadata: { booking_id, purpose: 'quote_request' },
    });
  } catch (err) {
    return stripeError('Could not start saving the card', err);
  }

  const { error: saveErr } = await supabase
    .from('bookings')
    .update({ stripe_setup_intent_id: setupIntent.id, updated_at: new Date().toISOString() })
    .eq('id', booking_id);

  if (saveErr) {
    // A card saved to an intent the booking does not know about is a card
    // accept_quote cannot find. Cancel it rather than leave the customer
    // believing it was saved for this job.
    await stripe.setupIntents.cancel(setupIntent.id).catch(() => undefined);
    return jsonResponse({ error: 'Failed to record the card setup' }, 500);
  }

  return jsonResponse(
    {
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId: stripeCustomer.customerId,
      ephemeralKeySecret: ephemeralKey.secret,
    },
    200,
  );
}

// Called after the setup sheet closes without error. The client does not get
// to say the card was saved: Stripe is asked, and only a 'succeeded' intent
// counts. On success the provider is told the request is waiting — this is the
// moment it becomes a real request rather than a half-finished form.
async function confirmSetupIntent(
  req: Request,
  body: { booking_id?: string },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, stripe_setup_intent_id')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'customer');
  if (!party.ok) return party.response;

  const saved = await savedCardFor(booking.stripe_setup_intent_id);
  if (!saved) {
    return jsonResponse({ error: 'The card has not been saved yet', card_saved: false }, 409);
  }

  if (booking.status === 'pending_provider_quote') {
    await fireNotify('notify-quote-requested', { booking_id });
  }

  return jsonResponse({ ok: true, card_saved: true }, 200);
}

// ── More information (§7 "photos unusable") ───────────────────────────
//
// Rather than declining a request it cannot price, the provider sends it back
// with a note. Nothing has been charged in either state, so this is a status
// move and a push, nothing more.

async function requestMorePhotos(
  req: Request,
  body: { booking_id?: string; note?: unknown },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const note = validateInfoRequestNote(body.note);
  if (!note.ok) return jsonResponse({ error: note.error }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'provider');
  if (!party.ok) return party.response;

  const { data: parked, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'awaiting_customer_info',
      info_request_note: note.value,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'pending_provider_quote')
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!parked || parked.length === 0) {
    return jsonResponse({ error: 'This request is no longer waiting on your quote' }, 409);
  }

  await fireNotify('notify-photos-requested', { booking_id });
  return jsonResponse({ ok: true, status: 'awaiting_customer_info' }, 200);
}

// The customer has added what was asked for (photos, a different window) and
// hands the request back. The note is kept so the provider can see what they
// asked for when they pick it up again.
async function provideCustomerInfo(
  req: Request,
  body: { booking_id?: string },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'customer');
  if (!party.ok) return party.response;

  const { data: returned, error: updateErr } = await supabase
    .from('bookings')
    .update({ status: 'pending_provider_quote', updated_at: new Date().toISOString() })
    .eq('id', booking_id)
    .eq('status', 'awaiting_customer_info')
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!returned || returned.length === 0) {
    return jsonResponse({ error: 'This request is not waiting on you' }, 409);
  }

  await fireNotify('notify-quote-requested', { booking_id, resubmitted: true });
  return jsonResponse({ ok: true, status: 'pending_provider_quote' }, 200);
}

// ── Adjustment (§7 "vehicle worse than declared on arrival") ──────────
//
// The provider proposes a new duration and any extra charges on a confirmed
// job. Nothing agreed moves until the customer approves: the proposal lives in
// the adjustment_* columns, and total_amount, deposit_amount and
// estimated_duration_mins stay as they were. pending_adjustment_approval is
// covered by the overlap guard (20260822000000), so the slot stays held.
//
// If the customer declines, the booking is cancelled with a full refund and no
// fee — the provider asked to change the deal and the customer said no, which
// is nobody's fault. Either side can also cancel penalty-free while it is open
// (see cancellationFeeApplies).

// Read back whenever an adjustment is in play. One literal, not a
// concatenation: supabase-js parses the select string at the type level, and a
// built-up string types every row as an error.
const ADJUSTMENT_COLUMNS =
  'id, customer_id, provider_id, status, total_amount, service_fee, estimated_duration_mins, quote_line_items, adjustment_duration_mins, adjustment_line_items, adjustment_total_amount, adjustment_reason';

// The adjustment columns emptied, for every exit from the waiting state.
const CLEARED_ADJUSTMENT = {
  adjustment_duration_mins: null,
  adjustment_line_items: null,
  adjustment_total_amount: null,
  adjustment_reason: null,
};

async function succeededDepositCents(bookingId: string): Promise<
  { ok: true; cents: number | null } | { ok: false; response: Response }
> {
  const { data, error } = await supabase
    .from('payments')
    .select('amount')
    .eq('booking_id', bookingId)
    .eq('payment_type', 'deposit')
    .eq('status', 'succeeded')
    .maybeSingle();
  if (error) return { ok: false, response: jsonResponse({ error: error.message }, 500) };
  return { ok: true, cents: data ? Math.round(Number(data.amount) * 100) : null };
}

async function adjustJobDuration(
  req: Request,
  body: {
    booking_id?: string;
    estimated_duration_mins?: unknown;
    adjustment_line_items?: unknown;
    reason?: unknown;
  },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(ADJUSTMENT_COLUMNS)
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'provider');
  if (!party.ok) return party.response;

  if (booking.status !== 'confirmed') {
    return jsonResponse(
      { error: `A booking in status ${booking.status} cannot be adjusted` },
      409,
    );
  }

  const deposit = await succeededDepositCents(booking_id);
  if (!deposit.ok) return deposit.response;

  const prepared = prepareAdjustment(
    {
      estimated_duration_mins: body.estimated_duration_mins,
      adjustment_line_items: body.adjustment_line_items,
      reason: body.reason,
    },
    {
      currentTotalCents: Math.round(Number(booking.total_amount ?? 0) * 100),
      currentDurationMins: booking.estimated_duration_mins,
      chargedDepositCents: deposit.cents,
    },
  );
  if (!prepared.ok) return jsonResponse({ error: prepared.error }, 400);

  const { durationMins, lineItems, reason, adjustedTotalCents } = prepared.value;

  const { data: proposed, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'pending_adjustment_approval',
      adjustment_duration_mins: durationMins,
      adjustment_line_items: lineItems,
      adjustment_total_amount: adjustedTotalCents / 100, // DB stores dollars
      adjustment_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'confirmed')
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!proposed || proposed.length === 0) {
    return jsonResponse({ error: 'This booking is no longer confirmed' }, 409);
  }

  await fireNotify('notify-adjustment-proposed', { booking_id });

  return jsonResponse(
    {
      ok: true,
      status: 'pending_adjustment_approval',
      adjustment_duration_mins: durationMins,
      adjustment_total_cents: adjustedTotalCents,
      adjustment_line_items: lineItems,
    },
    200,
  );
}

// The provider takes the proposal back before the customer answers, and the
// job carries on as agreed.
async function withdrawAdjustment(
  req: Request,
  body: { booking_id?: string },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'provider');
  if (!party.ok) return party.response;

  const { data: withdrawn, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      ...CLEARED_ADJUSTMENT,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'pending_adjustment_approval')
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!withdrawn || withdrawn.length === 0) {
    return jsonResponse({ error: 'There is no pending change to withdraw' }, 409);
  }

  return jsonResponse({ ok: true, status: 'confirmed' }, 200);
}

async function respondAdjustment(
  req: Request,
  body: { booking_id?: string; approve?: unknown },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);
  if (typeof body.approve !== 'boolean') {
    return jsonResponse({ error: 'approve must be true or false' }, 400);
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(ADJUSTMENT_COLUMNS)
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking, 'customer');
  if (!party.ok) return party.response;

  if (booking.status !== 'pending_adjustment_approval') {
    return jsonResponse({ error: 'There is no change waiting on you' }, 409);
  }

  if (!body.approve) {
    return await declineAdjustment(booking_id, booking.adjustment_total_amount);
  }

  const deposit = await succeededDepositCents(booking_id);
  if (!deposit.ok) return deposit.response;

  const { data: profile, error: profileErr } = await supabase
    .from('provider_profiles')
    .select('platform_fee_rate')
    .eq('id', booking.provider_id)
    .maybeSingle();

  if (profileErr) return jsonResponse({ error: profileErr.message }, 500);
  if (!profile) return jsonResponse({ error: 'Provider not found for booking' }, 409);

  // Same arithmetic as a quote approval, for the same two reasons: the deposit
  // already charged is kept as recorded so the balance still sums to what the
  // customer agreed, and the provider's payout grows with the new charges.
  const amounts = computeAcceptedAmounts({
    quotedTotalCents: Math.round(Number(booking.adjustment_total_amount ?? 0) * 100),
    serviceFeeCents: Math.round(Number(booking.service_fee ?? 0) * 100),
    platformFeeRate: Number(profile.platform_fee_rate ?? DEFAULT_PLATFORM_FEE_RATE),
    chargedDepositCents: deposit.cents,
  });
  if (!amounts.ok) return jsonResponse({ error: amounts.error }, 409);

  const { totalCents, depositCents, platformFeeCents, providerPayoutCents } =
    amounts.value;

  // The itemisation the booking carries afterwards: whatever the quote had,
  // then the new charges, so base + items still sums to the total.
  const addedItems = appendLineItems(booking.adjustment_line_items, []);
  const lineItems = appendLineItems(booking.quote_line_items, addedItems);

  // Guarded on the exact proposal read above as well as the status, so a
  // proposal withdrawn and re-made between the read and here is not approved
  // on the strength of the old one.
  const { data: approved, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      estimated_duration_mins: booking.adjustment_duration_mins,
      total_amount: totalCents / 100,
      deposit_amount: depositCents / 100,
      platform_fee: platformFeeCents / 100,
      provider_payout: providerPayoutCents / 100,
      quote_line_items: lineItems,
      quoted_total_amount: totalCents / 100,
      ...CLEARED_ADJUSTMENT,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'pending_adjustment_approval')
    .eq('adjustment_total_amount', booking.adjustment_total_amount)
    .select('id');

  if (updateErr) {
    // A longer job can run into the provider's next one. The proposal stays
    // open; the provider has to shorten it or move the other job.
    if (updateErr.code === '23P01') {
      return jsonResponse(
        {
          error:
            'The longer job would overlap another booking on the provider’s calendar. They need to change the proposal.',
          code: 'slot_conflict',
        },
        409,
      );
    }
    return jsonResponse({ error: updateErr.message }, 500);
  }

  if (!approved || approved.length === 0) {
    return jsonResponse({ error: 'The proposed change has been replaced. Refresh and review it again.' }, 409);
  }

  await fireNotify('notify-adjustment-approved', { booking_id });

  return jsonResponse(
    { ok: true, status: 'confirmed', total_cents: totalCents, deposit_cents: depositCents },
    200,
  );
}

// Declining cancels the booking with a full deposit refund and no fee.
async function declineAdjustment(
  bookingId: string,
  proposedTotal: number | null,
): Promise<Response> {
  const { data: cancelled, error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_by: 'customer',
      cancellation_fee: null,
      deposit_forfeited: false,
      declined_reason: 'Customer declined the provider’s proposed change',
      approval_expires_at: null,
      ...CLEARED_PROPOSALS,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('status', 'pending_adjustment_approval')
    .eq('adjustment_total_amount', proposedTotal)
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!cancelled || cancelled.length === 0) {
    return jsonResponse({ error: 'The proposed change has been replaced. Refresh and review it again.' }, 409);
  }

  const refund = await issueDepositRefund(bookingId, 'requested_by_customer');
  if (!refund.ok) {
    return jsonResponse({ error: refund.error, cancelled: true }, refund.status);
  }

  await fireNotify('notify-booking-cancelled', {
    booking_id: bookingId,
    cancelled_by: 'customer',
    fee_cents: 0,
    refund_cents: 'refunded_amount' in refund ? refund.refunded_amount : 0,
  });

  return jsonResponse({ ok: true, status: 'cancelled', refund }, 200);
}

// ── Reschedule (confirmed bookings, either party) ─────────────────────
//
// A confirmed start is a commitment on both sides, so neither side moves it
// alone. One party proposes; the booking keeps its current start — and its
// slot — until the other accepts. The client lost its UPDATE on scheduled_at
// in 20260822000000 for the same reason.

async function proposeReschedule(
  req: Request,
  body: { booking_id?: string; scheduled_at?: unknown },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, customer_id, provider_id, status, scheduled_at')
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking);
  if (!party.ok) return party.response;

  if (booking.status !== 'confirmed') {
    return jsonResponse(
      { error: `A booking in status ${booking.status} cannot be rescheduled` },
      409,
    );
  }

  const start = validateRescheduleStart(body.scheduled_at, {
    currentScheduledAt: booking.scheduled_at,
    nowMs: Date.now(),
  });
  if (!start.ok) return jsonResponse({ error: start.error }, 400);

  // A new proposal replaces any open one, from either side — a counter-offer
  // is just a proposal from the other party.
  const { data: proposed, error: updateErr } = await supabase
    .from('bookings')
    .update({
      proposed_scheduled_at: start.value,
      reschedule_proposed_by: party.party,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'confirmed')
    .select('id');

  if (updateErr) return jsonResponse({ error: updateErr.message }, 500);
  if (!proposed || proposed.length === 0) {
    return jsonResponse({ error: 'This booking is no longer confirmed' }, 409);
  }

  await fireNotify('notify-reschedule-proposed', { booking_id });

  return jsonResponse(
    { ok: true, proposed_scheduled_at: start.value, proposed_by: party.party },
    200,
  );
}

async function respondReschedule(
  req: Request,
  body: { booking_id?: string; accept?: unknown },
): Promise<Response> {
  const { booking_id } = body;
  if (!booking_id) return jsonResponse({ error: 'booking_id is required' }, 400);
  if (typeof body.accept !== 'boolean') {
    return jsonResponse({ error: 'accept must be true or false' }, 400);
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, provider_id, status, proposed_scheduled_at, reschedule_proposed_by',
    )
    .eq('id', booking_id)
    .maybeSingle();

  if (fetchErr) return jsonResponse({ error: fetchErr.message }, 500);
  if (!booking) return jsonResponse({ error: 'Booking not found' }, 404);

  const party = await requireParty(req, booking);
  if (!party.ok) return party.response;

  if (
    booking.status !== 'confirmed' ||
    !booking.proposed_scheduled_at ||
    (booking.reschedule_proposed_by !== 'customer' &&
      booking.reschedule_proposed_by !== 'provider')
  ) {
    return jsonResponse({ error: 'There is no new time waiting for an answer' }, 409);
  }

  const proposedBy: BookingParty = booking.reschedule_proposed_by;
  const decision = rescheduleResponseAllowed(party.party, proposedBy, body.accept);
  if (!decision.ok) return jsonResponse({ error: decision.error }, 403);

  const cleared = { proposed_scheduled_at: null, reschedule_proposed_by: null };

  // Guarded on the exact proposal read above, so a counter-proposal that
  // landed in between is not accepted on the strength of this one.
  const { data: resolved, error: updateErr } = await supabase
    .from('bookings')
    .update({
      ...(decision.value === 'accept' ? { scheduled_at: booking.proposed_scheduled_at } : {}),
      ...cleared,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking_id)
    .eq('status', 'confirmed')
    .eq('proposed_scheduled_at', booking.proposed_scheduled_at)
    .select('id');

  if (updateErr) {
    if (updateErr.code === '23P01') {
      return jsonResponse(
        {
          error:
            'That time overlaps another confirmed job on the provider’s calendar. Propose a different time.',
          code: 'slot_conflict',
        },
        409,
      );
    }
    return jsonResponse({ error: updateErr.message }, 500);
  }

  if (!resolved || resolved.length === 0) {
    return jsonResponse({ error: 'The proposed time has changed. Refresh and review it again.' }, 409);
  }

  // The proposer hears the answer; a withdrawal tells nobody, since the other
  // party had not acted on it.
  if (decision.value !== 'withdraw') {
    await fireNotify('notify-reschedule-resolved', {
      booking_id,
      notify_party: proposedBy,
      accepted: decision.value === 'accept',
      scheduled_at: booking.proposed_scheduled_at,
    });
  }

  return jsonResponse(
    {
      ok: true,
      outcome: decision.value,
      ...(decision.value === 'accept' ? { scheduled_at: booking.proposed_scheduled_at } : {}),
    },
    200,
  );
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

  // The customer has not agreed to the price this would charge. The balance is
  // total_amount − deposit_amount, and total_amount only moves when they
  // approve the adjustment (respond_adjustment).
  if (booking.status === 'pending_adjustment_approval') {
    return jsonResponse(
      { error: 'The customer has not answered your proposed change yet' },
      409,
    );
  }

  // Non-Negotiable #3: a job cannot be completed without the minimum number of
  // before/after photos. The client enforces this too (Flow 5.5) but the gate
  // must live here so the rule can't be bypassed via a direct API call. Skip
  // the check on idempotent re-runs of an already-captured booking below.
  // before/after only. Intake photos are the customer's, taken before the job
  // was even priced, and say nothing about whether it was done — counting them
  // would let four request photos satisfy the completion gate.
  const { count: photoCount, error: photoError } = await supabase
    .from('booking_photos')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', booking_id)
    .in('photo_type', ['before', 'after']);

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

