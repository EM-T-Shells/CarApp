// Exercises the shipping booking-state policy used by stripe-webhook's cancel
// and accept_quote actions.

import {
  CANCELLABLE_STATUSES,
  cancellationFeeApplies,
  describeOffSessionFailure,
  isCancellable,
  planDepositCollection,
} from '../bookingPolicy';

describe('isCancellable', () => {
  it('covers every pre-start state, priced or not', () => {
    for (const status of [
      'pending',
      'pending_provider_approval',
      'confirmed',
      'en_route',
      'pending_provider_quote',
      'pending_customer_approval',
      'awaiting_customer_info',
      'pending_adjustment_approval',
    ]) {
      expect(isCancellable(status)).toBe(true);
    }
  });

  it('refuses a started or finished job', () => {
    for (const status of ['in_progress', 'completed', 'cancelled', 'no_show']) {
      expect(isCancellable(status)).toBe(false);
    }
  });

  it('lists each status once', () => {
    expect(new Set(CANCELLABLE_STATUSES).size).toBe(CANCELLABLE_STATUSES.length);
  });
});

describe('cancellationFeeApplies', () => {
  it('applies to committed bookings', () => {
    for (const status of ['pending_provider_approval', 'confirmed', 'en_route']) {
      expect(cancellationFeeApplies(status)).toBe(true);
    }
  });

  // Spec §5: cancelling an unpriced request is free.
  it('never applies to an unpriced request', () => {
    for (const status of [
      'pending_provider_quote',
      'pending_customer_approval',
      'awaiting_customer_info',
    ]) {
      expect(cancellationFeeApplies(status)).toBe(false);
    }
  });

  // Walking away from a disputed adjustment is nobody's fault.
  it('never applies while an adjustment is waiting on the customer', () => {
    expect(cancellationFeeApplies('pending_adjustment_approval')).toBe(false);
  });

  // Approved but unpaid: there is no deposit to retain a fee from.
  it('does not apply before the deposit is paid', () => {
    expect(cancellationFeeApplies('pending')).toBe(false);
  });
});

describe('planDepositCollection', () => {
  it('never charges a second deposit', () => {
    expect(
      planDepositCollection({ hasSucceededDeposit: true, savedPaymentMethodId: 'pm_1' }),
    ).toBe('already_paid');
  });

  it('charges the card saved at request time', () => {
    expect(
      planDepositCollection({ hasSucceededDeposit: false, savedPaymentMethodId: 'pm_1' }),
    ).toBe('charge_saved_card');
  });

  it('falls back to the PaymentSheet when no card was saved', () => {
    expect(
      planDepositCollection({ hasSucceededDeposit: false, savedPaymentMethodId: null }),
    ).toBe('payment_sheet');
  });
});

describe('describeOffSessionFailure', () => {
  it('asks for authentication when the bank wants it', () => {
    expect(describeOffSessionFailure('authentication_required')).toMatch(/confirm/i);
  });

  it('falls back to a generic card message', () => {
    expect(describeOffSessionFailure('card_declined')).toMatch(/could not be charged/i);
    expect(describeOffSessionFailure(null)).toMatch(/could not be charged/i);
  });
});
