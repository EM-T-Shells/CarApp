// ProviderDayView (Phase 1) — the container that puts a real day behind
// DayTimeline.
//
// DayTimeline is deliberately presentational: it takes instants and minute
// counts, not database rows. Something has to own the day being looked at,
// fetch it, and translate bookings into bands. That is this, and keeping it
// separate is what lets the timeline stay drivable from a draft quote in Phase
// 3 without this screen's fetching logic coming along.
//
// The date is held here rather than by the screen because the screen's job
// list is date-independent — stepping to tomorrow changes the timeline and
// nothing else.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import DayTimeline, {
  type TimelineBlock,
  type TimelineJob,
} from './DayTimeline';
import {
  getProviderDaySchedule,
  type ProviderDaySchedule,
  type ProviderJobSummary,
} from '../../lib/supabase/queries';
import { resolveDurationMins } from '../../utils/duration';
import {
  DEFAULT_WORKING_HOURS,
  localDayOffset,
  startOfLocalDay,
} from '../../utils/schedule';

// ── Row → band mapping ────────────────────────────────────────────────

/** Shown when the customer join came back empty rather than leaving a blank band. */
const CUSTOMER_FALLBACK = 'Customer';

/**
 * Buffers fall back to 0, never to the provider's current defaults.
 *
 * The columns are a snapshot taken at accept time (trg_snapshot_booking_buffers)
 * and legacy rows were backfilled to 0 on purpose, because those jobs were
 * agreed under a no-buffer regime. Substituting today's defaults here would
 * redraw history and invent conflicts the database does not have.
 */
export function toTimelineJobs(bookings: ProviderJobSummary[]): TimelineJob[] {
  return bookings.map((booking) => {
    const vehicle = booking.vehicles;
    const vehicleLabel = vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : null;

    return {
      id: booking.id,
      label: booking.customer?.full_name?.trim() || CUSTOMER_FALLBACK,
      detail: vehicleLabel ?? undefined,
      scheduledAt: booking.scheduled_at,
      durationMins: resolveDurationMins(booking),
      bufferBeforeMins: booking.buffer_before_mins ?? 0,
      bufferAfterMins: booking.buffer_after_mins ?? 0,
      status: booking.status,
    };
  });
}

export function toTimelineBlocks(
  timeOff: ProviderDaySchedule['timeOff'],
): TimelineBlock[] {
  return timeOff.map((block) => ({
    id: block.id,
    startsAt: block.starts_at,
    endsAt: block.ends_at,
    label: block.reason ?? 'Time off',
  }));
}

/**
 * How many jobs on this day count against max_jobs_per_day.
 *
 * Counts by local day rather than by the fetched set, which is a day wider on
 * each side — otherwise neighbouring days would inflate the tally. Cancelled
 * rows never reach here (the query excludes them) and completed ones do count:
 * a finished job still consumed a slot.
 */
export function countJobsOnDay(
  jobs: TimelineJob[],
  date: Date,
  timeZone: string,
): number {
  return jobs.filter((job) => {
    const start = new Date(job.scheduledAt);
    if (Number.isNaN(start.getTime())) return false;
    return localDayOffset(start, date, timeZone) === 0;
  }).length;
}

// ── Day stepper ───────────────────────────────────────────────────────

/**
 * Steps by whole local days, returning the target day's local midnight.
 *
 * Adding a bare `days * 24h` drifts by an hour across a DST boundary, which is
 * enough to land back on the day you started from. Aiming for the *midday* of
 * the target day instead — `days * 24h + 12h`, in both directions — leaves
 * eleven hours of slack either side, so a 23- or 25-hour day still resolves to
 * the right one before being snapped to its midnight.
 */
export function stepDay(date: Date, days: number, timeZone: string): Date {
  const anchor = startOfLocalDay(date, timeZone);
  if (days === 0) return anchor;

  const middayOfTarget = new Date(
    anchor.getTime() + days * 24 * 60 * 60_000 + 12 * 60 * 60_000,
  );
  return startOfLocalDay(middayOfTarget, timeZone);
}

function formatDayHeading(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone,
    }).format(date);
  } catch {
    // An unresolvable zone must not blank the header.
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
}

// ── Component ─────────────────────────────────────────────────────────

export interface ProviderDayViewProps {
  providerId: string;
  onPressJob?: (bookingId: string) => void;
  /** Bumping this refetches — the screen's pull-to-refresh drives it. */
  refreshToken?: number;
  initialDate?: Date;
}

export default function ProviderDayView({
  providerId,
  onPressJob,
  refreshToken = 0,
  initialDate,
}: ProviderDayViewProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const [date, setDate] = useState<Date>(() => initialDate ?? new Date());
  const [schedule, setSchedule] = useState<ProviderDaySchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getProviderDaySchedule(providerId, date).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setSchedule(null);
      } else {
        setError(null);
        setSchedule(result.data);
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [providerId, date, refreshToken]);

  // The timezone is only known once the schedule loads, so day stepping before
  // then would step in the device's zone. Falling back to the device zone for
  // the first render is fine — the heading re-renders with the real one.
  const timeZone =
    schedule?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const jobs = useMemo(
    () => (schedule ? toTimelineJobs(schedule.bookings) : []),
    [schedule],
  );
  const blocks = useMemo(
    () => (schedule ? toTimelineBlocks(schedule.timeOff) : []),
    [schedule],
  );

  const jobCount = useMemo(
    () => countJobsOnDay(jobs, date, timeZone),
    [jobs, date, timeZone],
  );

  const goToDay = useCallback(
    (delta: number) => {
      setDate((current) => stepDay(current, delta, timeZone));
    },
    [timeZone],
  );

  const atCapacity =
    schedule?.maxJobsPerDay != null && jobCount >= schedule.maxJobsPerDay;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Pressable
          onPress={() => goToDay(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          style={styles.stepper}
          hitSlop={8}
        >
          <ChevronLeft size={20} color={palette.midGray} />
        </Pressable>

        <View style={styles.headingBlock}>
          <Text variant="label" color="charcoal">
            {formatDayHeading(date, timeZone)}
          </Text>
          {schedule ? (
            <Text
              variant="caption"
              style={{ color: atCapacity ? palette.gearGold : palette.midGray }}
            >
              {jobCount === 0
                ? 'No jobs'
                : `${jobCount} job${jobCount === 1 ? '' : 's'}`}
              {schedule.maxJobsPerDay != null
                ? ` of ${schedule.maxJobsPerDay}`
                : ''}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => goToDay(1)}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          style={styles.stepper}
          hitSlop={8}
        >
          <ChevronRight size={20} color={palette.midGray} />
        </Pressable>
      </View>

      {isLoading && !schedule ? (
        <View style={styles.centered}>
          <ActivityIndicator color={palette.electricBlue} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text variant="caption" color="midGray" style={styles.centeredText}>
            {error.message}
          </Text>
        </View>
      ) : (
        <DayTimeline
          date={date}
          timeZone={timeZone}
          workingHours={schedule?.workingHours ?? DEFAULT_WORKING_HOURS}
          jobs={jobs}
          timeOff={blocks}
          onPressJob={onPressJob}
        />
      )}

      <Spacer size="sm" />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  headingBlock: {
    flex: 1,
    alignItems: 'center',
  },
  stepper: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.input,
  },
  centered: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
    maxWidth: 280,
  },
});
