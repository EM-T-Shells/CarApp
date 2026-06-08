// stripe-webhook Edge Function
//
// Handles two types of inbound requests:
//   1. App-invoked actions (via supabase.functions.invoke) — identified by the
//      absence of a Stripe-Signature header. Currently supports:
//        • create_deposit_intent — creates a Stripe PaymentIntent for the 15%
//          deposit and records a pending payment row.
//
//   2. Stripe webhook events (from Stripe's servers) — identified by the
//      Stripe-Signature header. Signature is verified before processing.
//      Currently handles:
//        • payment_intent.succeeded — marks payment succeeded; confirms booking.
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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  const body = await req.json() as { action: string; booking_id?: string; amount?: number };

  switch (body.action) {
    case 'create_deposit_intent':
      return await createDepositIntent(body as { action: string; booking_id: string; amount: number });
    case 'capture_balance':
      return await captureBalance(body as { action: string; booking_id: string });
    case 'refund_deposit':
      return await refundDeposit(body as { action: string; booking_id: string });
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

async function refundDeposit(body: {
  action: string;
  booking_id: string;
}): Promise<Response> {
  const { booking_id } = body;

  // Locate the successful deposit payment for this booking.
  const { data: deposit, error: depositError } = await supabase
    .from('payments')
    .select('id, stripe_payment_intent_id, amount, status, user_id')
    .eq('booking_id', booking_id)
    .eq('payment_type', 'deposit')
    .eq('status', 'succeeded')
    .maybeSingle();

  if (depositError) {
    return new Response(JSON.stringify({ error: depositError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!deposit) {
    // Nothing succeeded yet — treat as already-refunded so the client
    // cancel flow can proceed without erroring.
    return new Response(JSON.stringify({ ok: true, skipped: 'no deposit' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!deposit.stripe_payment_intent_id) {
    return new Response(
      JSON.stringify({ error: 'Deposit has no Stripe PaymentIntent id' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: deposit.stripe_payment_intent_id,
      reason: 'requested_by_customer',
      metadata: { booking_id, payment_id: deposit.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe refund failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Mark the original deposit as refunded and record a separate refund row
  // so the payments history shows both transactions.
  await supabase
    .from('payments')
    .update({ status: 'refunded' })
    .eq('id', deposit.id);

  await supabase.from('payments').insert({
    booking_id,
    user_id: deposit.user_id,
    stripe_payment_intent_id: deposit.stripe_payment_intent_id,
    payment_type: 'refund',
    amount: deposit.amount,
    status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
  });

  return new Response(
    JSON.stringify({ ok: true, refund_id: refund.id, status: refund.status }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
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

  await supabase
    .from('bookings')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', booking.id)
    .neq('status', 'completed');

  if (!booking.provider_id) return;

  const payoutAmount = Number(booking.provider_payout ?? 0);

  // One payout row per booking.
  const { data: existingPayout } = await supabase
    .from('payouts')
    .select('id')
    .eq('booking_id', booking.id)
    .maybeSingle();

  if (!existingPayout && payoutAmount > 0) {
    await supabase.from('payouts').insert({
      provider_id: booking.provider_id,
      booking_id: booking.id,
      amount: payoutAmount,
      status: 'pending',
    });
  }

  // Bump the provider's completed-job count.
  const { data: profile } = await supabase
    .from('provider_profiles')
    .select('total_jobs')
    .eq('id', booking.provider_id)
    .single();

  if (profile) {
    await supabase
      .from('provider_profiles')
      .update({ total_jobs: (profile.total_jobs ?? 0) + 1 })
      .eq('id', booking.provider_id);
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

  // Deposit success → transition the booking from pending → confirmed.
  if (payment_type === 'deposit' && booking_id) {
    await supabase
      .from('bookings')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', booking_id)
      .eq('status', 'pending'); // Guard: only move forward if still pending.
  }
}

async function onPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  await supabase
    .from('payments')
    .update({ status: 'failed', processed_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}
