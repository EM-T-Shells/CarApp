import {
  DAY_KEYS,
  DEFAULT_WORKING_HOURS,
  cloneWorkingHours,
  dayBounds,
  describeDay,
  describeWorkingHours,
  formatClockLabel,
  formatHHMM,
  isDayOpen,
  isWithinWorkingHours,
  localDateKey,
  localDayKey,
  localDayOffset,
  localDayRange,
  minutesIntoLocalDay,
  startOfLocalDay,
  parseHHMM,
  workingHoursFromJson,
  workingHoursToAvailability,
  zoneOffsetMinutes,
  type WorkingHours,
} from '../schedule';

const NY = 'America/New_York';

// ── Clock strings ─────────────────────────────────────────────────────

describe('parseHHMM', () => {
  it('reads a zero-padded 24-hour time as minutes since midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('08:30')).toBe(510);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('rejects anything the database trigger would also refuse', () => {
    expect(parseHHMM('8:30')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('08:60')).toBeNull();
    expect(parseHHMM('8am')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(830)).toBeNull();
  });
});

describe('formatHHMM', () => {
  it('round-trips through parseHHMM', () => {
    for (const value of ['00:00', '08:30', '13:05', '23:59']) {
      expect(formatHHMM(parseHHMM(value)!)).toBe(value);
    }
  });

  it('clamps out-of-range minutes rather than wrapping', () => {
    expect(formatHHMM(-30)).toBe('00:00');
    expect(formatHHMM(5000)).toBe('24:00');
  });
});

describe('formatClockLabel', () => {
  it('renders 12-hour display times', () => {
    expect(formatClockLabel('00:00')).toBe('12:00 AM');
    expect(formatClockLabel('08:00')).toBe('8:00 AM');
    expect(formatClockLabel('12:00')).toBe('12:00 PM');
    expect(formatClockLabel('13:05')).toBe('1:05 PM');
    expect(formatClockLabel('23:30')).toBe('11:30 PM');
  });

  it('passes a malformed value through untouched rather than inventing a time', () => {
    expect(formatClockLabel('nonsense')).toBe('nonsense');
  });
});

// ── Parsing the stored value ──────────────────────────────────────────

describe('workingHoursFromJson', () => {
  it('reads the stored window shape', () => {
    const hours = workingHoursFromJson({
      mon: [{ start: '09:00', end: '17:00' }],
      sat: [],
    });
    expect(hours.mon).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(hours.sat).toEqual([]);
    // A day absent from the object is closed — that is what the shape means.
    expect(hours.wed).toEqual([]);
  });

  it('keeps both windows of a split day, in order', () => {
    const hours = workingHoursFromJson({
      tue: [
        { start: '08:00', end: '12:00' },
        { start: '13:00', end: '18:00' },
      ],
    });
    expect(hours.tue).toHaveLength(2);
    expect(hours.tue[1].start).toBe('13:00');
  });

  // The legacy availability map is still written by older clients and is what
  // every pre-migration row carried.
  it('reads the legacy boolean map, substituting the default window', () => {
    const hours = workingHoursFromJson({
      mon: true,
      tue: true,
      sat: false,
    });
    expect(hours.mon).toEqual([{ start: '08:00', end: '18:00' }]);
    expect(hours.sat).toEqual([]);
  });

  it('reads a row that carries both shapes at once', () => {
    const hours = workingHoursFromJson({
      mon: [{ start: '10:00', end: '14:00' }],
      tue: true,
    });
    expect(hours.mon).toEqual([{ start: '10:00', end: '14:00' }]);
    expect(hours.tue).toEqual([{ start: '08:00', end: '18:00' }]);
  });

  // Absent means "never configured", not "unavailable" — backfilling a null to
  // closed-all-week would silently take a provider off the calendar, which is
  // exactly what the migration's backfill avoids.
  it('falls back to weekdays-open when the value is missing or unusable', () => {
    for (const value of [null, undefined, 'nope', 42, ['mon']]) {
      expect(workingHoursFromJson(value)).toEqual(DEFAULT_WORKING_HOURS);
    }
    expect(workingHoursFromJson({ notaday: true })).toEqual(
      DEFAULT_WORKING_HOURS,
    );
  });

  it('drops a corrupt window instead of repairing it', () => {
    const hours = workingHoursFromJson({
      mon: [
        { start: '09:00', end: '17:00' },
        { start: '18:00', end: '09:00' }, // ends before it starts
        { start: '9am', end: '5pm' }, // wrong grammar
        { start: '09:00' }, // no end
      ],
    });
    expect(hours.mon).toEqual([{ start: '09:00', end: '17:00' }]);
  });
});

describe('cloneWorkingHours', () => {
  it('copies deeply enough that editing a day cannot mutate the source', () => {
    const copy = cloneWorkingHours(DEFAULT_WORKING_HOURS);
    copy.mon[0].start = '05:00';
    copy.sat.push({ start: '10:00', end: '12:00' });
    expect(DEFAULT_WORKING_HOURS.mon[0].start).toBe('08:00');
    expect(DEFAULT_WORKING_HOURS.sat).toEqual([]);
  });
});

describe('workingHoursToAvailability', () => {
  it('projects windows back onto the legacy boolean map', () => {
    const hours = workingHoursFromJson({
      mon: [{ start: '09:00', end: '17:00' }],
      sat: [],
    });
    const availability = workingHoursToAvailability(hours);
    expect(availability.mon).toBe(true);
    expect(availability.sat).toBe(false);
    expect(availability.wed).toBe(false);
  });
});

// ── Timezone projection ───────────────────────────────────────────────

describe('zoneOffsetMinutes', () => {
  it('tracks the seasonal offset rather than a fixed one', () => {
    expect(zoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), NY)).toBe(-300);
    expect(zoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), NY)).toBe(-240);
  });

  it('handles zones east of Greenwich and half-hour offsets', () => {
    expect(zoneOffsetMinutes(new Date('2026-09-14T13:30:00Z'), 'UTC')).toBe(0);
    expect(
      zoneOffsetMinutes(new Date('2026-09-14T13:30:00Z'), 'Asia/Kolkata'),
    ).toBe(330);
  });

  // The reason provider_profiles.timezone exists at all: on 2026-03-08 the US
  // springs forward at 02:00 local, so two instants an hour apart sit on
  // different offsets.
  it('changes across a DST boundary', () => {
    expect(zoneOffsetMinutes(new Date('2026-03-08T06:30:00Z'), NY)).toBe(-300);
    expect(zoneOffsetMinutes(new Date('2026-03-08T07:30:00Z'), NY)).toBe(-240);
  });

  it('falls back to the device offset for an unresolvable zone', () => {
    // Jest pins TZ=UTC (jest.globalSetup.js), so the device offset is 0.
    expect(zoneOffsetMinutes(new Date('2026-09-14T13:30:00Z'), 'Mars/Olympus')).toBe(0);
  });
});

describe('localDayKey', () => {
  it('uses the provider day, not the UTC day', () => {
    // 02:00 UTC Tuesday is still 22:00 Monday in New York.
    const instant = new Date('2026-09-15T02:00:00Z');
    expect(localDayKey(instant, 'UTC')).toBe('tue');
    expect(localDayKey(instant, NY)).toBe('mon');
  });
});

describe('minutesIntoLocalDay', () => {
  it('measures from local midnight', () => {
    const instant = new Date('2026-09-14T14:00:00Z'); // 10:00 in New York
    expect(minutesIntoLocalDay(instant, NY)).toBe(600);
    expect(minutesIntoLocalDay(instant, 'UTC')).toBe(840);
  });

  it('handles an instant that is the previous local day', () => {
    // 22:00 the day before.
    expect(minutesIntoLocalDay(new Date('2026-09-15T02:00:00Z'), NY)).toBe(1320);
  });
});

describe('localDateKey', () => {
  it('groups by the provider calendar date', () => {
    const instant = new Date('2026-09-15T02:00:00Z');
    expect(localDateKey(instant, 'UTC')).toBe('2026-09-15');
    expect(localDateKey(instant, NY)).toBe('2026-09-14');
  });
});

// ── Working-hours queries ─────────────────────────────────────────────

const NINE_TO_FIVE: WorkingHours = workingHoursFromJson({
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [
    { start: '08:00', end: '12:00' },
    { start: '13:00', end: '18:00' },
  ],
});

describe('isDayOpen / windowsForDay', () => {
  it('is true only for days with at least one window', () => {
    expect(isDayOpen(NINE_TO_FIVE, 'mon')).toBe(true);
    expect(isDayOpen(NINE_TO_FIVE, 'sun')).toBe(false);
  });
});

describe('isWithinWorkingHours', () => {
  it('accepts an instant inside a window, in the provider zone', () => {
    // 14:00 UTC = 10:00 Monday in New York.
    expect(
      isWithinWorkingHours(new Date('2026-09-14T14:00:00Z'), NINE_TO_FIVE, NY),
    ).toBe(true);
  });

  it('rejects the same instant when the provider is in a different zone', () => {
    // 10:00 New York is 19:00 in Kolkata — past closing on their Monday.
    expect(
      isWithinWorkingHours(
        new Date('2026-09-14T14:00:00Z'),
        NINE_TO_FIVE,
        'Asia/Kolkata',
      ),
    ).toBe(false);
  });

  // Half-open, matching bookings.occupied_range: a job starting exactly at
  // closing time is outside the day.
  it('treats the closing minute as outside the window', () => {
    expect(
      isWithinWorkingHours(new Date('2026-09-14T21:00:00Z'), NINE_TO_FIVE, NY),
    ).toBe(false); // 17:00 exactly
    expect(
      isWithinWorkingHours(new Date('2026-09-14T20:59:00Z'), NINE_TO_FIVE, NY),
    ).toBe(true); // 16:59
  });

  it('falls into the gap between two windows of a split day', () => {
    // Tuesday 12:30 New York sits in the lunch break.
    expect(
      isWithinWorkingHours(new Date('2026-09-15T16:30:00Z'), NINE_TO_FIVE, NY),
    ).toBe(false);
    expect(
      isWithinWorkingHours(new Date('2026-09-15T17:30:00Z'), NINE_TO_FIVE, NY),
    ).toBe(true); // 13:30
  });

  it('is false on a closed day', () => {
    expect(
      isWithinWorkingHours(new Date('2026-09-19T14:00:00Z'), NINE_TO_FIVE, NY),
    ).toBe(false);
  });
});

describe('dayBounds', () => {
  it('spans the outer edges of every window on the day', () => {
    expect(dayBounds(NINE_TO_FIVE, 'mon')).toEqual({ open: 540, close: 1020 });
    expect(dayBounds(NINE_TO_FIVE, 'tue')).toEqual({ open: 480, close: 1080 });
  });

  it('is null for a closed day', () => {
    expect(dayBounds(NINE_TO_FIVE, 'sun')).toBeNull();
  });
});

describe('describeDay', () => {
  it('renders one window, two windows, and a closed day', () => {
    expect(describeDay(NINE_TO_FIVE, 'mon')).toBe('9:00 AM – 5:00 PM');
    expect(describeDay(NINE_TO_FIVE, 'tue')).toBe(
      '8:00 AM – 12:00 PM, 1:00 PM – 6:00 PM',
    );
    expect(describeDay(NINE_TO_FIVE, 'sun')).toBe('Closed');
  });
});

describe('describeWorkingHours', () => {
  it('collapses a uniform contiguous run into a range', () => {
    expect(describeWorkingHours(DEFAULT_WORKING_HOURS)).toBe(
      'Mon–Fri, 8:00 AM – 6:00 PM',
    );
  });

  it('lists days when they are uniform but not contiguous', () => {
    const hours = workingHoursFromJson({
      mon: [{ start: '08:00', end: '18:00' }],
      thu: [{ start: '08:00', end: '18:00' }],
    });
    expect(describeWorkingHours(hours)).toBe('Mon, Thu, 8:00 AM – 6:00 PM');
  });

  // A short Saturday must not read as if every day matched it.
  it('refuses to collapse days that differ', () => {
    const hours = workingHoursFromJson({
      mon: [{ start: '08:00', end: '18:00' }],
      sat: [{ start: '10:00', end: '12:00' }],
    });
    expect(describeWorkingHours(hours)).toBe('2 days a week');
  });

  it('says so when nothing is set', () => {
    const closed = workingHoursFromJson({ mon: [], tue: [] });
    expect(describeWorkingHours(closed)).toBe('No days set');
  });
});

describe('DAY_KEYS', () => {
  it('runs Monday first', () => {
    expect(DAY_KEYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});

// ── Local day boundaries ──────────────────────────────────────────────

describe('startOfLocalDay', () => {
  it('returns local midnight as a UTC instant, not UTC midnight', () => {
    // 20:00 on Jan 14 in New York (EST, -05:00).
    const start = startOfLocalDay(new Date('2026-01-15T01:00:00Z'), NY);
    expect(start.toISOString()).toBe('2026-01-14T05:00:00.000Z');
  });

  it('uses the offset in effect at midnight, not the one at the given instant', () => {
    // 2026-03-08 is the US spring-forward. At 18:00Z New York is already EDT
    // (-04:00), but midnight that morning was still EST (-05:00). Subtracting
    // the instant's own offset would land at 04:00Z — an hour into the day.
    const start = startOfLocalDay(new Date('2026-03-08T18:00:00Z'), NY);
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('is idempotent — the start of a day is its own day start', () => {
    const once = startOfLocalDay(new Date('2026-03-08T18:00:00Z'), NY);
    expect(startOfLocalDay(once, NY).toISOString()).toBe(once.toISOString());
  });
});

describe('localDayRange', () => {
  it('spans exactly 24 hours on an ordinary day', () => {
    const { start, end } = localDayRange(new Date('2026-01-15T01:00:00Z'), NY);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(24);
  });

  // The reason end is not start + 24h. A fixed addition would leave the range
  // an hour short or long on exactly the days a provider's calendar is most
  // likely to be misread.
  it('spans 23 hours on the spring-forward day', () => {
    const { start, end } = localDayRange(new Date('2026-03-08T18:00:00Z'), NY);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
    expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('spans 25 hours on the fall-back day', () => {
    // 2026-11-01 is the US autumn transition.
    const { start, end } = localDayRange(new Date('2026-11-01T15:00:00Z'), NY);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it('is half-open — the end is the next day start', () => {
    const { end } = localDayRange(new Date('2026-01-15T01:00:00Z'), NY);
    expect(startOfLocalDay(end, NY).toISOString()).toBe(end.toISOString());
  });
});

describe('localDayOffset', () => {
  const ref = new Date('2026-01-15T17:00:00Z'); // Jan 15 noon in NY

  it('is zero for two instants on the same local day', () => {
    expect(localDayOffset(new Date('2026-01-15T05:00:00Z'), ref, NY)).toBe(0);
    expect(localDayOffset(new Date('2026-01-16T04:59:00Z'), ref, NY)).toBe(0);
  });

  it('signs the difference, so tomorrow is +1 and yesterday is -1', () => {
    expect(localDayOffset(new Date('2026-01-16T05:00:00Z'), ref, NY)).toBe(1);
    expect(localDayOffset(new Date('2026-01-14T05:00:00Z'), ref, NY)).toBe(-1);
  });

  // 23 and 25-hour days both have to round to one, or a job either side of a
  // DST boundary lands on the wrong day of the timeline.
  it('counts a DST day as one day', () => {
    const before = new Date('2026-03-07T17:00:00Z');
    const after = new Date('2026-03-09T16:00:00Z');
    const dst = new Date('2026-03-08T17:00:00Z');
    expect(localDayOffset(dst, before, NY)).toBe(1);
    expect(localDayOffset(after, dst, NY)).toBe(1);
    expect(localDayOffset(after, before, NY)).toBe(2);
  });

  it('reads the same instant differently in two zones', () => {
    // 02:00Z on Jan 15 is still Jan 14 in New York but already Jan 15 in UTC.
    const instant = new Date('2026-01-15T02:00:00Z');
    expect(localDayOffset(instant, ref, NY)).toBe(-1);
    expect(localDayOffset(instant, ref, 'UTC')).toBe(0);
  });
});
