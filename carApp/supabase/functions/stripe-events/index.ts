// stripe-events Edge Function
//
// Receives Stripe webhook deliveries and nothing else. Split out of
// stripe-webhook because the two callers need opposite auth models:
//
//   • stripe-webhook — invoked by the app, deployed with verify_jwt: true so
//     Supabase rejects unauthenticated callers before any service-role work.
//   • stripe-events  — invoked by Stripe, which cannot attach a Supabase JWT.
//     Deployed with verify_jwt: false and authenticated instead by verifying
//     the Stripe-Signature header against STRIPE_WEBHOOK_SECRET. A request
//     without a valid signature is rejected before it can touch the database.
//
// Deploy with:
//   supabase functions deploy stripe-events --no-verify-jwt
//
// Then point a Stripe webhook endpoint at
//   https://<project-ref>.supabase.co/functions/v1/stripe-events
// subscribed to payment_intent.succeeded and payment_intent.payment_failed,
// and set its signing secret as STRIPE_WEBHOOK_SECRET.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.6.0?target=deno&no-check=true';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Clients ───────────────────────────────────────────────────────────

const STRIPE_API_VERSION = '2023-10-16';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role client — bypasses RLS for trusted server-side writes. Safe here
// only because every request is signature-verified before it reaches a write.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Manual provider-approval window (Blocker #4). On deposit success the booking
// moves to pending_provider_approval; the provider has this long to accept
// before the auto-cancel sweep refunds the deposit and cancels the booking.
// Must match APPROVAL_WINDOW_MS in stripe-webhook, which runs the sweep.
const APPROVAL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// ── Helpers ───────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const signature = req.headers.get('stripe-signature');

  // No signature means this did not come from Stripe. Since verify_jwt is off
  // for this function, the signature IS the authentication — refuse without it.
  if (!signature) {
    return jsonResponse({ error: 'Missing Stripe-Signature header' }, 401);
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!webhookSecret) {
    return jsonResponse({ error: 'Webhook secret not configured' }, 500);
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return jsonResponse({ error: message }, 400);
  }

  try {
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
  } catch (err) {
    // Return 500 so Stripe retries the delivery rather than dropping the
    // event. Handlers below are written to be safe on redelivery.
    const message = err instanceof Error ? err.message : 'Event handling failed';
    console.error(`stripe-events ${event.type} failed`, message);
    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ received: true }, 200);
});

// ── Event handlers ────────────────────────────────────────────────────

async function onPaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
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

async function onPaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
): Promise<void> {
  await supabase
    .from('payments')
    .update({ status: 'failed', processed_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}
