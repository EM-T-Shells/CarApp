// Stripe integration — payment intent creation and deposit capture for CarApp.
// This module communicates with Supabase Edge Functions that proxy Stripe API
// calls. The app never touches Stripe secret keys directly.
//
// Flow:
//   1. createDepositPaymentIntent — called when customer confirms booking.
//      Returns a client secret for the 15% deposit charge.
//   2. confirmPayment — wraps @stripe/stripe-react-native's confirmPayment
//      using the client secret.
//   3. captureBalance — called server-side on job completion (not from app).
//      Listed here for type completeness / reference.

import { confirmPayment as stripeConfirmPayment } from '@stripe/stripe-react-native';
import { supabase } from '../supabase/client';

// ── Result Types ──────────────────────────────────────────────────────

export type StripeResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

// ── Edge Function Response Shapes ─────────────────────────────────────

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

// ── Create Deposit Payment Intent ─────────────────────────────────────

/**
 * Calls the stripe-webhook Edge Function to create a Stripe PaymentIntent
 * for the 15% deposit. The Edge Function handles:
 *   - Looking up the customer's stripe_customer_id
 *   - Creating the PaymentIntent with the deposit amount
 *   - Storing the payment record in the payments table
 *
 * @param bookingId  — The newly created booking row ID.
 * @param amountCents — Deposit amount in cents.
 * @returns The client secret needed to confirm the payment on the client.
 */
export async function createDepositPaymentIntent(
  bookingId: string,
  amountCents: number,
): Promise<StripeResult<CreatePaymentIntentResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'stripe-webhook',
      {
        body: {
          action: 'create_deposit_intent',
          booking_id: bookingId,
          amount: amountCents,
        },
      },
    );

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Stripe Edge Function error') };
    }

    const response = data as CreatePaymentIntentResponse;
    if (!response?.clientSecret) {
      return {
        data: null,
        error: new Error('Invalid response from payment service'),
      };
    }

    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ── Confirm Payment (client-side) ─────────────────────────────────────

/**
 * Wraps the @stripe/stripe-react-native confirmPayment call.
 * Must be called inside a <StripeProvider> context.
 *
 * @param clientSecret — From createDepositPaymentIntent result.
 * @returns True on success, or an error.
 */
export async function confirmDepositPayment(
  clientSecret: string,
): Promise<StripeResult<true>> {
  try {
    const { error } = await stripeConfirmPayment(clientSecret, {
      paymentMethodType: 'Card',
    });

    if (error) {
      return {
        data: null,
        error: new Error(error.message ?? 'Payment confirmation failed'),
      };
    }

    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
