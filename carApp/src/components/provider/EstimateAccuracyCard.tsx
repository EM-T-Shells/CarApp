// EstimateAccuracyCard — the provider's own calibration report (Phase 4,
// spec §8 "calibration reporting").
//
// Over the last 90 days: what the suggestion engine proposed, what they quoted
// and what jobs actually took; how often they started late; and how far their
// quotes ran above the prices they list. It sits above the job-length
// adjustments on More → Manage, because that is what a provider who keeps
// running over should change.
//
// Reads get_duration_calibration(), which returns only the caller's own row.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { formatDuration } from '../../utils/duration';
import {
  getDurationCalibration,
  type DurationCalibration,
} from '../../lib/supabase/queries';

const REPORT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Within this many minutes on average, estimates are holding up. The same 15
// the report uses for "within estimate" per job would hide a steady 10-minute
// overrun, so the average gets a tighter figure.
const ON_TARGET_AVG_MINS = 5;

// An average overrun past this is worth a nudge toward the adjustments below.
const NUDGE_OVERRUN_MINS = 15;

export interface CalibrationSummary {
  headline: string;
  lines: string[];
  nudge: string | null;
}

/** The report in words. Null when no completed job has been measured yet. */
export function describeCalibration(row: DurationCalibration): CalibrationSummary | null {
  if (row.timed_jobs <= 0) return null;

  const overrun = Number(row.avg_overrun_mins ?? 0);
  const headline =
    Math.abs(overrun) < ON_TARGET_AVG_MINS
      ? 'Your jobs finish close to your estimates.'
      : overrun > 0
        ? `Jobs take ${formatDuration(overrun)} longer than you quote, on average.`
        : `Jobs finish ${formatDuration(-overrun)} sooner than you quote, on average.`;

  const lines = [
    `${row.within_estimate_jobs} of ${row.timed_jobs} within 15 min · ${row.over_estimate_jobs} ran over · ${row.under_estimate_jobs} finished early`,
  ];

  const suggested = formatDuration(Number(row.avg_suggested_mins ?? 0));
  const quoted = formatDuration(Number(row.avg_estimated_mins ?? 0));
  const actual = formatDuration(Number(row.avg_actual_mins ?? 0));
  if (quoted && actual) {
    lines.push(
      suggested
        ? `Typical job: suggested ${suggested}, you quoted ${quoted}, it took ${actual}.`
        : `Typical job: you quoted ${quoted}, it took ${actual}.`,
    );
  }

  if (row.completed_jobs > 0) {
    lines.push(
      `Started 15+ min late: ${row.late_start_jobs} of ${row.completed_jobs} jobs.`,
    );
  }

  if (row.quoted_jobs > 0) {
    lines.push(
      row.surcharged_jobs > 0
        ? `${row.surcharged_jobs} of ${row.quoted_jobs} quotes added charges, ${Number(row.avg_quote_markup_pct ?? 0).toFixed(0)}% above your listed price on average.`
        : `None of your ${row.quoted_jobs} quotes added charges to your listed price.`,
    );
  }

  const nudge =
    overrun > NUDGE_OVERRUN_MINS
      ? 'Consider longer durations, or a job length adjustment below for the vehicles that run over.'
      : null;

  return { headline, lines, nudge };
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; row: DurationCalibration | null };

export function EstimateAccuracyCard(): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const result = await getDurationCalibration(new Date(Date.now() - REPORT_DAYS * DAY_MS));
    if (result.error) {
      setState({ kind: 'error', message: result.error.message });
      return;
    }
    setState({ kind: 'loaded', row: result.data[0] ?? null });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary =
    state.kind === 'loaded' && state.row ? describeCalibration(state.row) : null;

  return (
    <View testID="estimate-accuracy">
      <Card variant="outlined">
        <Text variant="label" color="charcoal">
          How your estimates hold up
        </Text>
        <Text variant="caption" color="midGray">
          {summary && state.kind === 'loaded' && state.row
            ? `Last ${REPORT_DAYS} days · ${state.row.timed_jobs} completed ${state.row.timed_jobs === 1 ? 'job' : 'jobs'} measured`
            : `Last ${REPORT_DAYS} days`}
        </Text>
        <Spacer size="sm" />

        {state.kind === 'loading' && (
          <ActivityIndicator color={palette.electricBlue} testID="estimate-accuracy-loading" />
        )}

        {state.kind === 'error' && (
          <>
            <Text variant="bodySmall" color="midGray">
              Couldn&apos;t load your report. {state.message}
            </Text>
            <Spacer size="sm" />
            <Button label="Retry" variant="secondary" size="md" onPress={load} />
          </>
        )}

        {state.kind === 'loaded' && !summary && (
          <Text variant="bodySmall" color="midGray" testID="estimate-accuracy-empty">
            Once you complete jobs, you&apos;ll see how long they take against what
            you quoted.
          </Text>
        )}

        {summary && (
          <>
            <Text variant="body" color="charcoal" testID="estimate-accuracy-headline">
              {summary.headline}
            </Text>
            {summary.lines.map((line) => (
              <Text key={line} variant="caption" color="midGray" style={styles.line}>
                {line}
              </Text>
            ))}
            {summary.nudge && (
              <>
                <Spacer size="xs" />
                <Text variant="caption" style={{ color: palette.gearGold }}>
                  {summary.nudge}
                </Text>
              </>
            )}
          </>
        )}
      </Card>
    </View>
  );
}

export default EstimateAccuracyCard;

const styles = StyleSheet.create({
  line: { marginTop: spacing.xs },
});
