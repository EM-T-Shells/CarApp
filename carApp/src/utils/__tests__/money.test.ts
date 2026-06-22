import {
  CUSTOMER_LATE_CANCEL_FEE_CENTS,
  PROVIDER_CANCEL_PENALTY_CENTS,
  calculateLateCancelFee,
  calculateLateCancelRefund,
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
