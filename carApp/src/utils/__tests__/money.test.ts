import {
  CUSTOMER_LATE_CANCEL_FEE_CENTS,
  PROVIDER_CANCEL_PENALTY_CENTS,
  STANDARD_PLATFORM_FEE_RATE,
  FOUNDING_PLATFORM_FEE_RATE,
  FOUNDING_PROVIDER_CAP,
  FOUNDING_WINDOW_DAYS,
  calculateLateCancelFee,
  calculateLateCancelRefund,
  calculatePlatformFee,
  calculateProviderPayout,
} from '../money';

describe('cancellation policy money helpers (Blocker #5)', () => {
  it('exposes the policy constants ($15 / $25)', () => {
    expect(CUSTOMER_LATE_CANCEL_FEE_CENTS).toBe(1500);
    expect(PROVIDER_CANCEL_PENALTY_CENTS).toBe(2500);
  });

  describe('calculateLateCancelRefund', () => {
    it('refunds the deposit minus the $15 fee', () => {
      // $50 deposit → $35 refund
      expect(calculateLateCancelRefund(5000)).toBe(3500);
    });

    it('never returns a negative refund when the deposit is below the fee', () => {
      // $10 deposit < $15 fee → nothing refunded
      expect(calculateLateCancelRefund(1000)).toBe(0);
    });

    it('returns 0 when the deposit exactly equals the fee', () => {
      expect(calculateLateCancelRefund(1500)).toBe(0);
    });
  });

  describe('calculateLateCancelFee', () => {
    it('retains the full $15 fee when the deposit covers it', () => {
      expect(calculateLateCancelFee(5000)).toBe(1500);
    });

    it('caps the fee at the deposit when the deposit is smaller', () => {
      // Can't retain more than was collected.
      expect(calculateLateCancelFee(1000)).toBe(1000);
    });
  });

  it('fee + refund always sums to the deposit', () => {
    for (const deposit of [1000, 1500, 3000, 5000, 9999]) {
      expect(
        calculateLateCancelFee(deposit) + calculateLateCancelRefund(deposit),
      ).toBe(deposit);
    }
  });
});

describe('Founding Provider Program fee rates (Blocker #8)', () => {
  it('resolves the standard MVP platform fee to 3% and founding to 0%', () => {
    expect(STANDARD_PLATFORM_FEE_RATE).toBe(0.03);
    expect(FOUNDING_PLATFORM_FEE_RATE).toBe(0);
  });

  it('exposes the program cap (first 100) and window (90 days)', () => {
    expect(FOUNDING_PROVIDER_CAP).toBe(100);
    expect(FOUNDING_WINDOW_DAYS).toBe(90);
  });

  it('takes no platform fee from a founding provider (0% → full payout)', () => {
    // $200 subtotal, founding window → provider keeps the whole subtotal.
    expect(calculatePlatformFee(20000, FOUNDING_PLATFORM_FEE_RATE)).toBe(0);
    expect(calculateProviderPayout(20000, FOUNDING_PLATFORM_FEE_RATE)).toBe(20000);
  });

  it('takes the 3% standard fee once a provider is off the founding window', () => {
    // $200 subtotal at 3% → $6 platform fee, $194 payout.
    expect(calculatePlatformFee(20000, STANDARD_PLATFORM_FEE_RATE)).toBe(600);
    expect(calculateProviderPayout(20000, STANDARD_PLATFORM_FEE_RATE)).toBe(19400);
  });

  it('fee + payout always reconciles to the subtotal at either rate', () => {
    for (const rate of [FOUNDING_PLATFORM_FEE_RATE, STANDARD_PLATFORM_FEE_RATE]) {
      for (const subtotal of [1000, 4999, 20000, 99999]) {
        expect(
          calculatePlatformFee(subtotal, rate) +
            calculateProviderPayout(subtotal, rate),
        ).toBe(subtotal);
      }
    }
  });
});
