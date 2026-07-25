// Stripe integration — payment intent creation and deposit capture for CarApp.
// This module communicates with Supabase Edge Functions that proxy Stripe API
// calls. The app never touches Stripe secret keys directly.
//
// Flow:
//   1. createDepositPaymentIntent — called when customer confirms booking.
//      Returns a client secret for the 15% deposit charge.
//   2. presentDepositPaymentSheet — opens Stripe's PaymentSheet against that
//      client secret to collect the card and confirm the charge.
//   3. captureBalance — invoked when a provider marks a job complete (Flow 5.6).
//      Triggers the Edge Function to charge the customer's saved card for the
//      remaining 85% off-session; no card entry happens on the provider side.
//   4. refundDeposit — refunds the deposit on a non-forfeit cancellation.

import {
  initPaymentSheet,
  presentPaymentSheet,
  PaymentSheetError,
} from '@stripe/stripe-react-native';
import { supabase } from '../supabase/client';

// Shown as the merchant name in the Stripe payment sheet.
const MERCHANT_DISPLAY_NAME = 'CarApp';

// Where Stripe returns after an out-of-app redirect (3D Secure). Must match
// the `scheme` in app.json.
const PAYMENT_RETURN_URL = 'carapp://stripe-redirect';

// ── Result Types ──────────────────────────────────────────────────────

export type StripeResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

// ── Edge Function Response Shapes ─────────────────────────────────────

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  /**
   * Customer + ephemeral key power the saved-card list in PaymentSheet. Both
   * are optional: the sheet takes a card without them, and the PaymentIntent
   * already carries `customer` + `setup_future_usage` server-side, so the card
   * is stored for balance capture either way.
   */
  customerId?: string;
  ephemeralKeySecret?: string;
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

// ── Collect + Confirm Deposit (client-side) ───────────────────────────

export interface DepositPaymentOutcome {
  /**
   * True when the customer dismissed the sheet without paying. This is a
   * normal outcome, not an error — callers should unwind the booking quietly
   * rather than showing a failure alert.
   */
  canceled: boolean;
}

/**
 * Opens Stripe's PaymentSheet to collect card details and confirm the deposit
 * PaymentIntent. Must be called inside a <StripeProvider> context, which
 * requires EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to be set.
 *
 * Replaces the old bare `confirmPayment` call, which assumed a mounted
 * CardField and always failed with "Card details not complete" because the
 * app never rendered one.
 *
 * @param intent — The createDepositPaymentIntent result.
 */
export async function presentDepositPaymentSheet(
  intent: CreatePaymentIntentResponse,
): Promise<StripeResult<DepositPaymentOutcome>> {
  try {
    const { error: initError } = await initPaymentSheet({
      merchantDisplayName: MERCHANT_DISPLAY_NAME,
      paymentIntentClientSecret: intent.clientSecret,
      // Only pass the customer pair when the server supplied both, otherwise
      // Stripe rejects a half-configured customer.
      ...(intent.customerId && intent.ephemeralKeySecret
        ? {
            customerId: intent.customerId,
            customerEphemeralKeySecret: intent.ephemeralKeySecret,
          }
        : {}),
      // Deposits must clear now — the booking hinges on the payment landing.
      allowsDelayedPaymentMethods: false,
      returnURL: PAYMENT_RETURN_URL,
    });

    if (initError) {
      return {
        data: null,
        error: new Error(initError.message ?? 'Could not start checkout'),
      };
    }

    const { error: presentError } = await presentPaymentSheet();

    if (presentError) {
      if (presentError.code === PaymentSheetError.Canceled) {
        return { data: { canceled: true }, error: null };
      }
      return {
        data: null,
        error: new Error(presentError.message ?? 'Payment confirmation failed'),
      };
    }

    return { data: { canceled: false }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ── Capture Balance (Flow 5.6) ────────────────────────────────────────

export interface CaptureBalanceResponse {
  ok: boolean;
  payment_intent_id?: string;
  status?: string;
  /** Set when there was no remaining balance to charge (deposit ≥ total). */
  skipped?: string;
}

/**
 * Calls the stripe-webhook Edge Function to capture the remaining 85% balance
 * when a provider marks a job complete. The Edge Function charges the
 * customer's saved payment method off-session, records a `balance` payment
 * row, queues the provider payout, and transitions the booking to `completed`.
 *
 * The provider's device is the caller, but the charge runs server-side against
 * the customer's stored card — no card entry happens on the provider side.
 */
export async function captureBalance(
  bookingId: string,
): Promise<StripeResult<CaptureBalanceResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'stripe-webhook',
      {
        body: { action: 'capture_balance', booking_id: bookingId },
      },
    );

    if (error) {
      return {
        data: null,
        error: new Error(error.message ?? 'Balance capture failed'),
      };
    }

    const response = data as CaptureBalanceResponse;
    if (!response?.ok) {
      return {
        data: null,
        error: new Error('Balance capture did not complete'),
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

// ── Refund Deposit (Flow 2.12) ────────────────────────────────────────

export interface RefundDepositResponse {
  ok: boolean;
  refund_id?: string;
  status?: string;
  skipped?: string;
}

/**
 * Calls the stripe-webhook Edge Function to refund the deposit on a
 * non-forfeit cancellation. The Edge Function is idempotent — repeated
 * calls return `{ ok: true, skipped: 'no deposit' }` after the refund has
 * already been issued.
 */
export async function refundDeposit(
  bookingId: string,
): Promise<StripeResult<RefundDepositResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke(
      'stripe-webhook',
      {
        body: { action: 'refund_deposit', booking_id: bookingId },
      },
    );

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Refund failed') };
    }

    return { data: data as RefundDepositResponse, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ── Cancellation policy (Blocker #5 / Flow G2 / PRD v5) ───────────────
//
// Cancellation is enforced server-side in the stripe-webhook Edge Function:
//   • cancel_booking          — customer cancels; full refund (>24h) or
//                               deposit less a $15 flat fee (<=24h).
//   • provider_cancel_booking — provider cancels; full customer refund + $25
//                               penalty recorded on the booking.
//   • mark_no_show            — provider marks a no-show; customer forfeits
//                               the full amount, no refund.
// The 24h window decision and all fee math live on the server — the client
// never decides the refund amount.

export interface CancelBookingResponse {
  ok: boolean;
  status?: string;
  late?: boolean;
  fee_cents?: number;
  penalty_cents?: number;
  refund?: unknown;
}

/**
 * Customer cancels their own booking. The server applies the policy (full vs
 * $15-fee refund) based on the 24h window — callers do not pass an amount.
 */
export async function cancelBooking(
  bookingId: string,
): Promise<StripeResult<CancelBookingResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'cancel_booking', booking_id: bookingId },
    });

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Cancellation failed') };
    }

    const response = data as CancelBookingResponse;
    if (!response?.ok) {
      return { data: null, error: new Error('Booking is no longer cancellable') };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Provider cancels a booking they had accepted. Full deposit refund to the
 * customer; the $25 penalty (if within 24h) is recorded server-side.
 */
export async function providerCancelBooking(
  bookingId: string,
  reason?: string,
): Promise<StripeResult<CancelBookingResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'provider_cancel_booking', booking_id: bookingId, reason },
    });

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Cancellation failed') };
    }

    const response = data as CancelBookingResponse;
    if (!response?.ok) {
      return { data: null, error: new Error('Booking is no longer cancellable') };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export interface MarkNoShowResponse {
  ok: boolean;
  status?: string;
}

/**
 * Provider marks the customer as a no-show. The customer forfeits the full
 * booking amount (no refund) and the booking moves to no_show.
 */
export async function markNoShow(
  bookingId: string,
): Promise<StripeResult<MarkNoShowResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'mark_no_show', booking_id: bookingId },
    });

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Failed to mark no-show') };
    }

    const response = data as MarkNoShowResponse;
    if (!response?.ok) {
      return { data: null, error: new Error('Booking cannot be marked as a no-show') };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ── Provider Accept / Decline (Blocker #4 / Flow H1) ──────────────────
//
// After the customer's deposit lands, the booking sits in
// pending_provider_approval for 2 hours. The provider resolves it from the
// job screen: accept moves it to confirmed; decline cancels it and refunds
// the customer's deposit. Both run server-side in the stripe-webhook Edge
// Function so the status transition and the refund stay atomic with auth.

export interface AcceptBookingResponse {
  ok: boolean;
  status?: string;
}

export interface DeclineBookingResponse {
  ok: boolean;
  status?: string;
  refund?: unknown;
}

/**
 * Provider accepts a booking still in pending_provider_approval. Returns a
 * 409-shaped error if the window already closed (accepted/declined/expired).
 */
export async function acceptBooking(
  bookingId: string,
): Promise<StripeResult<AcceptBookingResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'accept_booking', booking_id: bookingId },
    });

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Accept failed') };
    }

    const response = data as AcceptBookingResponse;
    if (!response?.ok) {
      return { data: null, error: new Error('Booking is no longer awaiting approval') };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Provider declines a booking. Cancels it and refunds the deposit. An optional
 * reason is recorded (spec H1b: provider provides a decline reason).
 */
export async function declineBooking(
  bookingId: string,
  reason?: string,
): Promise<StripeResult<DeclineBookingResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'decline_booking', booking_id: bookingId, reason },
    });

    if (error) {
      return { data: null, error: new Error(error.message ?? 'Decline failed') };
    }

    const response = data as DeclineBookingResponse;
    if (!response?.ok) {
      return { data: null, error: new Error('Booking is no longer awaiting approval') };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
