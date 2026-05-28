// DepositSummary — displays the deposit payment breakdown for the booking
// confirmation step. Shows the 15% deposit due now, remaining balance due
// on completion, and a note about the late-cancellation forfeiture policy.

import React from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Info } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DepositSummaryProps {
  /** Total booking amount in cents. */
  totalCents: number;
  /** 15% deposit due at booking in cents. */
  depositCents: number;
  /** Remaining balance due on job completion in cents. */
  balanceCents: number;
  /** Optional container style overrides. */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DepositSummary({
  totalCents,
  depositCents,
  balanceCents,
  style,
}: DepositSummaryProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const dividerColor = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.06)';

  return (
    <Card variant="elevated" style={style}>
      <Text variant="label" color="charcoal">
        Payment Summary
      </Text>

      <Spacer size="md" />

      {/* Deposit due now */}
      <View style={styles.lineItem}>
        <Text variant="body" color="charcoal" style={styles.lineLabel}>
          Deposit due now (15%)
        </Text>
        <Text variant="price" color="deepIndigo">
          {centsToDisplay(depositCents)}
        </Text>
      </View>

      {/* Balance on completion */}
      <View style={styles.lineItem}>
        <Text variant="body" color="midGray" style={styles.lineLabel}>
          Balance on completion
        </Text>
        <Text variant="body" color="midGray">
          {centsToDisplay(balanceCents)}
        </Text>
      </View>

      <View
        style={[styles.divider, { backgroundColor: dividerColor }]}
      />

      {/* Total */}
      <View style={styles.lineItem}>
        <Text variant="subheading" color="charcoal" style={styles.lineLabel}>
          Total
        </Text>
        <Text variant="price" color="charcoal">
          {centsToDisplay(totalCents)}
        </Text>
      </View>

      <Spacer size="md" />

      {/* Cancellation policy note */}
      <View style={styles.policyRow}>
        <Info size={14} color={palette.midGray} strokeWidth={2} />
        <Text variant="caption" color="midGray" style={styles.policyText}>
          Cancellations within 24 hours of the scheduled time will forfeit the
          deposit.
        </Text>
      </View>
    </Card>
  );
}

export default DepositSummary;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  lineLabel: {
    flex: 1,
    marginRight: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  policyText: {
    flex: 1,
  },
});
