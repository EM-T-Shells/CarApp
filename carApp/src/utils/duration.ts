// Duration utilities — single source of truth for service-duration display and
// the "ready by" time derived from it.
//
// A booking's committed duration lives in `bookings.estimated_duration_mins`,
// and the database derives `bookings.estimated_completion_at` from it as a
// GENERATED column. That derivation keys off `started_at` once the job actually
// begins and falls back to `scheduled_at` before then, so a job that starts 20
// minutes late reports a ready-by time 20 minutes later with nothing to
// recompute on the client.
//
// Bookings written before those columns existed are backfilled from the
// `services` JSONB snapshot, and this module applies the same fallback in the
// client so a row that somehow arrives without a duration still renders
// whatever the review screen originally showed the customer.

import { formatShortDate, formatTime, parseISO } from './date';

const MINS_PER_HOUR = 60;
const MILLIS_PER_MINUTE = 60_000;

/**
 * The booking fields these helpers read, as a structural type — a full
 * `Booking` row satisfies it, and so does a partial one built in a test.
 */
export type BookingDurationFields = {
  estimated_duration_mins?: number | null;
  estimated_completion_at?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  services?: unknown;
};

// ── Formatting ────────────────────────────────────────────────────────

/**
 * Formats a minute count for display: "45 min", "2 hr", "1 hr 30 min".
 * Returns '' for missing, zero, or negative input so callers can render
 * nothing rather than "0 min".
 */
export function formatDuration(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return '';

  const total = Math.round(mins);
  if (total < MINS_PER_HOUR) return `${total} min`;

  const hours = Math.floor(total / MINS_PER_HOUR);
  const remainder = total % MINS_PER_HOUR;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

// ── Resolution ────────────────────────────────────────────────────────

/**
 * Sums the `duration_mins` of a booking's services JSONB snapshot.
 * Tolerates the untyped shape of JSONB: non-arrays, non-objects, missing
 * keys, and numeric strings all resolve to a sane number. Returns 0 when
 * nothing usable is present.
 */
export function sumServiceDurationMins(services: unknown): number {
  if (!Array.isArray(services)) return 0;

  return services.reduce<number>((sum, service) => {
    if (typeof service !== 'object' || service === null) return sum;
    const raw = (service as Record<string, unknown>).duration_mins;
    const mins = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(mins) && mins > 0 ? sum + mins : sum;
  }, 0);
}

/**
 * The duration to display for a booking: the provider-committed column when
 * set, otherwise the sum of the services snapshot. Returns null when neither
 * yields a positive duration — an unknown duration is not zero, and callers
 * must render it as absent rather than as "0 min".
 */
export function resolveDurationMins(
  booking: BookingDurationFields,
): number | null {
  const committed = booking.estimated_duration_mins;
  if (committed != null && Number.isFinite(committed) && committed > 0) {
    return Math.round(committed);
  }

  const summed = sumServiceDurationMins(booking.services);
  return summed > 0 ? Math.round(summed) : null;
}

/**
 * Adds a duration to a start instant, returning an ISO string.
 * Returns null if either input is missing or unusable.
 */
export function computeCompletionAt(
  startIso: string | null | undefined,
  mins: number | null | undefined,
): string | null {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return null;

  const start = startIso ? parseISO(startIso) : null;
  if (!start) return null;

  return new Date(
    start.getTime() + Math.round(mins) * MILLIS_PER_MINUTE,
  ).toISOString();
}

/**
 * The ready-by instant for a booking. Prefers the database's generated
 * column; falls back to computing it from the resolved duration for rows that
 * predate it.
 */
export function resolveCompletionAt(
  booking: BookingDurationFields,
): string | null {
  if (booking.estimated_completion_at) return booking.estimated_completion_at;

  const start = booking.started_at ?? booking.scheduled_at ?? null;
  return computeCompletionAt(start, resolveDurationMins(booking));
}

// ── Ready-by display ──────────────────────────────────────────────────

/**
 * Compares two instants by *local* calendar day.
 *
 * Deliberately not `isSameDay` from ./date, which compares UTC calendar days.
 * The question here is what the reader sees on their own clock: a 10pm job
 * finishing at 12:30am has rolled over to tomorrow for them and must show a
 * date, regardless of which UTC day either instant lands on.
 */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats a ready-by time: "~2:30 PM", or "~Wed, Apr 9 at 2:30 PM" when the
 * job runs past local midnight relative to `startIso`. The tilde marks it as
 * an estimate — the provider commits to a duration, not to a wall-clock end.
 * Returns '' when there is nothing to show.
 */
export function formatReadyBy(
  completionIso: string | null | undefined,
  startIso?: string | null,
): string {
  if (!completionIso) return '';

  const completion = parseISO(completionIso);
  if (!completion) return '';

  const time = formatTime(completionIso);
  if (!time) return '';

  const start = startIso ? parseISO(startIso) : null;
  if (start && !isSameLocalDay(start, completion)) {
    return `~${formatShortDate(completionIso)} at ${time}`;
  }

  return `~${time}`;
}

/**
 * One-step ready-by label for a booking row — resolves the completion instant
 * and formats it against the booking's own start. Returns '' when the booking
 * carries no usable duration.
 */
export function formatBookingReadyBy(booking: BookingDurationFields): string {
  const completion = resolveCompletionAt(booking);
  if (!completion) return '';

  return formatReadyBy(completion, booking.started_at ?? booking.scheduled_at);
}
