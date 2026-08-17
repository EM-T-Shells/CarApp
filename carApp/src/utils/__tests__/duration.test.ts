import {
  formatDuration,
  sumServiceDurationMins,
  resolveDurationMins,
  computeCompletionAt,
  resolveCompletionAt,
  formatReadyBy,
  formatBookingReadyBy,
} from '../duration';

// Tests run under TZ=UTC (see jest config), so local-time formatting is
// deterministic and local calendar days line up with UTC ones.
const START_ISO = '2026-04-09T14:30:00.000Z';

// ── formatDuration ────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats sub-hour durations in minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(59)).toBe('59 min');
  });

  it('formats whole hours without a minute remainder', () => {
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(120)).toBe('2 hr');
  });

  it('formats hours with a remainder', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatDuration(135)).toBe('2 hr 15 min');
  });

  it('returns an empty string for missing or non-positive input', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-30)).toBe('');
  });

  it('returns an empty string for non-finite input', () => {
    expect(formatDuration(NaN)).toBe('');
    expect(formatDuration(Infinity)).toBe('');
  });

  it('rounds fractional minutes', () => {
    expect(formatDuration(44.6)).toBe('45 min');
    expect(formatDuration(89.4)).toBe('1 hr 29 min');
  });
});

// ── sumServiceDurationMins ────────────────────────────────────────────

describe('sumServiceDurationMins', () => {
  it('sums duration_mins across the snapshot', () => {
    expect(
      sumServiceDurationMins([{ duration_mins: 90 }, { duration_mins: 45 }]),
    ).toBe(135);
  });

  it('coerces numeric strings, as JSONB may carry them', () => {
    expect(sumServiceDurationMins([{ duration_mins: '60' }])).toBe(60);
  });

  it('skips entries with a missing, null, or unparseable duration', () => {
    expect(
      sumServiceDurationMins([
        { duration_mins: 60 },
        { duration_mins: null },
        { name: 'no duration key' },
        { duration_mins: 'not a number' },
      ]),
    ).toBe(60);
  });

  it('skips non-object entries', () => {
    expect(sumServiceDurationMins([{ duration_mins: 30 }, null, 'x', 7])).toBe(
      30,
    );
  });

  it('ignores negative and zero durations', () => {
    expect(
      sumServiceDurationMins([{ duration_mins: -30 }, { duration_mins: 0 }]),
    ).toBe(0);
  });

  it('returns 0 for anything that is not an array', () => {
    expect(sumServiceDurationMins(null)).toBe(0);
    expect(sumServiceDurationMins(undefined)).toBe(0);
    expect(sumServiceDurationMins({ duration_mins: 60 })).toBe(0);
    expect(sumServiceDurationMins('60')).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(sumServiceDurationMins([])).toBe(0);
  });
});

// ── resolveDurationMins ───────────────────────────────────────────────

describe('resolveDurationMins', () => {
  it('prefers the committed column over the services snapshot', () => {
    expect(
      resolveDurationMins({
        estimated_duration_mins: 120,
        services: [{ duration_mins: 90 }],
      }),
    ).toBe(120);
  });

  it('falls back to the snapshot when the column is null', () => {
    expect(
      resolveDurationMins({
        estimated_duration_mins: null,
        services: [{ duration_mins: 90 }, { duration_mins: 45 }],
      }),
    ).toBe(135);
  });

  it('falls back when the column is non-positive rather than trusting it', () => {
    expect(
      resolveDurationMins({
        estimated_duration_mins: 0,
        services: [{ duration_mins: 90 }],
      }),
    ).toBe(90);
  });

  it('returns null when neither source yields a duration', () => {
    expect(resolveDurationMins({})).toBeNull();
    expect(
      resolveDurationMins({ estimated_duration_mins: null, services: [] }),
    ).toBeNull();
  });

  it('distinguishes an unknown duration from a zero one', () => {
    // An unknown duration must not collapse to 0, or "ready by" would render
    // as "ready immediately".
    expect(resolveDurationMins({ services: [] })).not.toBe(0);
  });
});

// ── computeCompletionAt ───────────────────────────────────────────────

describe('computeCompletionAt', () => {
  it('adds the duration to the start instant', () => {
    expect(computeCompletionAt(START_ISO, 90)).toBe('2026-04-09T16:00:00.000Z');
  });

  it('crosses a day boundary correctly', () => {
    expect(computeCompletionAt('2026-04-09T23:00:00.000Z', 120)).toBe(
      '2026-04-10T01:00:00.000Z',
    );
  });

  it('returns null without a usable duration', () => {
    expect(computeCompletionAt(START_ISO, null)).toBeNull();
    expect(computeCompletionAt(START_ISO, 0)).toBeNull();
    expect(computeCompletionAt(START_ISO, -60)).toBeNull();
  });

  it('returns null without a usable start', () => {
    expect(computeCompletionAt(null, 90)).toBeNull();
    expect(computeCompletionAt('', 90)).toBeNull();
    expect(computeCompletionAt('not-a-date', 90)).toBeNull();
  });
});

// ── resolveCompletionAt ───────────────────────────────────────────────

describe('resolveCompletionAt', () => {
  it('prefers the database-generated column', () => {
    expect(
      resolveCompletionAt({
        estimated_completion_at: '2026-04-09T16:00:00.000Z',
        scheduled_at: START_ISO,
        estimated_duration_mins: 999,
      }),
    ).toBe('2026-04-09T16:00:00.000Z');
  });

  it('computes from scheduled_at when the column is absent', () => {
    expect(
      resolveCompletionAt({
        scheduled_at: START_ISO,
        estimated_duration_mins: 90,
      }),
    ).toBe('2026-04-09T16:00:00.000Z');
  });

  it('prefers started_at over scheduled_at once the job has begun', () => {
    // A job that started 30 minutes late is ready 30 minutes later.
    expect(
      resolveCompletionAt({
        scheduled_at: START_ISO,
        started_at: '2026-04-09T15:00:00.000Z',
        estimated_duration_mins: 90,
      }),
    ).toBe('2026-04-09T16:30:00.000Z');
  });

  it('computes from the services snapshot for legacy rows', () => {
    expect(
      resolveCompletionAt({
        scheduled_at: START_ISO,
        services: [{ duration_mins: 60 }, { duration_mins: 30 }],
      }),
    ).toBe('2026-04-09T16:00:00.000Z');
  });

  it('returns null when the booking carries no duration at all', () => {
    expect(resolveCompletionAt({ scheduled_at: START_ISO })).toBeNull();
  });
});

// ── formatReadyBy ─────────────────────────────────────────────────────

describe('formatReadyBy', () => {
  it('formats a same-day completion as a time', () => {
    expect(formatReadyBy('2026-04-09T16:00:00.000Z', START_ISO)).toBe(
      '~4:00 PM',
    );
  });

  it('includes the date when the job runs past midnight', () => {
    expect(
      formatReadyBy('2026-04-10T01:00:00.000Z', '2026-04-09T23:00:00.000Z'),
    ).toBe('~Fri, Apr 10 at 1:00 AM');
  });

  it('formats as a bare time when no start is supplied', () => {
    expect(formatReadyBy('2026-04-09T16:00:00.000Z')).toBe('~4:00 PM');
  });

  it('ignores an unparseable start rather than failing', () => {
    expect(formatReadyBy('2026-04-09T16:00:00.000Z', 'not-a-date')).toBe(
      '~4:00 PM',
    );
  });

  it('returns an empty string for a missing or invalid completion', () => {
    expect(formatReadyBy(null)).toBe('');
    expect(formatReadyBy(undefined)).toBe('');
    expect(formatReadyBy('')).toBe('');
    expect(formatReadyBy('not-a-date')).toBe('');
  });
});

// ── formatBookingReadyBy ──────────────────────────────────────────────

describe('formatBookingReadyBy', () => {
  it('labels a booking from its generated column', () => {
    expect(
      formatBookingReadyBy({
        scheduled_at: START_ISO,
        estimated_completion_at: '2026-04-09T16:00:00.000Z',
      }),
    ).toBe('~4:00 PM');
  });

  it('measures against started_at once the job is underway', () => {
    expect(
      formatBookingReadyBy({
        scheduled_at: '2026-04-09T23:00:00.000Z',
        started_at: '2026-04-09T23:30:00.000Z',
        estimated_completion_at: '2026-04-10T01:00:00.000Z',
      }),
    ).toBe('~Fri, Apr 10 at 1:00 AM');
  });

  it('falls back to the services snapshot for legacy rows', () => {
    expect(
      formatBookingReadyBy({
        scheduled_at: START_ISO,
        services: [{ duration_mins: 90 }],
      }),
    ).toBe('~4:00 PM');
  });

  it('returns an empty string when no duration is known', () => {
    expect(formatBookingReadyBy({ scheduled_at: START_ISO })).toBe('');
    expect(formatBookingReadyBy({})).toBe('');
  });
});
