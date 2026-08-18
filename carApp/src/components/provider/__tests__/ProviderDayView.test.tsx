import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const mockGetProviderDaySchedule = jest.fn();

jest.mock('../../../lib/supabase/queries', () => ({
  getProviderDaySchedule: (...args: unknown[]) =>
    mockGetProviderDaySchedule(...args),
}));

import ProviderDayView, {
  countJobsOnDay,
  stepDay,
  toTimelineBlocks,
  toTimelineJobs,
} from '../ProviderDayView';
import type { ProviderJobSummary } from '../../../lib/supabase/queries';

const NY = 'America/New_York';
// A Monday. 14:00Z is 10:00 in New York (EDT).
const DAY = new Date('2026-09-14T14:00:00Z');

function booking(
  overrides: Partial<ProviderJobSummary> & { id: string },
): ProviderJobSummary {
  return {
    scheduled_at: '2026-09-14T14:00:00Z',
    status: 'confirmed',
    estimated_duration_mins: 120,
    buffer_before_mins: 15,
    buffer_after_mins: 30,
    services: [],
    customer: { id: 'c1', full_name: 'Dana Reyes', avatar_url: null },
    vehicles: {
      id: 'v1',
      year: 2021,
      make: 'Toyota',
      model: 'RAV4',
      color: 'blue',
    },
    ...overrides,
  } as unknown as ProviderJobSummary;
}

const SCHEDULE = {
  range: { start: '2026-09-14T04:00:00.000Z', end: '2026-09-15T04:00:00.000Z' },
  timeZone: NY,
  workingHours: {
    mon: [{ start: '08:00', end: '18:00' }],
    tue: [{ start: '08:00', end: '18:00' }],
    wed: [],
    thu: [],
    fri: [],
    sat: [],
    sun: [],
  },
  maxJobsPerDay: null as number | null,
  defaultBufferBeforeMins: 15,
  defaultBufferAfterMins: 30,
  bookings: [] as ProviderJobSummary[],
  timeOff: [] as { id: string; starts_at: string; ends_at: string; reason: string | null }[],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProviderDaySchedule.mockResolvedValue({
    data: SCHEDULE,
    error: null,
  });
});

// ── toTimelineJobs ────────────────────────────────────────────────────

describe('toTimelineJobs', () => {
  it('labels the band with the customer and details it with the vehicle', () => {
    const [band] = toTimelineJobs([booking({ id: 'b1' })]);
    expect(band.label).toBe('Dana Reyes');
    expect(band.detail).toBe('2021 Toyota RAV4');
  });

  it('falls back to a placeholder rather than an empty band label', () => {
    const [band] = toTimelineJobs([booking({ id: 'b1', customer: null })]);
    expect(band.label).toBe('Customer');
  });

  it('ignores a whitespace-only name', () => {
    const [band] = toTimelineJobs([
      booking({
        id: 'b1',
        customer: { id: 'c1', full_name: '   ', avatar_url: null },
      }),
    ]);
    expect(band.label).toBe('Customer');
  });

  // Legacy rows were backfilled to zero buffers deliberately: they were agreed
  // under a no-buffer regime, and substituting today's defaults would redraw
  // history and invent conflicts the database does not have.
  it('reads null buffers as zero, not as the provider defaults', () => {
    const [band] = toTimelineJobs([
      booking({ id: 'b1', buffer_before_mins: null, buffer_after_mins: null }),
    ]);
    expect(band.bufferBeforeMins).toBe(0);
    expect(band.bufferAfterMins).toBe(0);
  });

  // An unknown duration is not a zero-length job.
  it('passes a null duration through when neither column nor services give one', () => {
    const [band] = toTimelineJobs([
      booking({ id: 'b1', estimated_duration_mins: null, services: [] }),
    ]);
    expect(band.durationMins).toBeNull();
  });

  it('falls back to the services snapshot for rows predating the column', () => {
    const [band] = toTimelineJobs([
      booking({
        id: 'b1',
        estimated_duration_mins: null,
        services: [{ duration_mins: 45 }, { duration_mins: 30 }],
      }),
    ]);
    expect(band.durationMins).toBe(75);
  });
});

describe('toTimelineBlocks', () => {
  it('uses the reason as the label and falls back when absent', () => {
    const blocks = toTimelineBlocks([
      {
        id: 't1',
        starts_at: '2026-09-14T12:00:00Z',
        ends_at: '2026-09-14T16:00:00Z',
        reason: 'Dentist',
      },
      {
        id: 't2',
        starts_at: '2026-09-14T20:00:00Z',
        ends_at: '2026-09-14T22:00:00Z',
        reason: null,
      },
    ] as ProviderDayScheduleTimeOff);
    expect(blocks[0].label).toBe('Dentist');
    expect(blocks[1].label).toBe('Time off');
  });
});

type ProviderDayScheduleTimeOff = Parameters<typeof toTimelineBlocks>[0];

// ── countJobsOnDay ────────────────────────────────────────────────────

describe('countJobsOnDay', () => {
  // The query fetches a day wider on each side so buffers can spill across
  // midnight; those neighbours must not count against the daily cap.
  it('counts only jobs whose local day matches, not the padded fetch window', () => {
    const jobs = toTimelineJobs([
      booking({ id: 'today', scheduled_at: '2026-09-14T14:00:00Z' }),
      booking({ id: 'alsoToday', scheduled_at: '2026-09-14T20:00:00Z' }),
      booking({ id: 'tomorrow', scheduled_at: '2026-09-15T14:00:00Z' }),
      booking({ id: 'yesterday', scheduled_at: '2026-09-13T14:00:00Z' }),
    ]);
    expect(countJobsOnDay(jobs, DAY, NY)).toBe(2);
  });

  it('counts by the provider zone, not UTC', () => {
    // 02:00Z on the 15th is still 22:00 on the 14th in New York.
    const jobs = toTimelineJobs([
      booking({ id: 'late', scheduled_at: '2026-09-15T02:00:00Z' }),
    ]);
    expect(countJobsOnDay(jobs, DAY, NY)).toBe(1);
    expect(countJobsOnDay(jobs, DAY, 'UTC')).toBe(0);
  });

  it('ignores an unparseable instant', () => {
    const jobs = toTimelineJobs([
      booking({ id: 'bad', scheduled_at: 'not-a-date' }),
    ]);
    expect(countJobsOnDay(jobs, DAY, NY)).toBe(0);
  });
});

// ── stepDay ───────────────────────────────────────────────────────────

describe('stepDay', () => {
  it('returns the local midnight of the next and previous day', () => {
    expect(stepDay(DAY, 1, NY).toISOString()).toBe('2026-09-15T04:00:00.000Z');
    expect(stepDay(DAY, -1, NY).toISOString()).toBe('2026-09-13T04:00:00.000Z');
  });

  it('snaps to midnight without moving when the step is zero', () => {
    expect(stepDay(DAY, 0, NY).toISOString()).toBe('2026-09-14T04:00:00.000Z');
  });

  // A bare +24h drifts an hour across a DST boundary, which is enough to land
  // back on the day you started from.
  it('crosses the spring-forward boundary without repeating a day', () => {
    const mar7 = new Date('2026-03-07T17:00:00Z');
    const mar8 = stepDay(mar7, 1, NY);
    expect(mar8.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    const mar9 = stepDay(mar8, 1, NY);
    expect(mar9.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('crosses the fall-back boundary without skipping a day', () => {
    const oct31 = new Date('2026-10-31T16:00:00Z');
    const nov1 = stepDay(oct31, 1, NY);
    expect(nov1.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    const nov2 = stepDay(nov1, 1, NY);
    expect(nov2.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it('is reversible across a DST boundary', () => {
    const start = stepDay(new Date('2026-03-08T18:00:00Z'), 0, NY);
    const there = stepDay(start, 1, NY);
    expect(stepDay(there, -1, NY).toISOString()).toBe(start.toISOString());
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('ProviderDayView', () => {
  it('fetches the schedule for the provider and renders the day', async () => {
    const { getByText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(getByText('Monday')).toBeTruthy());
    expect(mockGetProviderDaySchedule).toHaveBeenCalledWith('p1', DAY);
    expect(getByText('Mon, Sep 14')).toBeTruthy();
  });

  it('counts the jobs on the day in the heading', async () => {
    mockGetProviderDaySchedule.mockResolvedValue({
      data: {
        ...SCHEDULE,
        bookings: [booking({ id: 'b1' }), booking({ id: 'b2' })],
      },
      error: null,
    });

    const { getByText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(getByText('2 jobs')).toBeTruthy());
  });

  it('shows the daily cap when the provider set one', async () => {
    mockGetProviderDaySchedule.mockResolvedValue({
      data: {
        ...SCHEDULE,
        maxJobsPerDay: 3,
        bookings: [booking({ id: 'b1' })],
      },
      error: null,
    });

    const { getByText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(getByText('1 job of 3')).toBeTruthy());
  });

  it('refetches for the new day when stepped forward', async () => {
    const { getByLabelText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(mockGetProviderDaySchedule).toHaveBeenCalled());
    fireEvent.press(getByLabelText('Next day'));

    await waitFor(() => {
      expect(mockGetProviderDaySchedule).toHaveBeenCalledTimes(2);
    });
    const secondCallDate = mockGetProviderDaySchedule.mock.calls[1][1] as Date;
    expect(secondCallDate.toISOString()).toBe('2026-09-15T04:00:00.000Z');
  });

  it('refetches when the refresh token changes', async () => {
    const { rerender } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} refreshToken={0} />,
    );
    await waitFor(() => expect(mockGetProviderDaySchedule).toHaveBeenCalled());

    rerender(
      <ProviderDayView providerId="p1" initialDate={DAY} refreshToken={1} />,
    );

    await waitFor(() =>
      expect(mockGetProviderDaySchedule).toHaveBeenCalledTimes(2),
    );
  });

  it('surfaces a query error instead of an empty timeline', async () => {
    mockGetProviderDaySchedule.mockResolvedValue({
      data: null,
      error: new Error('network is down'),
    });

    const { getByText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(getByText('network is down')).toBeTruthy());
  });

  it('draws time off on the day', async () => {
    mockGetProviderDaySchedule.mockResolvedValue({
      data: {
        ...SCHEDULE,
        timeOff: [
          {
            id: 't1',
            starts_at: '2026-09-14T16:00:00Z',
            ends_at: '2026-09-14T18:00:00Z',
            reason: 'Dentist',
          },
        ],
      },
      error: null,
    });

    const { getByText } = render(
      <ProviderDayView providerId="p1" initialDate={DAY} />,
    );

    await waitFor(() => expect(getByText('Dentist')).toBeTruthy());
  });
});
