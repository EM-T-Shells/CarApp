// Booking-state policy shared by the stripe-webhook actions: which bookings can
// be cancelled, which cancellations carry the 24h fee or penalty, and how the
// deposit gets collected once a quote is approved.
//
// Pure TypeScript with no remote imports, for the same reason quote.ts is: the
// Deno index.ts files cannot be imported into Jest, so logic left in them can
// only be re-implemented in a spec and drifts by construction.
// __tests__/bookingPolicy.test.ts exercises this file directly.

/**
 * Statuses a customer or provider may cancel through cancel_booking /
 * provider_cancel_booking. Once the job is in_progress it can no longer be
 * cancelled; the no-show path covers a confirmed job the customer missed.
 *
 * The three unpriced quote states are here as well as in the client status
 * trigger, so both cancel buttons can use one server path — the one that
 * notifies the other party — rather than a bare status write that tells nobody.
 */
export const CANCELLABLE_STATUSES = [
  'pending',
  'pending_provider_approval',
  'confirmed',
  'en_route',
  'pending_provider_quote',
  'pending_customer_approval',
  'awaiting_customer_info',
  'pending_adjustment_approval',
] as const;

/**
 * Statuses where the 24h late-cancel fee (customer) or penalty (provider) can
 * apply. Spec §5: those rules fire only for committed bookings — cancelling an
 * unpriced request is free, and there is no deposit to deduct from anyway.
 *
 * pending_adjustment_approval is deliberately absent. The provider has asked to
 * change the agreed job; the customer declining that, or either side walking
 * away while it is open, is nobody's fault — so neither side pays for it.
 *
 * 'pending' is absent too: it means approved but not yet paid, so a "retained"
 * fee would be retained from nothing.
 */
export const FEE_BEARING_STATUSES = [
  'pending_provider_approval',
  'confirmed',
  'en_route',
] as const;

export function isCancellable(status: string): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

/** Whether a late-cancellation fee or penalty may apply in this status. */
export function cancellationFeeApplies(status: string): boolean {
  return (FEE_BEARING_STATUSES as readonly string[]).includes(status);
}

/**
 * How accept_quote collects the deposit.
 *
 *   • already_paid      — a deposit has succeeded (a re-approval); charging
 *                         again would take it twice
 *   • charge_saved_card — spec §2/§5: the card saved by SetupIntent at request
 *                         time is charged off-session, so approval is one tap
 *   • payment_sheet     — no saved card (a request sent before card-saving
 *                         existed, or one whose SetupIntent never completed):
 *                         fall back to the on-session PaymentSheet deposit
 */
export type DepositPlan = 'already_paid' | 'charge_saved_card' | 'payment_sheet';

export function planDepositCollection(input: {
  hasSucceededDeposit: boolean;
  savedPaymentMethodId: string | null;
}): DepositPlan {
  if (input.hasSucceededDeposit) return 'already_paid';
  if (input.savedPaymentMethodId) return 'charge_saved_card';
  return 'payment_sheet';
}

/**
 * The Stripe decline codes that mean "the customer has to be present" rather
 * than "this card will never work". Either way the client falls back to the
 * PaymentSheet, but the message differs: one asks them to confirm with their
 * bank, the other to use another card.
 */
export function describeOffSessionFailure(code: string | null | undefined): string {
  if (code === 'authentication_required') {
    return 'Your bank needs you to confirm this payment.';
  }
  return 'Your saved card could not be charged.';
}
