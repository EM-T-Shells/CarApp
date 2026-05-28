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
