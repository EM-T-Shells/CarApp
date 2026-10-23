// DelayKnockOn — what a reported delay does to the provider's later jobs
// (spec §2: "provider chooses shift / shorten / reschedule").
//
// report_delay returns the later jobs whose customers are now being told the
// wrong thing, with the delay each would need. For each, the provider chooses:
//   • Let them know  — shift: report that delay on the later job, which pushes
//                      its customer the new arrival time
//   • New time       — reschedule: propose a new start, which the customer
//                      accepts or not (propose_reschedule)
//   • Leave it       — shorten: the provider will make the time up; nobody is
//                      told anything new
// Nothing moves on its own. The same panel offers to take a delay back when
// the provider is on time again.
//
// Presentational: the host calls the wrappers and drops a handled entry.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { spacing } from '../../design/tokens';
import { formatTime } from '../../utils/date';
import { formatDuration } from '../../utils/duration';
import type { DelayKnockOn as KnockOnEntry } from '../../lib/stripe';

export interface DelayKnockOnProps {
  entries: KnockOnEntry[];
  /** The entry being acted on, so only its buttons show progress. */
  busyId?: string | null;
  onTell: (entry: KnockOnEntry) => void;
  onPropose: (entry: KnockOnEntry) => void;
  onLeave: (entry: KnockOnEntry) => void;
}

/** What the change means for that customer, in one sentence. */
export function describeKnockOn(entry: KnockOnEntry): string {
  const { required_delay_mins: required, current_delay_mins: current } = entry;

  if (required > current) {
    const told = current > 0 ? ` They were told ${formatDuration(current)}.` : ' They don’t know yet.';
    return `Can now start around ${formatTime(entry.projected_start_at)}, about ${formatDuration(required)} late.${told}`;
  }

  return required === 0
    ? `Back on time. They were told you’d be ${formatDuration(current)} late.`
    : `Now about ${formatDuration(required)} late. They were told ${formatDuration(current)}.`;
}

export function DelayKnockOn({
  entries,
  busyId = null,
  onTell,
  onPropose,
  onLeave,
}: DelayKnockOnProps): React.ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <View testID="delay-knock-on">
      <Text variant="label" color="charcoal">
        Later jobs this affects
      </Text>
      <Text variant="caption" color="midGray">
        For each one, tell them, propose a new time, or leave it if you’ll make the
        time up.
      </Text>
      {entries.map((entry) => {
        const later = entry.required_delay_mins > entry.current_delay_mins;
        const busy = busyId === entry.booking_id;
        const who = entry.customer_name ?? 'Your next customer';
        return (
          <View key={entry.booking_id} testID={`knock-on-${entry.booking_id}`}>
            <Spacer size="sm" />
            <Card>
              <Text variant="label" color="charcoal">
                {who} · {formatTime(entry.scheduled_at)}
              </Text>
              <Spacer size="xs" />
              <Text variant="bodySmall" color="midGray">
                {describeKnockOn(entry)}
              </Text>
              <Spacer size="md" />
              <View style={styles.row}>
                <Button
                  label={later ? 'Let them know' : 'Update them'}
                  variant="primary"
                  size="md"
                  onPress={() => onTell(entry)}
                  loading={busy}
                  disabled={busyId !== null && !busy}
                  accessibilityLabel={
                    later
                      ? `Tell ${who} you will be about ${entry.required_delay_mins} minutes late`
                      : `Tell ${who} the new time`
                  }
                  style={styles.flex}
                  testID={`knock-on-tell-${entry.booking_id}`}
                />
                {later && (
                  <Button
                    label="New time"
                    variant="secondary"
                    size="md"
                    onPress={() => onPropose(entry)}
                    disabled={busyId !== null}
                    accessibilityLabel={`Propose a new time to ${who}`}
                    style={styles.flex}
                    testID={`knock-on-propose-${entry.booking_id}`}
                  />
                )}
              </View>
              <Spacer size="xs" />
              <Button
                label={later ? 'Leave it, I’ll catch up' : 'Leave it'}
                variant="ghost"
                size="md"
                onPress={() => onLeave(entry)}
                disabled={busyId !== null}
                accessibilityLabel={`Leave ${who}'s booking as it is`}
                testID={`knock-on-leave-${entry.booking_id}`}
              />
            </Card>
          </View>
        );
      })}
    </View>
  );
}

export default DelayKnockOn;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
