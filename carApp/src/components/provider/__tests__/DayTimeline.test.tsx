import React from 'react';
import { render } from '@testing-library/react-native';
import DayTimeline, {
  collectConflicts,
  placeJobs,
  viewWindow,
  type TimelineJob,
} from '../DayTimeline';
import { workingHoursFromJson } from '../../../utils/schedule';

const NY = 'America/New_York';
// A Monday. 14:00Z is 10:00 in New York (EDT).
const DAY = new Date('2026-09-14T14:00:00Z');

const HOURS = workingHoursFromJson({
  mon: [{ start: '08:00', end: '18:00' }],
});

function job(overrides: Partial<TimelineJob> & { id: string }): TimelineJob {
  return {
    label: 'Job',
    scheduledAt: '2026-09-14T14:00:00Z',
    durationMins: 120,
    bufferBeforeMins: 20,
    bufferAfterMins: 40,
    status: 'confirmed',
    ...overrides,
  };
}

// ── placeJobs ─────────────────────────────────────────────────────────

describe('placeJobs', () => {
  it('places a job in the provider local day, not the UTC day', () => {
    const [placed] = placeJobs([job({ id: 'a' })], DAY, NY);
    // 10:00 local = 600 minutes in.
    expect(placed.serviceStart).toBe(600);
    expect(placed.serviceEnd).toBe(720);
  });

  it('extends the occupied range by the buffers on both sides', () => {
    const [placed] = placeJobs([job({ id: 'a' })], DAY, NY);
    expect(placed.occupiedStart).toBe(580); // 09:40
    expect(placed.occupiedEnd).toBe(760); // 12:40
  });

  it('gives a job with no duration estimate a band from its buffers alone', () => {
    const [placed] = placeJobs([job({ id: 'a', durationMins: null })], DAY, NY);
    expect(placed.serviceStart).toBe(placed.serviceEnd);
    expect(placed.occupiedStart).toBe(580);
    expect(placed.occupiedEnd).toBe(640);
  });

  it('drops a job on another day', () => {
    const placed = placeJobs(
      [job({ id: 'a', scheduledAt: '2026-09-16T14:00:00Z' })],
      DAY,
      NY,
    );
    expect(placed).toHaveLength(0);
  });

  // Omitting it would present the morning as free when it is not.
  it('keeps a job whose buffer spills in from the previous local day', () => {
    const placed = placeJobs(
      [
        job({
          id: 'a',
          scheduledAt: '2026-09-14T03:30:00Z', // 23:30 Sunday local
          durationMins: 90,
          bufferBeforeMins: 0,
          bufferAfterMins: 0,
        }),
      ],
      DAY,
      NY,
    );
    expect(placed).toHaveLength(1);
    expect(placed[0].occupiedStart).toBeLessThan(0);
    expect(placed[0].occupiedEnd).toBe(60); // runs to 01:00
  });

  // The mirror of the previous case, and the one a signed day offset is needed
  // for. Reading "not today" as "yesterday" put a next-day job 24 hours on the
  // wrong side of the timeline: this one's approach buffer genuinely reaches
  // back across midnight and consumes the end of tonight.
  it('keeps a job whose buffer spills back from the next local day', () => {
    const placed = placeJobs(
      [
        job({
          id: 'a',
          scheduledAt: '2026-09-15T04:15:00Z', // 00:15 Tuesday local
          durationMins: 60,
          bufferBeforeMins: 30,
          bufferAfterMins: 0,
        }),
      ],
      DAY,
      NY,
    );
    expect(placed).toHaveLength(1);
    // Occupancy opens at 23:45 Monday and runs past midnight.
    expect(placed[0].occupiedStart).toBe(1425);
    expect(placed[0].serviceStart).toBe(1455);
  });

  it('still drops a next-day job that does not reach back across midnight', () => {
    const placed = placeJobs(
      [
        job({
          id: 'a',
          scheduledAt: '2026-09-15T14:00:00Z', // 10:00 Tuesday local
          bufferBeforeMins: 20,
        }),
      ],
      DAY,
      NY,
    );
    expect(placed).toHaveLength(0);
  });

  it('drops a malformed instant rather than rendering it at midnight', () => {
    expect(placeJobs([job({ id: 'a', scheduledAt: 'not-a-date' })], DAY, NY)).toHaveLength(0);
  });

  it('returns jobs in chronological order', () => {
    const placed = placeJobs(
      [
        job({ id: 'late', scheduledAt: '2026-09-14T20:00:00Z' }),
        job({ id: 'early', scheduledAt: '2026-09-14T13:00:00Z' }),
      ],
      DAY,
      NY,
    );
    expect(placed.map((p) => p.job.id)).toEqual(['early', 'late']);
  });
});

// ── collectConflicts ──────────────────────────────────────────────────

describe('collectConflicts', () => {
  // The case a list view cannot show: the service times are an hour apart, but
  // the first job's 40-minute pack-up runs into the second's 20-minute
  // approach.
  it('flags jobs that only overlap once buffers are counted', () => {
    const placed = placeJobs(
      [
        job({ id: 'first', scheduledAt: '2026-09-14T14:00:00Z' }), // 10:00–12:00
        job({ id: 'second', scheduledAt: '2026-09-14T16:10:00Z' }), // 12:10 start
      ],
      DAY,
      NY,
    );
    expect(placed.every((p) => p.conflicting)).toBe(true);
  });

  it('leaves genuinely clear jobs unflagged', () => {
    const placed = placeJobs(
      [
        job({ id: 'first', scheduledAt: '2026-09-14T14:00:00Z' }), // occupies 09:40–12:40
        job({ id: 'second', scheduledAt: '2026-09-14T17:00:00Z' }), // occupies 12:40–15:40
      ],
      DAY,
      NY,
    );
    expect(placed.some((p) => p.conflicting)).toBe(false);
  });

  // Half-open, matching bookings.occupied_range — touching is not overlapping.
  it('does not flag bands that share an edge', () => {
    const result = collectConflicts([
      {
        job: job({ id: 'a' }),
        serviceStart: 600,
        serviceEnd: 660,
        occupiedStart: 600,
        occupiedEnd: 660,
        conflicting: false,
      },
      {
        job: job({ id: 'b' }),
        serviceStart: 660,
        serviceEnd: 720,
        occupiedStart: 660,
        occupiedEnd: 720,
        conflicting: false,
      },
    ]);
    expect(result.some((p) => p.conflicting)).toBe(false);
  });

  it('flags every member of a three-way pile-up', () => {
    const placed = placeJobs(
      [
        job({ id: 'a', scheduledAt: '2026-09-14T14:00:00Z' }),
        job({ id: 'b', scheduledAt: '2026-09-14T14:30:00Z' }),
        job({ id: 'c', scheduledAt: '2026-09-14T15:00:00Z' }),
      ],
      DAY,
      NY,
    );
    expect(placed.filter((p) => p.conflicting)).toHaveLength(3);
  });
});

// ── viewWindow ────────────────────────────────────────────────────────

describe('viewWindow', () => {
  it('covers the working day when nothing is booked', () => {
    expect(viewWindow([], [], HOURS, DAY, NY)).toEqual({ start: 480, end: 1080 });
  });

  // Hours are a preference, not an invariant — the database accepts a job
  // outside them, so the timeline must not hide it.
  it('widens to contain a job scheduled outside working hours', () => {
    const placed = placeJobs(
      [job({ id: 'early', scheduledAt: '2026-09-14T10:00:00Z' })], // 06:00 local
      DAY,
      NY,
    );
    const view = viewWindow(placed, [], HOURS, DAY, NY);
    expect(view.start).toBeLessThanOrEqual(placed[0].occupiedStart);
    expect(view.start).toBe(300); // snapped down to 05:00
  });

  it('widens to contain time off', () => {
    const view = viewWindow([], [{ start: 60, end: 180 }], HOURS, DAY, NY);
    expect(view.start).toBe(60);
  });

  it('snaps to whole hours', () => {
    const placed = placeJobs([job({ id: 'a' })], DAY, NY); // 09:40–12:40
    const view = viewWindow(placed, [], HOURS, DAY, NY);
    expect(view.start % 60).toBe(0);
    expect(view.end % 60).toBe(0);
  });

  it('keeps a minimum height on a closed day', () => {
    const closed = workingHoursFromJson({ mon: [] });
    const view = viewWindow([], [], closed, DAY, NY);
    expect(view.end - view.start).toBeGreaterThanOrEqual(6 * 60);
  });
});

// ── Rendering ─────────────────────────────────────────────────────────

describe('DayTimeline', () => {
  it('renders the day name and the working hours', () => {
    const { getByText } = render(
      <DayTimeline date={DAY} timeZone={NY} workingHours={HOURS} jobs={[]} />,
    );
    expect(getByText('Monday')).toBeTruthy();
    expect(getByText('8:00 AM – 6:00 PM')).toBeTruthy();
  });

  it('says so when the day is empty', () => {
    const { getByText } = render(
      <DayTimeline date={DAY} timeZone={NY} workingHours={HOURS} jobs={[]} />,
    );
    expect(getByText('Nothing booked.')).toBeTruthy();
  });

  it('says the provider is not working on a closed day', () => {
    const { getByText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={workingHoursFromJson({ mon: [] })}
        jobs={[]}
      />,
    );
    expect(getByText('Not working')).toBeTruthy();
  });

  it('labels a job band with its local start and end for screen readers', () => {
    const { getByLabelText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={HOURS}
        jobs={[job({ id: 'a', label: 'Alex R.' })]}
      />,
    );
    expect(getByLabelText('Alex R., 10:00 AM to 12:00 PM')).toBeTruthy();
  });

  it('warns when jobs overlap and says so in the band label', () => {
    const { getByText, getByLabelText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={HOURS}
        jobs={[
          job({ id: 'a', label: 'Alex R.', scheduledAt: '2026-09-14T14:00:00Z' }),
          job({ id: 'b', label: 'Sam P.', scheduledAt: '2026-09-14T16:10:00Z' }),
        ]}
      />,
    );
    expect(getByText('Two jobs overlap once buffers are counted.')).toBeTruthy();
    expect(
      getByLabelText('Alex R., 10:00 AM to 12:00 PM, overlaps another job'),
    ).toBeTruthy();
  });

  it('flags a proposed slot that collides with an existing job', () => {
    const { getByText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={HOURS}
        jobs={[job({ id: 'a' })]}
        proposed={{ startsAt: '2026-09-14T15:00:00Z', durationMins: 60 }}
      />,
    );
    expect(getByText('Overlaps a job')).toBeTruthy();
  });

  it('accepts a proposed slot that clears the buffers', () => {
    const { getByText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={HOURS}
        jobs={[job({ id: 'a' })]} // occupies 09:40–12:40
        proposed={{ startsAt: '2026-09-14T17:00:00Z', durationMins: 60 }} // 13:00
      />,
    );
    expect(getByText('New job')).toBeTruthy();
  });

  it('renders a time-off block with its label', () => {
    const { getByText } = render(
      <DayTimeline
        date={DAY}
        timeZone={NY}
        workingHours={HOURS}
        jobs={[]}
        timeOff={[
          {
            id: 't1',
            startsAt: '2026-09-14T17:00:00Z',
            endsAt: '2026-09-14T19:00:00Z',
            label: 'Dentist',
          },
        ]}
      />,
    );
    expect(getByText('Dentist')).toBeTruthy();
  });
});
