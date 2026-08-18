// DayTimeline (Phase 1) — one provider day, drawn to scale.
//
// The provider needs to answer three questions before accepting a job, and
// until now had no surface that answered any of them: what is already on this
// day, how much of it is actually free once travel and setup are counted, and
// does this new job collide with anything.
//
// Buffers are the reason a list will not do. A 2-hour job with a 20-minute
// approach and a 40-minute pack-up-and-drive occupies three hours of the day,
// and two jobs that look an hour apart in a list can be touching once the
// buffers are drawn. So each job renders as a buffer extent with the billable
// service time nested inside it.
//
// Deliberately presentational: it takes plain instants and minute counts, not
// database rows, so the timeline can be driven from a query, from a draft the
// provider is still editing, or from a test. Conflict detection is done here
// rather than passed in because it is a property of the geometry already being
// computed — see collectConflicts.
//
// The clock is the PROVIDER's, not the device's. Every position comes from
// minutesIntoLocalDay(instant, timeZone), so a provider on a trip and a
// customer in another zone see the same day.

import React, { useMemo } from 'react';
import { StyleSheet, View, Pressable, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import {
  DAY_LABELS,
  MINUTES_PER_DAY,
  dayBounds,
  formatClockLabel,
  formatHHMM,
  localDayKey,
  minutesIntoLocalDay,
  windowsForDay,
  type WorkingHours,
} from '../../utils/schedule';

// ── Types ─────────────────────────────────────────────────────────────

export interface TimelineJob {
  id: string;
  /** Short label for the band — customer name, or the service. */
  label: string;
  /** Secondary line: vehicle, address, status. Optional. */
  detail?: string;
  /** ISO instant the service is scheduled to start. */
  scheduledAt: string;
  /** Committed service minutes. A job with no estimate still gets a band. */
  durationMins: number | null;
  bufferBeforeMins: number;
  bufferAfterMins: number;
  status: string;
}

export interface TimelineBlock {
  id: string;
  startsAt: string;
  endsAt: string;
  label?: string;
}

export interface DayTimelineProps {
  /** Any instant inside the day to draw. */
  date: Date;
  /** The provider's IANA timezone. */
  timeZone: string;
  workingHours: WorkingHours;
  jobs: TimelineJob[];
  timeOff?: TimelineBlock[];
  /** A slot being considered — drawn as a dashed band that flags collisions. */
  proposed?: { startsAt: string; durationMins: number } | null;
  onPressJob?: (jobId: string) => void;
}

/** A time-off block clipped to the day being drawn. */
interface PlacedBlock {
  id: string;
  label?: string;
  start: number;
  end: number;
}

/** A job placed on the day, in minutes from local midnight. */
interface PlacedJob {
  job: TimelineJob;
  /** Billable service time. */
  serviceStart: number;
  serviceEnd: number;
  /** Service time plus buffers — what actually occupies the day. */
  occupiedStart: number;
  occupiedEnd: number;
  conflicting: boolean;
}

// ── Geometry ──────────────────────────────────────────────────────────

/** Pixels per hour. Tall enough that a 30-minute job is still readable. */
const HOUR_HEIGHT = 56;
const MIN_VIEW_MINUTES = 6 * 60;
const AXIS_WIDTH = 56;

/**
 * Place every job on the local day.
 *
 * A job that starts on the previous local day (an overnight buffer, a late job
 * running past midnight) is clamped rather than dropped — showing a truncated
 * band is honest about the day being partly consumed, whereas omitting it would
 * present the morning as free.
 */
export function placeJobs(
  jobs: TimelineJob[],
  date: Date,
  timeZone: string,
): PlacedJob[] {
  const day = localDayKey(date, timeZone);

  const placed: PlacedJob[] = jobs
    .map((job) => {
      const start = new Date(job.scheduledAt);
      if (Number.isNaN(start.getTime())) return null;

      // Anchor off the same local day the timeline is drawing. A job on another
      // day is skipped; one that merely runs past midnight is clamped below.
      const sameDay = localDayKey(start, timeZone) === day;
      const serviceStart = sameDay
        ? minutesIntoLocalDay(start, timeZone)
        : minutesIntoLocalDay(start, timeZone) - MINUTES_PER_DAY;

      const duration = job.durationMins ?? 0;
      const serviceEnd = serviceStart + duration;
      const occupiedStart = serviceStart - job.bufferBeforeMins;
      const occupiedEnd = serviceEnd + job.bufferAfterMins;

      // Off this day entirely, in either direction.
      if (occupiedEnd <= 0 || occupiedStart >= MINUTES_PER_DAY) return null;

      return {
        job,
        serviceStart,
        serviceEnd,
        occupiedStart,
        occupiedEnd,
        conflicting: false,
      };
    })
    .filter((entry): entry is PlacedJob => entry !== null)
    .sort((a, b) => a.occupiedStart - b.occupiedStart);

  return collectConflicts(placed);
}

/**
 * Flag every job whose occupied range overlaps another's.
 *
 * This is the client-side mirror of bookings_no_provider_overlap. The database
 * refuses the overlap for confirmed jobs, so what shows up here is usually a
 * pending request the provider has not accepted yet — which is exactly the
 * moment the warning is useful, since accepting it is what would fail.
 *
 * Half-open, matching occupied_range: jobs that merely touch do not conflict.
 */
export function collectConflicts(placed: PlacedJob[]): PlacedJob[] {
  const result = placed.map((entry) => ({ ...entry }));
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];
      if (a.occupiedStart < b.occupiedEnd && b.occupiedStart < a.occupiedEnd) {
        a.conflicting = true;
        b.conflicting = true;
      }
    }
  }
  return result;
}

/**
 * The slice of the day worth drawing: the working hours, widened to contain
 * everything actually on the calendar, snapped to whole hours.
 *
 * Widening rather than clipping matters — a job accepted outside working hours
 * (which the database permits, since hours are a preference) must still appear,
 * or the timeline would quietly hide the one booking most worth seeing.
 */
export function viewWindow(
  placed: PlacedJob[],
  blocks: { start: number; end: number }[],
  workingHours: WorkingHours,
  date: Date,
  timeZone: string,
): { start: number; end: number } {
  const bounds = dayBounds(workingHours, localDayKey(date, timeZone));
  let start = bounds ? bounds.open : 8 * 60;
  let end = bounds ? bounds.close : 18 * 60;

  for (const entry of placed) {
    start = Math.min(start, entry.occupiedStart);
    end = Math.max(end, entry.occupiedEnd);
  }
  for (const block of blocks) {
    start = Math.min(start, block.start);
    end = Math.max(end, block.end);
  }

  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(MINUTES_PER_DAY, Math.ceil(end / 60) * 60);

  if (end - start < MIN_VIEW_MINUTES) {
    end = Math.min(MINUTES_PER_DAY, start + MIN_VIEW_MINUTES);
    start = Math.max(0, end - MIN_VIEW_MINUTES);
  }
  return { start, end };
}

function clampToDay(minutes: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
}

// ── Component ─────────────────────────────────────────────────────────

export function DayTimeline({
  date,
  timeZone,
  workingHours,
  jobs,
  timeOff = [],
  proposed = null,
  onPressJob,
}: DayTimelineProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const styles = useMemo(() => makeStyles(palette, isDark), [palette, isDark]);

  const day = localDayKey(date, timeZone);

  const placed = useMemo(
    () => placeJobs(jobs, date, timeZone),
    [jobs, date, timeZone],
  );

  const blocks = useMemo<PlacedBlock[]>(
    () =>
      timeOff
        .map((block): PlacedBlock | null => {
          const start = new Date(block.startsAt);
          const end = new Date(block.endsAt);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return null;
          }
          // Time off is usually multi-day, so clamp to this day's edges rather
          // than requiring it to start here.
          const startMin =
            localDayKey(start, timeZone) === day
              ? minutesIntoLocalDay(start, timeZone)
              : start.getTime() < date.getTime()
                ? 0
                : MINUTES_PER_DAY;
          const endMin =
            localDayKey(end, timeZone) === day
              ? minutesIntoLocalDay(end, timeZone)
              : end.getTime() > date.getTime()
                ? MINUTES_PER_DAY
                : 0;
          if (endMin <= startMin) return null;
          return { id: block.id, label: block.label, start: startMin, end: endMin };
        })
        .filter((b): b is PlacedBlock => b !== null),
    [timeOff, date, timeZone, day],
  );

  const proposedPlacement = useMemo(() => {
    if (!proposed) return null;
    const start = new Date(proposed.startsAt);
    if (Number.isNaN(start.getTime())) return null;
    if (localDayKey(start, timeZone) !== day) return null;
    const startMin = minutesIntoLocalDay(start, timeZone);
    const endMin = startMin + proposed.durationMins;
    const collides = placed.some(
      (entry) => entry.occupiedStart < endMin && startMin < entry.occupiedEnd,
    );
    return { start: startMin, end: endMin, collides };
  }, [proposed, timeZone, day, placed]);

  const view = useMemo(
    () => viewWindow(placed, blocks, workingHours, date, timeZone),
    [placed, blocks, workingHours, date, timeZone],
  );

  const totalMinutes = view.end - view.start;
  const height = (totalMinutes / 60) * HOUR_HEIGHT;
  const toY = (minutes: number): number =>
    ((clampToDay(minutes) - view.start) / 60) * HOUR_HEIGHT;

  const hourMarks: number[] = [];
  for (let m = view.start; m <= view.end; m += 60) hourMarks.push(m);

  const openWindows = windowsForDay(workingHours, day);
  const conflictCount = placed.filter((entry) => entry.conflicting).length;

  return (
    <View style={styles.container} accessibilityLabel={`Schedule for ${DAY_LABELS[day]}`}>
      <View style={styles.header}>
        <Text variant="label">{DAY_LABELS[day]}</Text>
        <Text variant="caption" color="midGray">
          {openWindows.length === 0
            ? 'Not working'
            : openWindows
                .map((w) => `${formatClockLabel(w.start)} – ${formatClockLabel(w.end)}`)
                .join(', ')}
        </Text>
      </View>

      {conflictCount > 0 && (
        <View style={styles.conflictBanner}>
          <Text variant="caption" color="gearGold">
            {conflictCount === 2
              ? 'Two jobs overlap once buffers are counted.'
              : `${conflictCount} jobs overlap once buffers are counted.`}
          </Text>
        </View>
      )}

      <View style={[styles.canvas, { height }]}>
        {/* Hour grid */}
        {hourMarks.map((minutes) => (
          <View key={minutes} style={[styles.hourRow, { top: toY(minutes) }]}>
            <Text variant="caption" color="midGray" style={styles.hourLabel}>
              {formatClockLabel(formatHHMM(minutes % MINUTES_PER_DAY))}
            </Text>
            <View style={styles.hourLine} />
          </View>
        ))}

        {/* Working hours, drawn as the lit part of the day. Everything outside
            it stays on the plain background, so "outside hours" reads as
            absence rather than as another kind of block. */}
        {openWindows.map((window, index) => {
          const start = Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3));
          const end = Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3));
          return (
            <View
              key={`open-${index}`}
              pointerEvents="none"
              style={[
                styles.openBand,
                { top: toY(start), height: Math.max(0, toY(end) - toY(start)) },
              ]}
            />
          );
        })}

        {/* Time off */}
        {blocks.map((block) => (
          <View
            key={block.id}
            pointerEvents="none"
            style={[
              styles.timeOffBand,
              { top: toY(block.start), height: Math.max(2, toY(block.end) - toY(block.start)) },
            ]}
          >
            <Text variant="caption" color="midGray">
              {block.label ?? 'Time off'}
            </Text>
          </View>
        ))}

        {/* Jobs */}
        {placed.map((entry) => {
          const bufferTop = toY(entry.occupiedStart);
          const bufferHeight = Math.max(4, toY(entry.occupiedEnd) - bufferTop);
          const serviceTop = toY(entry.serviceStart);
          const serviceHeight = Math.max(2, toY(entry.serviceEnd) - serviceTop);

          return (
            <React.Fragment key={entry.job.id}>
              {/* The buffer extent sits behind the service band, so the cost of
                  travel and setup is visible without being mistaken for
                  billable time. */}
              <View
                pointerEvents="none"
                style={[
                  styles.bufferBand,
                  entry.conflicting && styles.bufferBandConflict,
                  { top: bufferTop, height: bufferHeight },
                ]}
              />
              <Pressable
                onPress={onPressJob ? () => onPressJob(entry.job.id) : undefined}
                disabled={!onPressJob}
                accessibilityRole="button"
                accessibilityLabel={`${entry.job.label}, ${formatClockLabel(
                  formatHHMM(clampToDay(entry.serviceStart)),
                )} to ${formatClockLabel(formatHHMM(clampToDay(entry.serviceEnd)))}${
                  entry.conflicting ? ', overlaps another job' : ''
                }`}
                style={[
                  styles.jobBand,
                  entry.conflicting && styles.jobBandConflict,
                  { top: serviceTop, height: serviceHeight },
                ]}
              >
                <Text variant="label" numberOfLines={1}>
                  {entry.job.label}
                </Text>
                {serviceHeight > 34 && entry.job.detail ? (
                  <Text variant="caption" color="midGray" numberOfLines={1}>
                    {entry.job.detail}
                  </Text>
                ) : null}
              </Pressable>
            </React.Fragment>
          );
        })}

        {/* The slot under consideration */}
        {proposedPlacement && (
          <View
            pointerEvents="none"
            style={[
              styles.proposedBand,
              proposedPlacement.collides && styles.proposedBandCollides,
              {
                top: toY(proposedPlacement.start),
                height: Math.max(
                  4,
                  toY(proposedPlacement.end) - toY(proposedPlacement.start),
                ),
              },
            ]}
          >
            <Text
              variant="caption"
              color={proposedPlacement.collides ? 'gearGold' : 'electricBlue'}
            >
              {proposedPlacement.collides ? 'Overlaps a job' : 'New job'}
            </Text>
          </View>
        )}
      </View>

      {placed.length === 0 && blocks.length === 0 && (
        <Text variant="bodySmall" color="midGray" style={styles.empty}>
          Nothing booked.
        </Text>
      )}
    </View>
  );
}

export default DayTimeline;

// ── Styles ────────────────────────────────────────────────────────────

function makeStyles(palette: Palette, isDark: boolean) {
  return StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    conflictBanner: {
      backgroundColor: isDark ? 'rgba(240,192,64,0.14)' : 'rgba(212,160,23,0.12)',
      borderRadius: borderRadius.input,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    canvas: {
      position: 'relative',
      marginTop: spacing.xs,
    },
    hourRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    hourLabel: {
      width: AXIS_WIDTH,
      textAlign: 'right',
    },
    hourLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(240,240,240,0.14)' : 'rgba(34,34,34,0.10)',
    },
    openBand: {
      position: 'absolute',
      left: AXIS_WIDTH + spacing.sm,
      right: 0,
      backgroundColor: isDark ? 'rgba(240,240,240,0.04)' : 'rgba(34,34,34,0.03)',
      borderRadius: borderRadius.input,
    },
    timeOffBand: {
      position: 'absolute',
      left: AXIS_WIDTH + spacing.sm,
      right: 0,
      borderRadius: borderRadius.input,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: palette.midGray,
      backgroundColor: isDark ? 'rgba(160,160,160,0.10)' : 'rgba(119,119,119,0.08)',
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    bufferBand: {
      position: 'absolute',
      left: AXIS_WIDTH + spacing.sm,
      right: 0,
      borderRadius: borderRadius.input,
      backgroundColor: isDark ? 'rgba(90,157,255,0.16)' : 'rgba(26,109,255,0.10)',
    },
    bufferBandConflict: {
      backgroundColor: isDark ? 'rgba(240,192,64,0.20)' : 'rgba(212,160,23,0.14)',
    },
    jobBand: {
      position: 'absolute',
      left: AXIS_WIDTH + spacing.sm + spacing.sm,
      right: spacing.sm,
      borderRadius: borderRadius.input,
      borderLeftWidth: 3,
      borderLeftColor: palette.electricBlue,
      backgroundColor: palette.offWhite,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    jobBandConflict: {
      borderLeftColor: palette.gearGold,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.gearGold,
    },
    proposedBand: {
      position: 'absolute',
      left: AXIS_WIDTH + spacing.sm,
      right: 0,
      borderRadius: borderRadius.input,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: palette.electricBlue,
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    proposedBandCollides: {
      borderColor: palette.gearGold,
    },
    empty: {
      marginTop: spacing.sm,
    },
  });
}
