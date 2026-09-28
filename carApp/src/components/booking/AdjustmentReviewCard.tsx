// AdjustmentReviewCard — the customer's view of a change their provider has
// proposed to a confirmed job (spec §7 "vehicle worse than declared on
// arrival"; adjust_job_duration).
//
// Nothing agreed has moved: the booking still carries the old total and
// duration until the customer approves. Declining cancels the booking with a
// full deposit refund and no fee — the provider asked to change the deal, and
// saying no to that is nobody's fault — so the decline button says exactly
// that rather than a softer "Decline" that hides the consequence.
//
// Every figure here is the server's. The client never computes the adjusted
// total; it renders adjustment_total_amount and the itemised lines.

import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';
import { formatDuration } from '../../utils/duration';

export interface AdjustmentLine {
  label: string;
  amount_cents: number;
}

export interface AdjustmentReviewCardProps {
  providerName: string;
  reason: string | null;
  currentTotalCents: number;
  adjustedTotalCents: number;
  currentDurationMins: number | null;
  adjustedDurationMins: number;
  lines: AdjustmentLine[];
  onApprove: () => void;
  onDecline: () => void;
  busy?: boolean;
}

export function AdjustmentReviewCard({
  providerName,
  reason,
  currentTotalCents,
  adjustedTotalCents,
  currentDurationMins,
  adjustedDurationMins,
  lines,
  onApprove,
  onDecline,
  busy = false,
}: AdjustmentReviewCardProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const durationChanged = currentDurationMins !== adjustedDurationMins;

  return (
    <View testID="adjustment-review">
      <Card>
        <View style={styles.header}>
          <AlertTriangle size={18} color={palette.gearGold} strokeWidth={2} />
          <Text variant="label" color="charcoal" style={styles.flex}>
            {providerName} proposed a change
          </Text>
        </View>

        {reason ? (
          <>
            <Spacer size="sm" />
            <Text variant="body" color="charcoal">
              “{reason}”
            </Text>
          </>
        ) : null}

        <Spacer size="md" />

        {durationChanged && (
          <View style={styles.row}>
            <Text variant="body" color="midGray">
              Time
            </Text>
            <Text variant="body" color="charcoal">
              {formatDuration(currentDurationMins) || '—'} → {formatDuration(adjustedDurationMins)}
            </Text>
          </View>
        )}

        {lines.map((line, index) => (
          <View key={`${line.label}-${index}`} style={styles.row}>
            <Text variant="body" color="midGray" style={styles.lineLabel}>
              {line.label}
            </Text>
            <Text variant="body" color="charcoal">
              {line.amount_cents < 0
                ? `−${centsToDisplay(-line.amount_cents)}`
                : `+${centsToDisplay(line.amount_cents)}`}
            </Text>
          </View>
        ))}

        <Spacer size="sm" />
        <View style={styles.row}>
          <Text variant="subheading" color="charcoal">
            New total
          </Text>
          <Text variant="subheading" color="charcoal" testID="adjustment-new-total">
            {centsToDisplay(adjustedTotalCents)}
          </Text>
        </View>
        <Text variant="caption" color="midGray">
          Was {centsToDisplay(currentTotalCents)}. Your deposit stays as paid; the
          difference is added to the balance charged when the job is done.
        </Text>

        <Spacer size="md" />
        <Button
          label="Approve Change"
          variant="primary"
          size="lg"
          onPress={onApprove}
          loading={busy}
          testID="adjustment-approve"
        />
        <Spacer size="sm" />
        <Button
          label="Decline & Cancel Booking"
          variant="ghost"
          size="md"
          onPress={onDecline}
          loading={busy}
          testID="adjustment-decline"
        />
        <Text variant="caption" color="midGray" style={styles.center}>
          Declining cancels the booking and refunds your deposit in full.
        </Text>
      </Card>
    </View>
  );
}

export default AdjustmentReviewCard;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  lineLabel: { flex: 1, marginRight: spacing.sm },
  center: { textAlign: 'center' },
});
