// RunningLateCard — the provider's running-late control on the active job
// (spec §3 "Job day": "+15/+30/+60 running late").
//
// The provider states how far behind plan the job is; the host sends it to
// report_delay as an absolute figure (current + step), so a double tap restates
// rather than stacks. Before the start that delays the customer's expected
// arrival, after it the ready-by time. "On time" and "−15" take it back down —
// the "shorten" half of §2's shift / shorten / reschedule.
//
// Presentational: the host calls reportDelay and refetches.

import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Clock } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { formatDuration } from '../../utils/duration';
import {
  MAX_RUNNING_LATE_MINS,
  RUNNING_LATE_STEPS,
} from '../../../supabase/functions/_shared/eta';

export interface RunningLateCardProps {
  /** The delay the job carries now (bookings.running_late_mins). */
  runningLateMins: number;
  /** Whether the job has started — decides arrival vs. ready-by wording. */
  started: boolean;
  /** The customer's ready-by, formatted ("~4:30 PM"), or ''. */
  readyBy: string;
  /** When the customer now expects the provider ("2:30 PM"), or ''. */
  expectedArrival: string;
  /** Who is waiting, for the copy. */
  customerLabel: string;
  /** Called with the new absolute delay in minutes; 0 is back on time. */
  onReport: (delayMins: number) => void;
  busy?: boolean;
  /** What happened to the last report ("Dana was notified"), or null. */
  notice?: string | null;
}

export function RunningLateCard({
  runningLateMins,
  started,
  readyBy,
  expectedArrival,
  customerLabel,
  onReport,
  busy = false,
  notice = null,
}: RunningLateCardProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const late = Math.max(0, Math.round(runningLateMins));

  const title =
    late === 0
      ? 'On schedule'
      : started
        ? `Running ${formatDuration(late)} behind`
        : `Running ${formatDuration(late)} late`;

  const customerSees = started
    ? readyBy
      ? `${customerLabel} sees ready by ${readyBy}.`
      : ''
    : late > 0 && expectedArrival
      ? `${customerLabel} expects you around ${expectedArrival}.`
      : `${customerLabel} expects you on time.`;

  return (
    <View testID="running-late-card">
      <Card variant="outlined">
        <View style={styles.header}>
          <Clock
            size={16}
            color={late > 0 ? palette.gearGold : palette.midGray}
            strokeWidth={2.5}
          />
          <Text
            variant="label"
            color={late > 0 ? undefined : 'charcoal'}
            style={late > 0 ? { color: palette.gearGold } : undefined}
            testID="running-late-title"
          >
            {title}
          </Text>
        </View>
        {customerSees ? (
          <>
            <Spacer size="xs" />
            <Text variant="caption" color="midGray">
              {customerSees}
            </Text>
          </>
        ) : null}

        <Spacer size="md" />
        <Text variant="bodySmall" color="midGray">
          {started ? 'Taking longer than planned?' : 'Running late?'}
        </Text>
        <Spacer size="xs" />
        <View style={styles.row}>
          {RUNNING_LATE_STEPS.map((step) => (
            <Button
              key={step}
              label={`+${step} min`}
              variant="secondary"
              size="md"
              onPress={() => onReport(Math.min(late + step, MAX_RUNNING_LATE_MINS))}
              disabled={busy || late >= MAX_RUNNING_LATE_MINS}
              accessibilityLabel={`Running ${step} more minutes late`}
              style={styles.flex}
              testID={`delay-plus-${step}`}
            />
          ))}
        </View>

        {late > 0 && (
          <>
            <Spacer size="sm" />
            <View style={styles.row}>
              {late > 15 && (
                <Button
                  label="−15 min"
                  variant="ghost"
                  size="md"
                  onPress={() => onReport(late - 15)}
                  disabled={busy}
                  accessibilityLabel="Caught up 15 minutes"
                  style={styles.flex}
                  testID="delay-minus-15"
                />
              )}
              <Button
                label="Back on time"
                variant="ghost"
                size="md"
                onPress={() => onReport(0)}
                disabled={busy}
                accessibilityLabel="Back on schedule"
                style={styles.flex}
                testID="delay-on-time"
              />
            </View>
          </>
        )}

        {notice ? (
          <>
            <Spacer size="sm" />
            <Text variant="caption" color="midGray" testID="running-late-notice">
              {notice}
            </Text>
          </>
        ) : null}
      </Card>
    </View>
  );
}

export default RunningLateCard;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
