// Reschedule UI shared by the customer's booking screen and the provider's job
// screen. A confirmed start is a commitment on both sides, so neither side
// moves it alone (propose_reschedule / respond_reschedule): one proposes, the
// booking keeps its current time and slot, and the other accepts or declines.
//
//   • RescheduleSheet         — pick and propose a new start
//   • RescheduleProposalCard  — an open proposal, from the viewer's side: the
//                               other party's proposal to answer, or their own
//                               to withdraw
//
// Presentational: the host calls the Stripe-module wrappers and refetches.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { Sheet } from '../ui/Sheet';
import { DateTimePicker } from './DateTimePicker';
import { colors, spacing } from '../../design/tokens';
import { formatDateTime } from '../../utils/date';

export interface RescheduleSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The booking's current start; the proposal must differ from it. */
  currentScheduledAt: string;
  /** Who will be asked to agree — shapes the explanation. */
  otherPartyLabel: string;
  onSubmit: (scheduledAt: string) => void;
  submitting?: boolean;
}

export function RescheduleSheet({
  visible,
  onClose,
  currentScheduledAt,
  otherPartyLabel,
  onSubmit,
  submitting = false,
}: RescheduleSheetProps): React.ReactElement {
  const [proposedAt, setProposedAt] = useState<string | null>(currentScheduledAt);

  // Start from the current time each time the sheet opens, not from whatever
  // was picked and abandoned last time.
  useEffect(() => {
    if (visible) setProposedAt(currentScheduledAt);
  }, [visible, currentScheduledAt]);

  const unchanged = !proposedAt || proposedAt === currentScheduledAt;

  return (
    <Sheet visible={visible} onClose={onClose} title="Propose a new time">
      <View>
        <Text variant="body" color="midGray">
          Your booking stays at {formatDateTime(currentScheduledAt)} until{' '}
          {otherPartyLabel} accepts the new time.
        </Text>
        <Spacer size="md" />
        <DateTimePicker value={proposedAt} onChange={setProposedAt} />
        <Spacer size="lg" />
        <Button
          label="Send Proposal"
          variant="primary"
          size="lg"
          onPress={() => proposedAt && onSubmit(proposedAt)}
          loading={submitting}
          disabled={unchanged}
          testID="reschedule-submit"
        />
        <Spacer size="sm" />
        <Button label="Cancel" variant="ghost" size="md" onPress={onClose} disabled={submitting} />
      </View>
    </Sheet>
  );
}

export interface RescheduleProposalCardProps {
  proposedAt: string;
  /** True when the person looking at it made the proposal. */
  proposedByViewer: boolean;
  /** Name of the other party, for the copy. */
  otherPartyLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  busy?: boolean;
}

export function RescheduleProposalCard({
  proposedAt,
  proposedByViewer,
  otherPartyLabel,
  onAccept,
  onDecline,
  onWithdraw,
  busy = false,
}: RescheduleProposalCardProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <View testID="reschedule-proposal">
      <Card>
        <View style={styles.header}>
          <CalendarClock size={18} color={palette.gearGold} strokeWidth={2} />
          <Text variant="label" color="charcoal">
            {proposedByViewer ? 'New time proposed' : `${otherPartyLabel} asked to move this booking`}
          </Text>
        </View>
        <Spacer size="sm" />
        <Text variant="body" color="charcoal">
          {formatDateTime(proposedAt)}
        </Text>
        <Text variant="caption" color="midGray">
          {proposedByViewer
            ? `Waiting for ${otherPartyLabel} to accept. The booking keeps its current time until then.`
            : 'Nothing changes unless you accept.'}
        </Text>
        <Spacer size="md" />
        {proposedByViewer ? (
          <Button
            label="Withdraw Proposal"
            variant="ghost"
            size="md"
            onPress={onWithdraw}
            loading={busy}
            testID="reschedule-withdraw"
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label="Decline"
              variant="secondary"
              size="md"
              onPress={onDecline}
              loading={busy}
              style={styles.flex}
              testID="reschedule-decline"
            />
            <Button
              label="Accept"
              variant="primary"
              size="md"
              onPress={onAccept}
              loading={busy}
              style={styles.flex}
              testID="reschedule-accept"
            />
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
