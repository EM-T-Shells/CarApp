import {
  parseISO,
  formatDate,
  formatTime,
  formatDateTime,
  formatShortDate,
  formatRelativeTime,
  isWithin24Hours,
  isWithinDisputeWindow,
  isPast,
  isFuture,
  isSameDay,
} from '../date';

// Fix timezone for deterministic formatting tests
const FIXED_ISO = '2026-04-09T14:30:00.000Z';
const FIXED_DATE = new Date(FIXED_ISO);

// ── parseISO ──────────────────────────────────────────────────────────

describe('parseISO', () => {
  it('parses a valid ISO string into a Date', () => {
    const result = parseISO(FIXED_ISO);
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe(FIXED_ISO);
  });

  it('returns null for an invalid string', () => {
    expect(parseISO('not-a-date')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseISO('')).toBeNull();
  });
});

// ── formatDate ────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a valid ISO string as a short date', () => {
    const result = formatDate(FIXED_ISO);
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/2026/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatDate('bad')).toBe('');
  });
});

// ── formatTime ────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats a valid ISO string as a time', () => {
    const result = formatTime(FIXED_ISO);
    expect(result).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatTime('bad')).toBe('');
  });
});

// ── formatDateTime ────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('formats as date + time with "at" separator', () => {
    const result = formatDateTime(FIXED_ISO);
    expect(result).toContain('at');
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/(AM|PM)/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateTime('bad')).toBe('');
  });
});

// ── formatShortDate ───────────────────────────────────────────────────

describe('formatShortDate', () => {
  it('includes weekday abbreviation', () => {
    const result = formatShortDate(FIXED_ISO);
    expect(result).toMatch(/\w{3},/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatShortDate('bad')).toBe('');
  });
});

// ── formatRelativeTime ────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('returns "just now" for less than a minute ago', () => {
    const now = new Date(FIXED_DATE.getTime() + 30_000);
    expect(formatRelativeTime(FIXED_ISO, now)).toBe('just now');
  });

  it('returns minutes ago for less than an hour', () => {
    const now = new Date(FIXED_DATE.getTime() + 5 * 60_000);
    expect(formatRelativeTime(FIXED_ISO, now)).toBe('5m ago');
  });

  it('returns hours ago for less than a day', () => {
    const now = new Date(FIXED_DATE.getTime() + 3 * 3_600_000);
    expect(formatRelativeTime(FIXED_ISO, now)).toBe('3h ago');
  });

  it('returns days ago for 1-7 days', () => {
    const now = new Date(FIXED_DATE.getTime() + 2 * 86_400_000);
    expect(formatRelativeTime(FIXED_ISO, now)).toBe('2d ago');
  });

  it('falls back to formatted date for older than 7 days', () => {
    const now = new Date(FIXED_DATE.getTime() + 10 * 86_400_000);
    const result = formatRelativeTime(FIXED_ISO, now);
    expect(result).toMatch(/Apr/);
    expect(result).toMatch(/2026/);
  });

  it('falls back to formatted date for future dates', () => {
    const now = new Date(FIXED_DATE.getTime() - 60_000);
    const result = formatRelativeTime(FIXED_ISO, now);
    expect(result).toMatch(/Apr/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatRelativeTime('bad')).toBe('');
  });
});

// ── isWithin24Hours ───────────────────────────────────────────────────

describe('isWithin24Hours', () => {
  it('returns true when scheduled time is within 24 hours', () => {
    const now = new Date(FIXED_DATE.getTime() - 12 * 3_600_000);
    expect(isWithin24Hours(FIXED_ISO, now)).toBe(true);
  });

  it('returns true when scheduled time is exactly now', () => {
    expect(isWithin24Hours(FIXED_ISO, FIXED_DATE)).toBe(true);
  });

  it('returns false when scheduled time is more than 24 hours away', () => {
    const now = new Date(FIXED_DATE.getTime() - 25 * 3_600_000);
    expect(isWithin24Hours(FIXED_ISO, now)).toBe(false);
  });

  it('returns false when scheduled time is in the past', () => {
    const now = new Date(FIXED_DATE.getTime() + 1_000);
    expect(isWithin24Hours(FIXED_ISO, now)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isWithin24Hours('bad')).toBe(false);
  });
});

// ── isWithinDisputeWindow ─────────────────────────────────────────────

describe('isWithinDisputeWindow', () => {
  it('returns true within 48 hours of completion', () => {
    const now = new Date(FIXED_DATE.getTime() + 24 * 3_600_000);
    expect(isWithinDisputeWindow(FIXED_ISO, now)).toBe(true);
  });

  it('returns true at exactly the completion time', () => {
    expect(isWithinDisputeWindow(FIXED_ISO, FIXED_DATE)).toBe(true);
  });

  it('returns false after 48 hours', () => {
    const now = new Date(FIXED_DATE.getTime() + 49 * 3_600_000);
    expect(isWithinDisputeWindow(FIXED_ISO, now)).toBe(false);
  });

  it('returns false before the completion time', () => {
    const now = new Date(FIXED_DATE.getTime() - 1_000);
    expect(isWithinDisputeWindow(FIXED_ISO, now)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isWithinDisputeWindow('bad')).toBe(false);
  });
});

// ── isPast / isFuture ─────────────────────────────────────────────────

describe('isPast', () => {
  it('returns true for a date in the past', () => {
    const now = new Date(FIXED_DATE.getTime() + 1_000);
    expect(isPast(FIXED_ISO, now)).toBe(true);
  });

  it('returns false for a date in the future', () => {
    const now = new Date(FIXED_DATE.getTime() - 1_000);
    expect(isPast(FIXED_ISO, now)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isPast('bad')).toBe(false);
  });
});

describe('isFuture', () => {
  it('returns true for a date in the future', () => {
    const now = new Date(FIXED_DATE.getTime() - 1_000);
    expect(isFuture(FIXED_ISO, now)).toBe(true);
  });

  it('returns false for a date in the past', () => {
    const now = new Date(FIXED_DATE.getTime() + 1_000);
    expect(isFuture(FIXED_ISO, now)).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isFuture('bad')).toBe(false);
  });
});

// ── isSameDay ─────────────────────────────────────────────────────────

describe('isSameDay', () => {
  it('returns true for two timestamps on the same calendar day', () => {
    expect(isSameDay(
      '2026-04-09T08:00:00.000Z',
      '2026-04-09T23:59:59.000Z',
    )).toBe(true);
  });

  it('returns false for two different calendar days', () => {
    expect(isSameDay(
      '2026-04-09T23:59:59.000Z',
      '2026-04-10T00:00:00.000Z',
    )).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isSameDay('bad', FIXED_ISO)).toBe(false);
    expect(isSameDay(FIXED_ISO, 'bad')).toBe(false);
  });
});
