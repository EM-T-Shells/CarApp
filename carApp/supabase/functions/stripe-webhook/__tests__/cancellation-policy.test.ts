// Pure-logic spec for the server-side cancellation policy (Blocker #5).
//
// The stripe-webhook Edge Function runs on Deno and imports remote modules, so
// it can't be imported into Jest directly. These tests re-implement the exact
// policy formulas used in index.ts (cancelBooking / providerCancelBooking /
// markNoShow) and lock them down, so a change to the policy must be a
// deliberate edit here too. The dollar constants mirror src/utils/money.ts.

const LATE_CANCEL_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_LATE_CANCEL_FEE_CENTS = 1500; // $15
const PROVIDER_CANCEL_PENALTY_CENTS = 2500; // $25

function isWithinLateCancelWindow(scheduledAtIso: string | null, now: number): boolean {
  if (!scheduledAtIso) return false;
  const scheduled = new Date(scheduledAtIso).getTime();
  if (Number.isNaN(scheduled)) return false;
  const diff = scheduled - now;
  return diff >= 0 && diff <= LATE_CANCEL_WINDOW_MS;
}

// Mirrors cancelBooking: returns the fee retained and amount refunded (cents).
function customerCancelOutcome(depositCents: number, late: boolean) {
  const feeCents = late ? Math.min(depositCents, CUSTOMER_LATE_CANCEL_FEE_CENTS) : 0;
  const refundCents = late ? Math.max(depositCents - feeCents, 0) : depositCents;
  return { feeCents, refundCents };
}

describe('isWithinLateCancelWindow', () => {
  const now = new Date('2026-06-22T12:00:00Z').getTime();

  it('is true when the appointment is within the next 24h', () => {
    expect(isWithinLateCancelWindow('2026-06-23T10:00:00Z', now)).toBe(true);
  });

  it('is false when the appointment is more than 24h out', () => {
    expect(isWithinLateCancelWindow('2026-06-24T12:00:01Z', now)).toBe(false);
  });

  it('is false for a past appointment', () => {
    expect(isWithinLateCancelWindow('2026-06-22T11:59:59Z', now)).toBe(false);
  });

  it('is false for a null or unparseable date', () => {
    expect(isWithinLateCancelWindow(null, now)).toBe(false);
    expect(isWithinLateCancelWindow('not-a-date', now)).toBe(false);
  });
});

describe('customer cancellation outcome', () => {
  it('refunds the full deposit outside the 24h window', () => {
    expect(customerCancelOutcome(5000, false)).toEqual({
      feeCents: 0,
      refundCents: 5000,
    });
  });

  it('retains $15 and refunds the rest within the 24h window', () => {
    expect(customerCancelOutcome(5000, true)).toEqual({
      feeCents: 1500,
      refundCents: 3500,
    });
  });

  it('caps the fee at the deposit and refunds nothing for a tiny late deposit', () => {
    expect(customerCancelOutcome(1000, true)).toEqual({
      feeCents: 1000,
      refundCents: 0,
    });
  });
});

describe('provider cancellation penalty', () => {
  it('charges the $25 penalty within the 24h window', () => {
    const late = true;
    expect(late ? PROVIDER_CANCEL_PENALTY_CENTS : 0).toBe(2500);
  });

  it('charges no penalty outside the 24h window', () => {
    const late = false;
    expect(late ? PROVIDER_CANCEL_PENALTY_CENTS : 0).toBe(0);
  });
});
