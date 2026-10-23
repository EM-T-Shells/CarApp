// Exercises the shipping Phase 4 arithmetic used by stripe-webhook's
// report_delay and by the provider's job-day controls.

import {
  CASCADE_STATUSES,
  delayReportable,
  describeMinutes,
  ETA_MATERIALITY_MINS,
  etaChangeMessage,
  formatClockTime,
  ETA_NOTIFY_BYPASS_MINS,
  ETA_NOTIFY_DEDUPE_MINS,
  etaNotificationDue,
  expectedArrivalMs,
  MAX_RUNNING_LATE_MINS,
  pickNextJob,
  planAfterFinish,
  planOverrunCascade,
  projectedEtaMs,
  roundUpInstantMs,
  roundUpToStep,
  validateDelayMins,
  type CascadeJob,
  type JobTiming,
} from '../eta';

const MIN = 60_000;
const at = (iso: string): number => new Date(iso).getTime();

function job(overrides: Partial<CascadeJob> = {}): CascadeJob {
  return {
    id: 'job',
    scheduledAt: '2031-12-01T15:00:00.000Z',
    startedAt: null,
    durationMins: 120,
    runningLateMins: 0,
    bufferBeforeMins: 15,
    bufferAfterMins: 30,
    ...overrides,
  };
}

describe('roundUpToStep / roundUpInstantMs', () => {
  it('rounds minutes up to the next five', () => {
    expect(roundUpToStep(0)).toBe(0);
    expect(roundUpToStep(1)).toBe(5);
    expect(roundUpToStep(15)).toBe(15);
    expect(roundUpToStep(16)).toBe(20);
  });

  it('never goes negative', () => {
    expect(roundUpToStep(-40)).toBe(0);
    expect(roundUpToStep(Number.NaN)).toBe(0);
  });

  it('rounds a clock time up to the next five minutes', () => {
    expect(new Date(roundUpInstantMs(at('2031-12-01T13:43:10Z'))).toISOString()).toBe(
      '2031-12-01T13:45:00.000Z',
    );
    expect(new Date(roundUpInstantMs(at('2031-12-01T13:45:00Z'))).toISOString()).toBe(
      '2031-12-01T13:45:00.000Z',
    );
  });
});

describe('validateDelayMins', () => {
  it('accepts whole five-minute steps from zero to twelve hours', () => {
    for (const mins of [0, 5, 15, 30, 60, MAX_RUNNING_LATE_MINS]) {
      expect(validateDelayMins(mins)).toEqual({ ok: true, value: mins });
    }
  });

  it('refuses anything else, naming why', () => {
    expect(validateDelayMins(undefined)).toEqual({ ok: false, error: 'delay_mins is required' });
    expect(validateDelayMins('30')).toMatchObject({ ok: false });
    expect(validateDelayMins(-15)).toMatchObject({ ok: false });
    expect(validateDelayMins(12.5)).toMatchObject({ ok: false });
    expect(validateDelayMins(17)).toEqual({
      ok: false,
      error: 'delay_mins must be a multiple of 5',
    });
    expect(validateDelayMins(MAX_RUNNING_LATE_MINS + 5)).toEqual({
      ok: false,
      error: 'A delay over 12 hours is a new time. Propose one instead.',
    });
  });
});

describe('delayReportable', () => {
  const now = at('2031-12-01T12:00:00Z');

  it('allows a committed job today, on the way, or under way', () => {
    for (const status of ['confirmed', 'en_route', 'in_progress', 'pending_adjustment_approval']) {
      expect(
        delayReportable({ status, scheduledAt: '2031-12-01T15:00:00Z', startedAt: null, nowMs: now }),
      ).toEqual({ ok: true, value: true });
    }
  });

  it('refuses a booking that is not committed, or is over', () => {
    for (const status of ['pending_provider_quote', 'pending', 'completed', 'cancelled', 'no_show']) {
      expect(
        delayReportable({ status, scheduledAt: '2031-12-01T15:00:00Z', startedAt: null, nowMs: now }),
      ).toMatchObject({ ok: false });
    }
  });

  it('sends a job more than a day away to a reschedule instead', () => {
    expect(
      delayReportable({
        status: 'confirmed',
        scheduledAt: '2031-12-03T15:00:00Z',
        startedAt: null,
        nowMs: now,
      }),
    ).toEqual({
      ok: false,
      error: 'This job is more than a day away. Propose a new time instead.',
    });
  });

  it('allows a started job however long ago it was booked', () => {
    expect(
      delayReportable({
        status: 'in_progress',
        scheduledAt: '2031-11-01T15:00:00Z',
        startedAt: '2031-11-01T15:05:00Z',
        nowMs: now,
      }),
    ).toEqual({ ok: true, value: true });
  });
});

describe('projectedEtaMs / expectedArrivalMs', () => {
  it('matches the generated column before the start: scheduled + duration + delay', () => {
    expect(projectedEtaMs(job({ runningLateMins: 30 }))).toBe(at('2031-12-01T17:30:00Z'));
  });

  it('keys off the real start once the job has begun', () => {
    expect(
      projectedEtaMs(job({ startedAt: '2031-12-01T15:30:00Z', runningLateMins: 15 })),
    ).toBe(at('2031-12-01T17:45:00Z'));
  });

  it('degrades to the expected start when the duration is unknown', () => {
    expect(projectedEtaMs(job({ durationMins: null, runningLateMins: 20 }))).toBe(
      at('2031-12-01T15:20:00Z'),
    );
  });

  it('expects the provider at the booked start plus the delay, until they start', () => {
    expect(expectedArrivalMs(job({ runningLateMins: 25 }))).toBe(at('2031-12-01T15:25:00Z'));
    expect(expectedArrivalMs(job({ startedAt: '2031-12-01T15:30:00Z' }))).toBeNull();
  });
});

describe('etaNotificationDue', () => {
  const now = at('2031-12-01T14:00:00Z');
  const baseline = at('2031-12-01T17:00:00Z');

  it('stays quiet below the materiality threshold', () => {
    expect(
      etaNotificationDue({
        baselineMs: baseline,
        newMs: baseline + (ETA_MATERIALITY_MINS - 5) * MIN,
        lastNotifiedAtMs: null,
        nowMs: now,
      }),
    ).toBe(false);
  });

  it('notifies a material change in either direction', () => {
    for (const delta of [ETA_MATERIALITY_MINS, -ETA_MATERIALITY_MINS]) {
      expect(
        etaNotificationDue({
          baselineMs: baseline,
          newMs: baseline + delta * MIN,
          lastNotifiedAtMs: null,
          nowMs: now,
        }),
      ).toBe(true);
    }
  });

  it('holds a second material change inside the dedupe window', () => {
    expect(
      etaNotificationDue({
        baselineMs: baseline,
        newMs: baseline + 15 * MIN,
        lastNotifiedAtMs: now - (ETA_NOTIFY_DEDUPE_MINS - 1) * MIN,
        nowMs: now,
      }),
    ).toBe(false);
  });

  it('lets a big change through the dedupe window', () => {
    expect(
      etaNotificationDue({
        baselineMs: baseline,
        newMs: baseline + ETA_NOTIFY_BYPASS_MINS * MIN,
        lastNotifiedAtMs: now - MIN,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it('notifies again once the window has passed', () => {
    expect(
      etaNotificationDue({
        baselineMs: baseline,
        newMs: baseline + 15 * MIN,
        lastNotifiedAtMs: now - ETA_NOTIFY_DEDUPE_MINS * MIN,
        nowMs: now,
      }),
    ).toBe(true);
  });
});

describe('planOverrunCascade', () => {
  // The delayed job: 15:00 for two hours with a 30-minute after-buffer, so
  // on plan the provider is free from 17:30.
  const delayed: JobTiming = job({ runningLateMins: 45 });

  it('pushes the next job by what it needs, buffers included', () => {
    // Free from 18:15 (17:30 + 45); the next job's 15-minute before-buffer
    // makes its earliest start 18:30 against a booked 18:00.
    const next = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z', durationMins: 60 });
    expect(planOverrunCascade(delayed, [next])).toEqual([
      {
        bookingId: 'b',
        scheduledAt: '2031-12-01T18:00:00.000Z',
        projectedStartAt: '2031-12-01T18:30:00.000Z',
        requiredDelayMins: 30,
        currentDelayMins: 0,
      },
    ]);
  });

  it('lets slack absorb the delay', () => {
    const roomy = job({ id: 'b', scheduledAt: '2031-12-01T19:00:00Z' });
    expect(planOverrunCascade(delayed, [roomy])).toEqual([]);
  });

  it('carries the push down the day, in start order', () => {
    const second = job({ id: 'c', scheduledAt: '2031-12-01T19:30:00Z', durationMins: 60 });
    const first = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z', durationMins: 60 });
    // b: 18:30–19:30, then 30 after + 15 before → c can start 20:15, 45 late.
    expect(planOverrunCascade(delayed, [second, first]).map((e) => [e.bookingId, e.requiredDelayMins])).toEqual([
      ['b', 30],
      ['c', 45],
    ]);
  });

  it('skips jobs already told the right delay', () => {
    const told = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z', runningLateMins: 30 });
    expect(planOverrunCascade(delayed, [told])).toEqual([]);
  });

  it('offers to take back a delay that no longer applies', () => {
    const onTimeAgain: JobTiming = job({ runningLateMins: 0 });
    const toldLate = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z', runningLateMins: 30 });
    expect(planOverrunCascade(onTimeAgain, [toldLate])).toEqual([
      expect.objectContaining({ bookingId: 'b', requiredDelayMins: 0, currentDelayMins: 30 }),
    ]);
  });

  it('caps the push at the largest delay a booking can carry', () => {
    const marathon: JobTiming = job({ durationMins: 720, runningLateMins: 720 });
    const next = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z' });
    expect(planOverrunCascade(marathon, [next])[0]?.requiredDelayMins).toBe(MAX_RUNNING_LATE_MINS);
  });

  it('ignores a job that has already started', () => {
    const started = job({ id: 'b', scheduledAt: '2031-12-01T18:00:00Z', startedAt: '2031-12-01T18:00:00Z' });
    expect(planOverrunCascade(delayed, [started])).toEqual([]);
  });
});

describe('pickNextJob', () => {
  const finished = { id: 'a', scheduledAt: '2031-12-01T09:00:00Z' };

  it('picks the earliest committed job at or after the finished one', () => {
    const candidates = [
      { id: 'late', status: 'confirmed', scheduledAt: '2031-12-01T16:00:00Z' },
      { id: 'soon', status: 'confirmed', scheduledAt: '2031-12-01T12:00:00Z' },
      { id: 'earlier', status: 'confirmed', scheduledAt: '2031-12-01T08:00:00Z' },
      { id: 'a', status: 'completed', scheduledAt: '2031-12-01T09:00:00Z' },
    ];
    expect(pickNextJob(finished, candidates)?.id).toBe('soon');
  });

  it('only considers jobs the cascade can move', () => {
    const candidates = [
      { id: 'quote', status: 'pending_provider_quote', scheduledAt: '2031-12-01T10:00:00Z' },
      { id: 'gone', status: 'cancelled', scheduledAt: '2031-12-01T11:00:00Z' },
    ];
    expect(pickNextJob(finished, candidates)).toBeNull();
    expect(CASCADE_STATUSES).toEqual(['confirmed', 'pending_adjustment_approval']);
  });
});

describe('planAfterFinish', () => {
  // Finished at 13:00 with a 30-minute after-buffer; the next job has a
  // 15-minute before-buffer, so it could start at 13:45.
  const now = at('2031-12-01T13:00:00Z');
  const next = (overrides: Partial<CascadeJob> = {}) => ({
    ...job({ id: 'next', scheduledAt: '2031-12-01T15:00:00Z', ...overrides }),
    hasOpenProposal: false,
  });

  it('offers an earlier start when there is real room', () => {
    expect(planAfterFinish({ nowMs: now, finishedBufferAfterMins: 30, next: next() })).toEqual({
      kind: 'offer_earlier',
      bookingId: 'next',
      startAt: '2031-12-01T13:45:00.000Z',
      earlierByMins: 75,
    });
  });

  it('rounds the offered start up to a five-minute mark', () => {
    const plan = planAfterFinish({
      nowMs: at('2031-12-01T13:02:00Z'),
      finishedBufferAfterMins: 30,
      next: next(),
    });
    expect(plan).toMatchObject({ kind: 'offer_earlier', startAt: '2031-12-01T13:50:00.000Z' });
  });

  it('does not offer a start that gains too little', () => {
    expect(
      planAfterFinish({
        nowMs: now,
        finishedBufferAfterMins: 30,
        next: next({ scheduledAt: '2031-12-01T13:55:00Z' }),
      }),
    ).toBeNull();
  });

  it('corrects a delay the next customer no longer faces first', () => {
    expect(
      planAfterFinish({ nowMs: now, finishedBufferAfterMins: 30, next: next({ runningLateMins: 30 }) }),
    ).toEqual({ kind: 'update_delay', bookingId: 'next', fromMins: 30, toMins: 0 });
  });

  it('says so when finishing late makes the next job late', () => {
    expect(
      planAfterFinish({
        nowMs: at('2031-12-01T14:50:00Z'),
        finishedBufferAfterMins: 30,
        next: next(),
      }),
    ).toEqual({ kind: 'update_delay', bookingId: 'next', fromMins: 0, toMins: 35 });
  });

  it('never replaces a reschedule the two parties are already discussing', () => {
    expect(
      planAfterFinish({
        nowMs: now,
        finishedBufferAfterMins: 30,
        next: { ...next(), hasOpenProposal: true },
      }),
    ).toBeNull();
  });
});

describe('describeMinutes / formatClockTime', () => {
  it('says minutes the way the app does', () => {
    expect(describeMinutes(15)).toBe('15 min');
    expect(describeMinutes(60)).toBe('1 hr');
    expect(describeMinutes(75)).toBe('1 hr 15 min');
  });

  it('formats on the job’s own clock, not the server’s', () => {
    expect(formatClockTime('2031-12-01T19:30:00Z', 'America/New_York')).toBe('2:30 PM');
    expect(formatClockTime('2031-12-01T19:30:00Z', 'America/Los_Angeles')).toBe('11:30 AM');
  });

  it('falls back to UTC for an unusable zone', () => {
    expect(formatClockTime('2031-12-01T19:30:00Z', 'Not/AZone')).toBe('7:30 PM');
  });
});

describe('etaChangeMessage', () => {
  const base = {
    providerName: 'Marcus',
    timeZone: 'America/New_York',
    scheduledAt: '2031-12-01T15:00:00Z',
    startedAt: null,
    runningLateMins: 30,
    etaAt: '2031-12-01T17:30:00Z',
    previousEtaAt: '2031-12-01T17:00:00Z',
  };

  it('tells a waiting customer when to expect the provider', () => {
    expect(etaChangeMessage(base)).toEqual({
      title: 'Running about 30 min late',
      body: 'Marcus now expects to arrive around 10:30 AM.',
    });
  });

  it('says so when the provider is back on time', () => {
    expect(etaChangeMessage({ ...base, runningLateMins: 0 })).toEqual({
      title: 'Back on schedule',
      body: 'Marcus expects to arrive at 10:00 AM as planned.',
    });
  });

  it('gives a new ready-by time once the job is under way', () => {
    expect(
      etaChangeMessage({
        ...base,
        startedAt: '2031-12-01T15:00:00Z',
        runningLateMins: 15,
        etaAt: '2031-12-01T17:15:00Z',
        previousEtaAt: '2031-12-01T17:00:00Z',
      }),
    ).toEqual({
      title: 'Taking a little longer',
      body: 'Marcus now expects your car to be ready around 12:15 PM, about 15 min later than before.',
    });
  });

  it('reports finishing ahead too', () => {
    expect(
      etaChangeMessage({
        ...base,
        startedAt: '2031-12-01T15:00:00Z',
        etaAt: '2031-12-01T16:30:00Z',
        previousEtaAt: '2031-12-01T17:00:00Z',
      }).title,
    ).toBe('Ahead of schedule');
  });

  it('names nobody rather than "null"', () => {
    expect(etaChangeMessage({ ...base, providerName: null }).body).toMatch(/^Your provider /);
  });
});
