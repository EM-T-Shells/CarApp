// Schedule utilities — working hours, provider timezones, and the arithmetic
// the day timeline needs. Phase 1 of the quote-first booking redesign.
//
// Two ideas the rest of the app depends on:
//
//   1. Working hours are WALL-CLOCK, not instants. "I work 8–6" means 8am where
//      the provider is, which is a different UTC offset in January than in
//      July. So they are stored as "HH:MM" strings plus an IANA timezone on the
//      provider, and every comparison against a real booking happens by
//      projecting that booking into the provider's local day — never by
//      converting the hours into timestamps.
//
//   2. The device's timezone is not the provider's. It usually is, which is
//      exactly why relying on it hides the bug until someone travels or a
//      customer in another zone opens a provider's page.
//
// Storage shape (provider_profiles.working_hours, migration 20260819000000):
//   { "mon": [{ "start": "08:00", "end": "18:00" }], "sat": [] }
// An empty array means closed; a missing day also means closed. Windows are an
// array because a split day is real — mornings and evenings, or a lunch break.

// ── Types ─────────────────────────────────────────────────────────────

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** A local wall-clock window. Both ends are "HH:MM" in 24-hour form. */
export interface TimeWindow {
  start: string;
  end: string;
}

export type WorkingHours = Record<DayKey, TimeWindow[]>;

/** Monday-first, matching how the week reads in the provider UI. */
export const DAY_KEYS: readonly DayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const DAY_SHORT_LABELS: Record<DayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export const MINUTES_PER_DAY = 1440;

/** The launch market. Matches the column default in migration 20260819000000. */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * The window the boolean availability map never carried. Migration
 * 20260819000000 backfills with exactly this, so a provider who set days but
 * never times sees the same hours here and in the database.
 */
export const DEFAULT_WINDOW: TimeWindow = { start: '08:00', end: '18:00' };

/**
 * Weekdays open, weekend closed — the same shape DEFAULT_AVAILABILITY has
 * always given the day picker. Used whenever working_hours is absent, so a
 * provider who has never opened the editor is not silently taken off the
 * calendar.
 */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  mon: [{ ...DEFAULT_WINDOW }],
  tue: [{ ...DEFAULT_WINDOW }],
  wed: [{ ...DEFAULT_WINDOW }],
  thu: [{ ...DEFAULT_WINDOW }],
  fri: [{ ...DEFAULT_WINDOW }],
  sat: [],
  sun: [],
};

// ── Clock strings ─────────────────────────────────────────────────────

const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/**
 * "HH:MM" → minutes since local midnight, or null if malformed. The database
 * trigger enforces the same grammar, so null here means the value came from
 * somewhere else — a stale client, or a hand-edited row.
 */
export function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = HHMM.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight → "HH:MM". Values outside a day are clamped. */
export function formatHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "08:00" → "8:00 AM". Display only; never round-trip through this. */
export function formatClockLabel(value: string): string {
  const minutes = parseHHMM(value);
  if (minutes === null) return value;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ── Parsing the stored value ──────────────────────────────────────────

function windowFromJson(value: unknown): TimeWindow | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const start = parseHHMM(record.start);
  const end = parseHHMM(record.end);
  // A window that ends before it starts is dropped rather than repaired: the
  // database refuses to store one, so anything reaching here is corrupt, and
  // guessing at the intent would put a provider on the calendar at a time they
  // never chose.
  if (start === null || end === null || end <= start) return null;
  return { start: record.start as string, end: record.end as string };
}

/**
 * Coerce a stored `provider_profiles.working_hours` value into a full
 * WorkingHours.
 *
 * Reads **both shapes**. The new one is the array of windows; the legacy one is
 * the `availability` boolean map (`{ "mon": true }`), which is still written by
 * older clients and is what every pre-migration row carried. A legacy `true`
 * becomes the default 08:00–18:00 window — the same substitution the migration's
 * backfill makes, so the two can never disagree.
 *
 * A null or unrecognisable value falls back to DEFAULT_WORKING_HOURS rather
 * than to "closed all week", for the same reason the backfill does: absent
 * means "never configured", not "unavailable".
 */
export function workingHoursFromJson(value: unknown): WorkingHours {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return cloneWorkingHours(DEFAULT_WORKING_HOURS);
  }

  const record = value as Record<string, unknown>;
  const result = {} as WorkingHours;
  let recognised = false;

  for (const key of DAY_KEYS) {
    const raw = record[key];

    if (Array.isArray(raw)) {
      result[key] = raw
        .map(windowFromJson)
        .filter((w): w is TimeWindow => w !== null);
      recognised = true;
      continue;
    }

    if (typeof raw === 'boolean') {
      result[key] = raw ? [{ ...DEFAULT_WINDOW }] : [];
      recognised = true;
      continue;
    }

    // Missing day = closed, which is what the storage shape means. This only
    // stands if at least one other day was understood; see below.
    result[key] = [];
  }

  return recognised ? result : cloneWorkingHours(DEFAULT_WORKING_HOURS);
}

/** Deep copy, so callers can edit a day without mutating a shared constant. */
export function cloneWorkingHours(hours: WorkingHours): WorkingHours {
  const copy = {} as WorkingHours;
  for (const key of DAY_KEYS) {
    copy[key] = (hours[key] ?? []).map((w) => ({ ...w }));
  }
  return copy;
}

/**
 * Project working hours back onto the legacy boolean map, so a screen still
 * writing `availability` keeps agreeing with the windows. A day is "available"
 * when it has at least one window.
 */
export function workingHoursToAvailability(
  hours: WorkingHours,
): Record<DayKey, boolean> {
  const result = {} as Record<DayKey, boolean>;
  for (const key of DAY_KEYS) {
    result[key] = (hours[key] ?? []).length > 0;
  }
  return result;
}

// ── Timezone projection ───────────────────────────────────────────────

const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

/**
 * A formatter pinned to `timeZone`, or null when the runtime cannot build one.
 *
 * Hermes ships Intl with timezone support on both platforms, but a build
 * without full ICU throws on an unknown zone rather than falling back. Caching
 * the null keeps a bad timezone from re-throwing on every frame of a timeline
 * render.
 */
function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  if (formatterCache.has(timeZone)) {
    return formatterCache.get(timeZone) ?? null;
  }
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    // Building the formatter is not enough — some engines only reject an
    // unknown zone at format time.
    formatter.format(new Date());
  } catch {
    formatter = null;
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * Minutes east of UTC for `timeZone` at `date`. Positive east of Greenwich.
 *
 * Falls back to the device's own offset when the runtime cannot resolve the
 * zone, which degrades to today's behaviour rather than to a wrong answer in a
 * fixed direction.
 */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = zonedFormatter(timeZone);
  if (!formatter) {
    // Negating a zero offset yields -0, which is a real value that fails an
    // Object.is comparison against 0. Normalise it here so callers never have
    // to think about it.
    const deviceOffset = -date.getTimezoneOffset();
    return deviceOffset === 0 ? 0 : deviceOffset;
  }

  const parts = formatter.formatToParts(date);
  const read = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };

  // en-US with hour12: false renders midnight as "24" in some engines.
  const hour = read('hour') % 24;
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * The same instant expressed as a Date whose **UTC** fields read as the local
 * wall clock in `timeZone`. Never render this directly — it is a calculation
 * intermediate, and its true instant is wrong by exactly the zone offset.
 */
function toZonedClock(date: Date, timeZone: string): Date {
  return new Date(date.getTime() + zoneOffsetMinutes(date, timeZone) * 60_000);
}

const DAY_BY_INDEX: readonly DayKey[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

/** Which day of the provider's week an instant falls on. */
export function localDayKey(date: Date, timeZone: string): DayKey {
  return DAY_BY_INDEX[toZonedClock(date, timeZone).getUTCDay()];
}

/** Minutes since local midnight, 0–1439. The timeline's y-axis. */
export function minutesIntoLocalDay(date: Date, timeZone: string): number {
  const clock = toZonedClock(date, timeZone);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

/** Local calendar date as "YYYY-MM-DD" — the key a day view groups on. */
export function localDateKey(date: Date, timeZone: string): string {
  return toZonedClock(date, timeZone).toISOString().slice(0, 10);
}

// ── Working-hours queries ─────────────────────────────────────────────

/** The windows for one day, always an array. */
export function windowsForDay(
  hours: WorkingHours,
  day: DayKey,
): TimeWindow[] {
  return hours[day] ?? [];
}

/** Whether a provider works at all on a given day of the week. */
export function isDayOpen(hours: WorkingHours, day: DayKey): boolean {
  return windowsForDay(hours, day).length > 0;
}

/**
 * Whether an instant falls inside the provider's stated hours.
 *
 * Advisory only. The database does not refuse a booking outside these hours —
 * they are a preference, not an invariant — so this drives warnings and
 * greying, never a hard block.
 */
export function isWithinWorkingHours(
  date: Date,
  hours: WorkingHours,
  timeZone: string,
): boolean {
  const day = localDayKey(date, timeZone);
  const minutes = minutesIntoLocalDay(date, timeZone);
  return windowsForDay(hours, day).some((window) => {
    const start = parseHHMM(window.start);
    const end = parseHHMM(window.end);
    if (start === null || end === null) return false;
    // Half-open, matching bookings.occupied_range: a job starting exactly at
    // closing time is outside the day, not inside it.
    return minutes >= start && minutes < end;
  });
}

/**
 * The earliest opening and latest closing across a day's windows, as minutes.
 * Null when the day is closed. The timeline uses it to decide how much of the
 * 24 hours is worth drawing.
 */
export function dayBounds(
  hours: WorkingHours,
  day: DayKey,
): { open: number; close: number } | null {
  const windows = windowsForDay(hours, day);
  let open: number | null = null;
  let close: number | null = null;

  for (const window of windows) {
    const start = parseHHMM(window.start);
    const end = parseHHMM(window.end);
    if (start === null || end === null) continue;
    open = open === null ? start : Math.min(open, start);
    close = close === null ? end : Math.max(close, end);
  }

  return open === null || close === null ? null : { open, close };
}

/** "8:00 AM – 6:00 PM", two windows joined, or "Closed". */
export function describeDay(hours: WorkingHours, day: DayKey): string {
  const windows = windowsForDay(hours, day);
  if (windows.length === 0) return 'Closed';
  return windows
    .map((w) => `${formatClockLabel(w.start)} – ${formatClockLabel(w.end)}`)
    .join(', ');
}

/**
 * A one-line summary for a settings row: "Mon–Fri, 8:00 AM – 6:00 PM" when
 * every open day is identical, otherwise the count of open days. Collapsing
 * only the uniform case keeps the label honest — a provider with a short
 * Saturday should not read as if every day matched.
 */
export function describeWorkingHours(hours: WorkingHours): string {
  const openDays = DAY_KEYS.filter((day) => isDayOpen(hours, day));
  if (openDays.length === 0) return 'No days set';

  const first = describeDay(hours, openDays[0]);
  const uniform = openDays.every((day) => describeDay(hours, day) === first);
  if (!uniform) {
    return `${openDays.length} day${openDays.length === 1 ? '' : 's'} a week`;
  }

  const labels = openDays.map((day) => DAY_SHORT_LABELS[day]);
  const contiguous = openDays.every(
    (day, i) => DAY_KEYS.indexOf(day) === DAY_KEYS.indexOf(openDays[0]) + i,
  );
  const dayLabel =
    openDays.length > 2 && contiguous
      ? `${labels[0]}–${labels[labels.length - 1]}`
      : labels.join(', ');

  return `${dayLabel}, ${first}`;
}
