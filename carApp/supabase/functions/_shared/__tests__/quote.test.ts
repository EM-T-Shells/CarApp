// Tests the real quote grammar and arithmetic used by the submit_quote action
// in stripe-webhook. Like webhookSignature.ts (and unlike the cancellation
// policy spec, which re-implements formulas trapped inside a Deno index.ts),
// this module has no remote imports, so these exercise the shipping code.

import {
  MAX_LINE_ITEM_LABEL_LENGTH,
  MAX_QUOTE_DURATION_MINS,
  MAX_QUOTE_LINE_ITEMS,
  MAX_QUOTED_TOTAL_CENTS,
  MIN_QUOTE_DURATION_MINS,
  QUOTABLE_STATUSES,
  computeQuotedTotalCents,
  normalizeQuoteLineItems,
  prepareQuote,
  validateQuoteDuration,
  validateQuoteStart,
} from '../quote';

// Jest pins TZ=UTC (jest.globalSetup.js), so these are exact instants.
const NOW = new Date('2026-08-20T09:00:00Z').getTime();
const WINDOW = {
  start: '2026-08-20T13:00:00Z',
  end: '2026-08-20T16:00:00Z',
};
const NO_WINDOW = { start: null, end: null };

describe('QUOTABLE_STATUSES', () => {
  it('covers both unpriced states a provider can quote from', () => {
    expect([...QUOTABLE_STATUSES]).toEqual([
      'pending_provider_quote',
      'awaiting_customer_info',
    ]);
  });

  // request_more_photos parks a rescued request in awaiting_customer_info and
  // nothing moves it back out. If this ever drops out of the list, every such
  // request becomes unquotable and the customer's new photos land on a dead row.
  it('includes awaiting_customer_info so rescued requests are not stranded', () => {
    expect(QUOTABLE_STATUSES).toContain('awaiting_customer_info');
  });

  it('excludes states where a price or a charge already exists', () => {
    expect(QUOTABLE_STATUSES).not.toContain('pending_customer_approval');
    expect(QUOTABLE_STATUSES).not.toContain('confirmed');
    expect(QUOTABLE_STATUSES).not.toContain('completed');
  });
});

describe('normalizeQuoteLineItems', () => {
  it('treats an absent itemisation as no surcharges', () => {
    expect(normalizeQuoteLineItems(undefined)).toEqual({ ok: true, value: [] });
    expect(normalizeQuoteLineItems(null)).toEqual({ ok: true, value: [] });
  });

  it('accepts the documented shape', () => {
    const result = normalizeQuoteLineItems([
      { label: 'SUV', amount_cents: 3000 },
      { label: 'Heavy pet hair', amount_cents: 2500 },
    ]);

    expect(result).toEqual({
      ok: true,
      value: [
        { label: 'SUV', amount_cents: 3000 },
        { label: 'Heavy pet hair', amount_cents: 2500 },
      ],
    });
  });

  it('trims labels', () => {
    const result = normalizeQuoteLineItems([{ label: '  SUV  ', amount_cents: 100 }]);
    expect(result).toEqual({ ok: true, value: [{ label: 'SUV', amount_cents: 100 }] });
  });

  // The trigger cannot reject unknown JSON keys, so anything not rebuilt here
  // reaches the customer's approval screen verbatim.
  it('strips keys outside the grammar', () => {
    const result = normalizeQuoteLineItems([
      { label: 'SUV', amount_cents: 3000, note: '<script>', provider_payout: 99 },
    ]);

    expect(result).toEqual({ ok: true, value: [{ label: 'SUV', amount_cents: 3000 }] });
  });

  it('rejects a non-array', () => {
    expect(normalizeQuoteLineItems('SUV +$30')).toEqual({
      ok: false,
      error: 'quote_line_items must be an array',
    });
  });

  it('rejects a non-object element', () => {
    const result = normalizeQuoteLineItems(['SUV']);
    expect(result.ok).toBe(false);
  });

  it('rejects an array element, which typeof calls an object', () => {
    const result = normalizeQuoteLineItems([[{ label: 'SUV', amount_cents: 1 }]]);
    expect(result.ok).toBe(false);
  });

  it('rejects a null element', () => {
    const result = normalizeQuoteLineItems([null]);
    expect(result.ok).toBe(false);
  });

  it('rejects a missing, empty, or whitespace label', () => {
    expect(normalizeQuoteLineItems([{ amount_cents: 100 }]).ok).toBe(false);
    expect(normalizeQuoteLineItems([{ label: '', amount_cents: 100 }]).ok).toBe(false);
    expect(normalizeQuoteLineItems([{ label: '   ', amount_cents: 100 }]).ok).toBe(false);
  });

  it('rejects a label longer than the screen can show', () => {
    const result = normalizeQuoteLineItems([
      { label: 'x'.repeat(MAX_LINE_ITEM_LABEL_LENGTH + 1), amount_cents: 100 },
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-numeric or missing amount', () => {
    expect(normalizeQuoteLineItems([{ label: 'SUV', amount_cents: '3000' }]).ok).toBe(false);
    expect(normalizeQuoteLineItems([{ label: 'SUV' }]).ok).toBe(false);
    expect(normalizeQuoteLineItems([{ label: 'SUV', amount_cents: NaN }]).ok).toBe(false);
    expect(normalizeQuoteLineItems([{ label: 'SUV', amount_cents: Infinity }]).ok).toBe(false);
  });

  // Mirrors the trigger: a fractional cent means the itemisation cannot be made
  // to sum to the total the customer is agreeing to.
  it('rejects a fractional amount', () => {
    const result = normalizeQuoteLineItems([{ label: 'SUV', amount_cents: 30.5 }]);
    expect(result).toEqual({
      ok: false,
      error: 'Line item "SUV" must be a whole number of cents',
    });
  });

  it('allows a negative amount, so a provider can discount a job', () => {
    expect(normalizeQuoteLineItems([{ label: 'Repeat customer', amount_cents: -500 }])).toEqual({
      ok: true,
      value: [{ label: 'Repeat customer', amount_cents: -500 }],
    });
  });

  it('rejects more line items than an itemisation can be read as', () => {
    const many = Array.from({ length: MAX_QUOTE_LINE_ITEMS + 1 }, (_, i) => ({
      label: `Item ${i}`,
      amount_cents: 100,
    }));
    expect(normalizeQuoteLineItems(many).ok).toBe(false);
  });

  it('accepts exactly the maximum', () => {
    const many = Array.from({ length: MAX_QUOTE_LINE_ITEMS }, (_, i) => ({
      label: `Item ${i}`,
      amount_cents: 100,
    }));
    expect(normalizeQuoteLineItems(many).ok).toBe(true);
  });
});

describe('computeQuotedTotalCents', () => {
  // The worked example from the spec: a $204.00 base (a $200 subtotal plus the
  // 2% service fee) plus "SUV +$30, heavy pet hair +$25".
  it('adds the surcharges to the derived base', () => {
    expect(
      computeQuotedTotalCents(20400, [
        { label: 'SUV', amount_cents: 3000 },
        { label: 'Heavy pet hair', amount_cents: 2500 },
      ]),
    ).toEqual({ ok: true, value: 25900 });
  });

  // The service fee is already inside the base and is NOT charged again on the
  // surcharges: a customer approving a line item that reads "+$30.00" is
  // charged exactly $30.00 more, so the itemisation sums to its own total.
  it('does not re-apply the 2% service fee to surcharges', () => {
    const result = computeQuotedTotalCents(20400, [{ label: 'SUV', amount_cents: 3000 }]);
    expect(result).toEqual({ ok: true, value: 23400 });
    // 23400, not 23460 (which is what base + 30.00 * 1.02 would give).
    expect(result.ok && result.value).not.toBe(23460);
  });

  it('returns the base unchanged when there are no surcharges', () => {
    expect(computeQuotedTotalCents(20400, [])).toEqual({ ok: true, value: 20400 });
  });

  it('applies discounts', () => {
    expect(
      computeQuotedTotalCents(20400, [{ label: 'Repeat customer', amount_cents: -400 }]),
    ).toEqual({ ok: true, value: 20000 });
  });

  it('refuses a total below zero', () => {
    const result = computeQuotedTotalCents(20400, [
      { label: 'Overzealous discount', amount_cents: -30000 },
    ]);
    expect(result).toEqual({ ok: false, error: 'A quote cannot total less than zero' });
  });

  it('allows a zero total exactly', () => {
    expect(
      computeQuotedTotalCents(20400, [{ label: 'On the house', amount_cents: -20400 }]),
    ).toEqual({ ok: true, value: 0 });
  });

  // NUMERIC(10,2) would raise 22003 rather than storing this. A clean 400 beats
  // a Postgres error on the provider's send-quote tap.
  it('refuses a total larger than the column can hold', () => {
    const result = computeQuotedTotalCents(20400, [
      { label: 'Typo', amount_cents: MAX_QUOTED_TOTAL_CENTS },
    ]);
    expect(result.ok).toBe(false);
  });

  it('refuses a booking with no derived base', () => {
    expect(computeQuotedTotalCents(NaN, []).ok).toBe(false);
    expect(computeQuotedTotalCents(-1, []).ok).toBe(false);
  });
});

describe('validateQuoteDuration', () => {
  it('accepts a duration inside the rails', () => {
    expect(validateQuoteDuration(90)).toEqual({ ok: true, value: 90 });
  });

  it('accepts both bounds exactly', () => {
    expect(validateQuoteDuration(MIN_QUOTE_DURATION_MINS).ok).toBe(true);
    expect(validateQuoteDuration(MAX_QUOTE_DURATION_MINS).ok).toBe(true);
  });

  it('rejects a duration below the floor', () => {
    expect(validateQuoteDuration(MIN_QUOTE_DURATION_MINS - 1).ok).toBe(false);
  });

  it('rejects a duration past the ceiling', () => {
    expect(validateQuoteDuration(MAX_QUOTE_DURATION_MINS + 1).ok).toBe(false);
  });

  it('rejects zero and negatives, which the column CHECK also refuses', () => {
    expect(validateQuoteDuration(0).ok).toBe(false);
    expect(validateQuoteDuration(-30).ok).toBe(false);
  });

  it('rejects fractional minutes', () => {
    expect(validateQuoteDuration(90.5).ok).toBe(false);
  });

  it('rejects a missing or non-numeric duration', () => {
    expect(validateQuoteDuration(undefined).ok).toBe(false);
    expect(validateQuoteDuration('90').ok).toBe(false);
    expect(validateQuoteDuration(null).ok).toBe(false);
  });
});

describe('validateQuoteStart', () => {
  it('accepts a start inside the requested window', () => {
    expect(validateQuoteStart('2026-08-20T14:00:00Z', WINDOW, NOW)).toEqual({
      ok: true,
      value: '2026-08-20T14:00:00.000Z',
    });
  });

  it('accepts both edges of the window', () => {
    expect(validateQuoteStart(WINDOW.start, WINDOW, NOW).ok).toBe(true);
    expect(validateQuoteStart(WINDOW.end, WINDOW, NOW).ok).toBe(true);
  });

  // §2 gave the window to the customer. A provider who cannot make it has
  // propose_reschedule; quoting outside it would commit the customer to a time
  // they never offered.
  it('refuses a start before the window opens', () => {
    const result = validateQuoteStart('2026-08-20T12:59:59Z', WINDOW, NOW);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('Propose a reschedule');
  });

  it('refuses a start after the window closes', () => {
    expect(validateQuoteStart('2026-08-20T16:00:01Z', WINDOW, NOW).ok).toBe(false);
  });

  // A NULL window means the customer named an exact time through the pre-quote
  // DateTimePicker flow, so there is nothing to place the start inside.
  it('accepts any future start when no window was requested', () => {
    expect(validateQuoteStart('2026-08-25T08:00:00Z', NO_WINDOW, NOW).ok).toBe(true);
  });

  it('refuses a start in the past', () => {
    const result = validateQuoteStart('2026-08-20T08:59:59Z', NO_WINDOW, NOW);
    expect(result).toEqual({
      ok: false,
      error: 'A quote cannot schedule a job in the past',
    });
  });

  it('refuses a missing or unparseable start', () => {
    expect(validateQuoteStart(undefined, WINDOW, NOW).ok).toBe(false);
    expect(validateQuoteStart('', WINDOW, NOW).ok).toBe(false);
    expect(validateQuoteStart('not-a-date', WINDOW, NOW).ok).toBe(false);
    expect(validateQuoteStart(1_760_000_000_000, WINDOW, NOW).ok).toBe(false);
  });

  // The both-or-neither CHECK should make this unreachable, but a half-stated
  // window must not block a quote the provider is otherwise entitled to send.
  it('ignores a half-stated window rather than failing on it', () => {
    expect(
      validateQuoteStart('2026-08-20T14:00:00Z', { start: WINDOW.start, end: null }, NOW).ok,
    ).toBe(true);
  });

  it('normalises the start to an ISO instant', () => {
    const result = validateQuoteStart('2026-08-20T14:00:00+00:00', WINDOW, NOW);
    expect(result).toEqual({ ok: true, value: '2026-08-20T14:00:00.000Z' });
  });
});

describe('prepareQuote', () => {
  const context = { baseTotalCents: 20400, window: WINDOW, nowMs: NOW };

  it('composes a complete quote', () => {
    const result = prepareQuote(
      {
        scheduled_at: '2026-08-20T14:00:00Z',
        estimated_duration_mins: 150,
        quote_line_items: [{ label: 'SUV', amount_cents: 3000 }],
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        scheduledAt: '2026-08-20T14:00:00.000Z',
        durationMins: 150,
        lineItems: [{ label: 'SUV', amount_cents: 3000 }],
        quotedTotalCents: 23400,
      },
    });
  });

  it('quotes with no surcharges at all', () => {
    const result = prepareQuote(
      { scheduled_at: '2026-08-20T14:00:00Z', estimated_duration_mins: 90 },
      context,
    );

    expect(result.ok && result.value.quotedTotalCents).toBe(20400);
    expect(result.ok && result.value.lineItems).toEqual([]);
  });

  it('reports the start before the duration, in form order', () => {
    const result = prepareQuote(
      { scheduled_at: '2026-08-21T14:00:00Z', estimated_duration_mins: 5 },
      context,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('arrival window');
  });

  it('fails the whole quote when any one part is invalid', () => {
    expect(
      prepareQuote(
        {
          scheduled_at: '2026-08-20T14:00:00Z',
          estimated_duration_mins: 90,
          quote_line_items: [{ label: '', amount_cents: 100 }],
        },
        context,
      ).ok,
    ).toBe(false);
  });

  it('rejects an empty request outright', () => {
    expect(prepareQuote({}, context).ok).toBe(false);
  });
});
