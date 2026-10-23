// Tests the grammar behind the Phase 3 actions added after submit_quote /
// accept_quote: request_more_photos, adjust_job_duration and the reschedule
// pair. Like quote.test.ts, this exercises the shipping module directly — the
// Deno index.ts that calls it cannot be imported into Jest.

import {
  MAX_ADJUSTMENT_REASON_LENGTH,
  MAX_INFO_REQUEST_NOTE_LENGTH,
  appendLineItems,
  prepareAdjustment,
  rescheduleResponseAllowed,
  validateInfoRequestNote,
  validateRescheduleStart,
} from '../quote';

// Jest pins TZ=UTC (jest.globalSetup.js), so these are exact instants.
const NOW = new Date('2026-09-28T09:00:00Z').getTime();

describe('validateInfoRequestNote', () => {
  it('trims and accepts a note', () => {
    expect(validateInfoRequestNote('  Photo of the back seats, please  ')).toEqual({
      ok: true,
      value: 'Photo of the back seats, please',
    });
  });

  // A request parked with no explanation leaves the customer guessing what
  // would unblock it.
  it('requires a note', () => {
    for (const input of [undefined, null, '', '   ', 42]) {
      expect(validateInfoRequestNote(input).ok).toBe(false);
    }
  });

  it('refuses a note longer than the column allows', () => {
    const long = 'x'.repeat(MAX_INFO_REQUEST_NOTE_LENGTH + 1);
    expect(validateInfoRequestNote(long).ok).toBe(false);
    expect(validateInfoRequestNote(long.slice(1)).ok).toBe(true);
  });
});

describe('prepareAdjustment', () => {
  const CONTEXT = {
    currentTotalCents: 25500,
    currentDurationMins: 120,
    chargedDepositCents: 3825,
  };

  const unwrap = (result: ReturnType<typeof prepareAdjustment>) => {
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
    return result.value;
  };

  it('adds the new charges to the agreed total without re-applying the fee', () => {
    const value = unwrap(
      prepareAdjustment(
        {
          estimated_duration_mins: 180,
          adjustment_line_items: [{ label: 'Heavy mud', amount_cents: 3000 }],
          reason: 'Mud throughout the interior',
        },
        CONTEXT,
      ),
    );
    expect(value.adjustedTotalCents).toBe(28500);
    expect(value.durationMins).toBe(180);
    expect(value.lineItems).toEqual([{ label: 'Heavy mud', amount_cents: 3000 }]);
    expect(value.reason).toBe('Mud throughout the interior');
  });

  it('allows a duration-only change at the same price', () => {
    const value = unwrap(
      prepareAdjustment(
        { estimated_duration_mins: 150, reason: 'More hair than expected' },
        CONTEXT,
      ),
    );
    expect(value.adjustedTotalCents).toBe(25500);
    expect(value.lineItems).toEqual([]);
  });

  // An adjustment that changes nothing would still put the customer through an
  // approval step for no reason.
  it('refuses an adjustment that changes nothing', () => {
    const result = prepareAdjustment(
      { estimated_duration_mins: 120, adjustment_line_items: [], reason: 'No change' },
      CONTEXT,
    );
    expect(result.ok).toBe(false);
  });

  it('requires a reason the customer can read', () => {
    expect(
      prepareAdjustment({ estimated_duration_mins: 180, reason: '  ' }, CONTEXT).ok,
    ).toBe(false);
    expect(
      prepareAdjustment(
        {
          estimated_duration_mins: 180,
          reason: 'x'.repeat(MAX_ADJUSTMENT_REASON_LENGTH + 1),
        },
        CONTEXT,
      ).ok,
    ).toBe(false);
  });

  it('applies the quote duration bounds', () => {
    for (const estimated_duration_mins of [5, 12 * 60 + 15, 90.5, '180']) {
      expect(
        prepareAdjustment({ estimated_duration_mins, reason: 'Because' }, CONTEXT).ok,
      ).toBe(false);
    }
  });

  it('applies the quote line item grammar', () => {
    const result = prepareAdjustment(
      {
        estimated_duration_mins: 180,
        adjustment_line_items: [{ label: 'Mud', amount_cents: 30.5 }],
        reason: 'Mud',
      },
      CONTEXT,
    );
    expect(result.ok).toBe(false);
  });

  // capture_balance charges total − deposit, so a total below what was already
  // charged would complete the job for free and owe the customer money.
  it('refuses a discount that lands below the deposit already charged', () => {
    const result = prepareAdjustment(
      {
        estimated_duration_mins: 60,
        adjustment_line_items: [{ label: 'Goodwill', amount_cents: -23000 }],
        reason: 'Smaller job than booked',
      },
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/deposit/i);
  });

  it('accepts a discount that stays above the deposit', () => {
    const value = unwrap(
      prepareAdjustment(
        {
          estimated_duration_mins: 90,
          adjustment_line_items: [{ label: 'Smaller than booked', amount_cents: -2000 }],
          reason: 'Only the front seats needed doing',
        },
        CONTEXT,
      ),
    );
    expect(value.adjustedTotalCents).toBe(23500);
  });
});

describe('appendLineItems', () => {
  it('appends the new charges after the existing itemisation', () => {
    expect(
      appendLineItems(
        [{ label: 'SUV', amount_cents: 3000 }],
        [{ label: 'Heavy mud', amount_cents: 2500 }],
      ),
    ).toEqual([
      { label: 'SUV', amount_cents: 3000 },
      { label: 'Heavy mud', amount_cents: 2500 },
    ]);
  });

  // A legacy deposit-first booking has no quote_line_items at all.
  it('starts from nothing when the booking was never itemised', () => {
    expect(appendLineItems(null, [{ label: 'Mud', amount_cents: 100 }])).toEqual([
      { label: 'Mud', amount_cents: 100 },
    ]);
  });

  it('drops malformed existing entries rather than failing an approval', () => {
    expect(
      appendLineItems(
        [{ label: '', amount_cents: 1 }, { label: 'Ok', amount_cents: 2.5 }, 'junk'],
        [],
      ),
    ).toEqual([]);
  });
});

describe('validateRescheduleStart', () => {
  const CURRENT = '2026-10-01T15:00:00Z';

  it('normalises an accepted time to ISO', () => {
    expect(
      validateRescheduleStart('2026-10-02T15:00:00.000Z', {
        currentScheduledAt: CURRENT,
        nowMs: NOW,
      }),
    ).toEqual({ ok: true, value: '2026-10-02T15:00:00.000Z' });
  });

  it('refuses the past and the present', () => {
    for (const input of ['2026-09-27T15:00:00Z', new Date(NOW).toISOString()]) {
      expect(
        validateRescheduleStart(input, { currentScheduledAt: CURRENT, nowMs: NOW }).ok,
      ).toBe(false);
    }
  });

  it('refuses the time the job is already at', () => {
    expect(
      validateRescheduleStart('2026-10-01T15:00:00.000Z', {
        currentScheduledAt: CURRENT,
        nowMs: NOW,
      }).ok,
    ).toBe(false);
  });

  it('refuses something that is not a timestamp', () => {
    for (const input of [undefined, '', 'tomorrow', 12]) {
      expect(
        validateRescheduleStart(input, { currentScheduledAt: CURRENT, nowMs: NOW }).ok,
      ).toBe(false);
    }
  });
});

describe('rescheduleResponseAllowed', () => {
  it('lets the other party accept or decline', () => {
    expect(rescheduleResponseAllowed('provider', 'customer', true)).toEqual({
      ok: true,
      value: 'accept',
    });
    expect(rescheduleResponseAllowed('customer', 'provider', false)).toEqual({
      ok: true,
      value: 'decline',
    });
  });

  // Accepting your own proposal is the one-sided reschedule the pair of actions
  // exists to prevent.
  it('never lets the proposer accept their own proposal', () => {
    expect(rescheduleResponseAllowed('customer', 'customer', true).ok).toBe(false);
    expect(rescheduleResponseAllowed('provider', 'provider', true).ok).toBe(false);
  });

  it('lets the proposer withdraw', () => {
    expect(rescheduleResponseAllowed('customer', 'customer', false)).toEqual({
      ok: true,
      value: 'withdraw',
    });
  });
});
