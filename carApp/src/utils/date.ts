// Date utilities — single source of truth for all date/time operations in CarApp.
// All dates are stored as ISO 8601 strings (TIMESTAMPTZ) in the database.
// No component should ever parse or format dates directly.

const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_HOUR = 3_600_000;
const MILLIS_PER_DAY = 86_400_000;

// ── Parsing ───────────────────────────────────────────────────────────

/**
 * Parses an ISO string into a Date object.
 * Returns null if the string is invalid.
 */
export function parseISO(iso: string): Date | null {
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

// ── Display Formatting ────────────────────────────────────────────────

/**
 * Formats an ISO string as a short date: "Apr 9, 2026"
 */
export function formatDate(iso: string): string {
  const date = parseISO(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO string as time: "2:30 PM"
 */
export function formatTime(iso: string): string {
  const date = parseISO(iso);
  if (!date) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats an ISO string as date + time: "Apr 9, 2026 at 2:30 PM"
 */
export function formatDateTime(iso: string): string {
  const date = formatDate(iso);
  const time = formatTime(iso);
  if (!date || !time) return '';
  return `${date} at ${time}`;
}

/**
 * Formats an ISO string as a short weekday + date: "Wed, Apr 9"
 */
export function formatShortDate(iso: string): string {
  const date = parseISO(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ── Relative Time ─────────────────────────────────────────────────────

/**
 * Returns a human-readable relative time string.
 * Examples: "just now", "5m ago", "2h ago", "3d ago", "Apr 9, 2026"
 * Falls back to formatted date for anything older than 7 days.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = parseISO(iso);
  if (!date) return '';

  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return formatDate(iso);
  if (diffMs < MILLIS_PER_MINUTE) return 'just now';
  if (diffMs < MILLIS_PER_HOUR) return `${Math.floor(diffMs / MILLIS_PER_MINUTE)}m ago`;
  if (diffMs < MILLIS_PER_DAY) return `${Math.floor(diffMs / MILLIS_PER_HOUR)}h ago`;

  const days = Math.floor(diffMs / MILLIS_PER_DAY);
  if (days <= 7) return `${days}d ago`;

  return formatDate(iso);
}

// ── Business Logic Helpers ────────────────────────────────────────────

/**
 * Returns true if the booking's scheduled time is within 24 hours from now.
 * Used to determine deposit forfeiture on late cancellations.
 */
export function isWithin24Hours(scheduledIso: string, now: Date = new Date()): boolean {
  const scheduled = parseISO(scheduledIso);
  if (!scheduled) return false;
  const diffMs = scheduled.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= 24 * MILLIS_PER_HOUR;
}

/**
 * Returns true if the current time is within the 48-hour dispute window
 * after the given timestamp (typically booking completion time).
 */
export function isWithinDisputeWindow(completedIso: string, now: Date = new Date()): boolean {
  const completed = parseISO(completedIso);
  if (!completed) return false;
  const diffMs = now.getTime() - completed.getTime();
  return diffMs >= 0 && diffMs <= 48 * MILLIS_PER_HOUR;
}

// ── Comparison Helpers ────────────────────────────────────────────────

/**
 * Returns true if the ISO string represents a date in the past.
 */
export function isPast(iso: string, now: Date = new Date()): boolean {
  const date = parseISO(iso);
  if (!date) return false;
  return date.getTime() < now.getTime();
}

/**
 * Returns true if the ISO string represents a date in the future.
 */
export function isFuture(iso: string, now: Date = new Date()): boolean {
  const date = parseISO(iso);
  if (!date) return false;
  return date.getTime() > now.getTime();
}

/**
 * Returns true if two ISO strings fall on the same calendar day.
 */
export function isSameDay(isoA: string, isoB: string): boolean {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
