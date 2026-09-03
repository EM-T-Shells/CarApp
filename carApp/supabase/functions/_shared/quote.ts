// Quote grammar and arithmetic for the submit_quote action
// (Blueprint/quote_first_booking.md §2, §3).
//
// Pure TypeScript with no remote imports, for the same reason
// webhookSignature.ts is: the Deno index.ts files cannot be imported into Jest,
// so logic that lives in them can only be *re-implemented* in a spec (see
// stripe-webhook/__tests__/cancellation-policy.test.ts, which mirrors the
// cancellation formulas and drifts from them by construction). Everything here
// is exercised directly by __tests__/quote.test.ts instead. Deno imports it as
// '../_shared/quote.ts'; Jest resolves the same file without the extension.
//
// Why this is a server-side module at all: §4's two-layer guard means the
// client's write surface on bookings cannot state a price or a duration —
// quote_line_items, quoted_total_amount and estimated_duration_mins are all
// outside both grant lists. A quote reaches the row through an Edge Function or
// not at all, so the rules it must satisfy belong on the server.

// Mirrors MIN_SUGGESTED_MINS in src/utils/suggestion.ts. The suggestion engine
// will not propose a job shorter than this, so a provider committing to less is
// almost certainly a stepper mis-tap rather than a real 5-minute detail.
export const MIN_QUOTE_DURATION_MINS = 15;

// A single mobile job that runs past twelve hours is a data-entry error, not a
// booking: it would blockade the provider's own calendar through the EXCLUDE
// constraint once the customer approves it.
export const MAX_QUOTE_DURATION_MINS = 12 * 60;

// The customer has to read and agree to this list on one screen. A quote with
// forty surcharges on it is not an itemisation.
export const MAX_QUOTE_LINE_ITEMS = 20;
export const MAX_LINE_ITEM_LABEL_LENGTH = 80;

// NUMERIC(10,2) tops out at 99,999,999.99, so a larger total would reach
// Postgres as a 22003 numeric overflow. This is a storage bound, NOT a price
// cap — §2 dropped the 20% cap deliberately, and mandatory customer approval is
// what replaced it.
export const MAX_QUOTED_TOTAL_CENTS = 9_999_999_999;

// The states a provider may quote from. Both are unpriced and nothing has been
// charged in either.
//
// awaiting_customer_info is included on purpose: §7 parks a request there when
// the photos are unusable, and nothing yet moves a row back out of it. Omitting
// it would strand every request the provider rescued that way, since the
// customer's new photos would arrive at a booking no action could quote.
export const QUOTABLE_STATUSES = [
  'pending_provider_quote',
  'awaiting_customer_info',
] as const;

export interface QuoteLineItem {
  label: string;
  amount_cents: number;
}

export interface RequestedWindow {
  start: string | null;
  end: string | null;
}

export type QuoteValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Validate and rebuild the itemised surcharges.
 *
 * The grammar mirrors validate_booking_quote() in
 * 20260821000000_quote_statuses_and_arrival_windows.sql exactly, so a bad quote
 * is refused here with a message naming the offending item rather than reaching
 * Postgres as a bare 22023.
 *
 * Each item is *rebuilt* rather than passed through. The trigger cannot reject
 * unknown JSON keys (a CHECK cannot iterate an object, and enumerating them was
 * rejected for the same reason in §7), so without this a provider could stash
 * arbitrary JSON on the row that renders on the customer's approval screen.
 */
export function normalizeQuoteLineItems(
  input: unknown,
): QuoteValidation<QuoteLineItem[]> {
  // Absent is legal and distinct from empty: a quote with no surcharges is the
  // ordinary case, not a malformed one.
  if (input === undefined || input === null) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(input)) {
    return { ok: false, error: 'quote_line_items must be an array' };
  }

  if (input.length > MAX_QUOTE_LINE_ITEMS) {
    return {
      ok: false,
      error: `A quote cannot carry more than ${MAX_QUOTE_LINE_ITEMS} line items`,
    };
  }

  const items: QuoteLineItem[] = [];

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'Each quote line item must be an object' };
    }

    const candidate = raw as { label?: unknown; amount_cents?: unknown };

    const label =
      typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (label.length === 0) {
      return { ok: false, error: 'Each quote line item needs a non-empty label' };
    }
    if (label.length > MAX_LINE_ITEM_LABEL_LENGTH) {
      return {
        ok: false,
        error: `Line item "${label.slice(0, 20)}…" exceeds ${MAX_LINE_ITEM_LABEL_LENGTH} characters`,
      };
    }

    const amount = candidate.amount_cents;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      return {
        ok: false,
        error: `Line item "${label}" needs a numeric amount_cents`,
      };
    }
    // Integer cents, matching the trigger. A fractional cent is a rounding bug
    // upstream, and it would make the itemisation unable to sum to the total.
    if (!Number.isSafeInteger(amount)) {
      return {
        ok: false,
        error: `Line item "${label}" must be a whole number of cents`,
      };
    }

    // Negative items are allowed — a provider discounting a job is legitimate,
    // and the resulting total is bounded below in computeQuotedTotalCents.
    items.push({ label, amount_cents: amount });
  }

  return { ok: true, value: items };
}

/**
 * The quoted total: the booking's derived base plus the surcharges, in cents.
 *
 * Surcharges pass through without the 2% service fee applied. That fee is
 * already inside baseTotalCents (derive_booking_amounts computes
 * total = subtotal + FLOOR(subtotal * 0.02)), and charging it again on the
 * surcharges would mean a customer who approves a line item reading "+$30.00"
 * is charged $30.60 — an itemisation that does not sum to its own total, which
 * is the exact failure 20260821000000 argues against when it stores these as
 * integer cents.
 *
 * This deliberately does NOT touch total_amount or deposit_amount. A quote is a
 * proposal; those columns are what was agreed and charged, and they are
 * accept_quote's to write.
 */
export function computeQuotedTotalCents(
  baseTotalCents: number,
  items: readonly QuoteLineItem[],
): QuoteValidation<number> {
  if (!Number.isFinite(baseTotalCents) || baseTotalCents < 0) {
    return { ok: false, error: 'Booking has no derived total to quote against' };
  }

  const surcharge = items.reduce((sum, item) => sum + item.amount_cents, 0);
  const total = Math.round(baseTotalCents) + surcharge;

  if (total < 0) {
    return { ok: false, error: 'A quote cannot total less than zero' };
  }
  if (total > MAX_QUOTED_TOTAL_CENTS) {
    return { ok: false, error: 'Quoted total is larger than a booking can record' };
  }

  return { ok: true, value: total };
}

/**
 * The duration the provider commits to. §2 gives them this outright — the
 * engine only suggests — so the bounds here are sanity rails, not policy.
 */
export function validateQuoteDuration(input: unknown): QuoteValidation<number> {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return { ok: false, error: 'estimated_duration_mins is required' };
  }
  if (!Number.isInteger(input)) {
    return { ok: false, error: 'estimated_duration_mins must be whole minutes' };
  }
  if (input < MIN_QUOTE_DURATION_MINS) {
    return {
      ok: false,
      error: `A job must be at least ${MIN_QUOTE_DURATION_MINS} minutes`,
    };
  }
  if (input > MAX_QUOTE_DURATION_MINS) {
    return {
      ok: false,
      error: `A job cannot be longer than ${MAX_QUOTE_DURATION_MINS / 60} hours`,
    };
  }
  return { ok: true, value: input };
}

/**
 * The exact start the provider places inside the customer's arrival window.
 *
 * §2: the customer picks a day and a window, the provider sets the start inside
 * it. The database deliberately does not enforce that — requested_window_* is
 * recorded as a preference, and scheduled_at stays the authoritative instant —
 * so the product rule is enforced here, where a provider who genuinely cannot
 * make the window is told to use propose_reschedule instead of silently
 * quoting a time the customer never offered.
 *
 * A NULL window means the customer named an exact time through the pre-quote
 * DateTimePicker flow; there is nothing to place the start inside.
 */
export function validateQuoteStart(
  input: unknown,
  window: RequestedWindow,
  nowMs: number,
): QuoteValidation<string> {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, error: 'scheduled_at is required' };
  }

  const startMs = new Date(input).getTime();
  if (Number.isNaN(startMs)) {
    return { ok: false, error: 'scheduled_at is not a valid timestamp' };
  }

  if (startMs < nowMs) {
    return { ok: false, error: 'A quote cannot schedule a job in the past' };
  }

  if (window.start === null || window.end === null) {
    return { ok: true, value: new Date(startMs).toISOString() };
  }

  const windowStartMs = new Date(window.start).getTime();
  const windowEndMs = new Date(window.end).getTime();
  if (Number.isNaN(windowStartMs) || Number.isNaN(windowEndMs)) {
    // A malformed stored window is not the provider's fault, and the
    // both-or-neither CHECK means it should be unreachable. Treat it as absent
    // rather than blocking the quote on it.
    return { ok: true, value: new Date(startMs).toISOString() };
  }

  // Inclusive at both ends: arriving exactly at the close of the window is
  // arriving within it.
  if (startMs < windowStartMs || startMs > windowEndMs) {
    return {
      ok: false,
      error:
        'The start time is outside the arrival window the customer asked for. Propose a reschedule instead.',
    };
  }

  return { ok: true, value: new Date(startMs).toISOString() };
}

export interface QuoteRequest {
  estimated_duration_mins?: unknown;
  scheduled_at?: unknown;
  quote_line_items?: unknown;
}

export interface PreparedQuote {
  scheduledAt: string;
  durationMins: number;
  lineItems: QuoteLineItem[];
  quotedTotalCents: number;
}

/**
 * Compose the whole validation in the order the provider filled the form in, so
 * the first thing they hear about is the first thing they got wrong.
 */
export function prepareQuote(
  request: QuoteRequest,
  context: { baseTotalCents: number; window: RequestedWindow; nowMs: number },
): QuoteValidation<PreparedQuote> {
  const start = validateQuoteStart(
    request.scheduled_at,
    context.window,
    context.nowMs,
  );
  if (!start.ok) return start;

  const duration = validateQuoteDuration(request.estimated_duration_mins);
  if (!duration.ok) return duration;

  const items = normalizeQuoteLineItems(request.quote_line_items);
  if (!items.ok) return items;

  const total = computeQuotedTotalCents(context.baseTotalCents, items.value);
  if (!total.ok) return total;

  return {
    ok: true,
    value: {
      scheduledAt: start.value,
      durationMins: duration.value,
      lineItems: items.value,
      quotedTotalCents: total.value,
    },
  };
}
