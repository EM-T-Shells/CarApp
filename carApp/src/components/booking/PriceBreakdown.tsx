// PriceBreakdown — displays the itemised price for the booking flow.
// Shows each selected service, the 2% service fee, and the total.
// All values are in cents and displayed via money.ts utilities.

import React from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';
import type { ServiceSnapshot } from '../../state/bookingDraft';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface PriceBreakdownProps {
  /** Snapshotted services selected for this booking. */
  services: ServiceSnapshot[];
  /** 2% customer service fee in cents. */
  serviceFeeCents: number;
  /** Grand total (subtotal + service fee) in cents. */
  totalCents: number;
  /** Optional container style overrides. */
  style?: ViewStyle;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PriceBreakdown({
  services,
  serviceFeeCents,
  totalCents,
  style,
}: PriceBreakdownProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const dividerColor = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.06)';

  return (
    <Card variant="outlined" style={style}>
      <Text variant="label" color="charcoal">
        Price Breakdown
      </Text>

      <Spacer size="md" />

      {/* Service line items */}
      {services.map((svc) => (
        <View key={svc.id} style={styles.lineItem}>
          <Text variant="body" color="charcoal" style={styles.lineLabel}>
            {svc.name}
          </Text>
          <Text variant="price" color="charcoal">
            {centsToDisplay(svc.base_price)}
          </Text>
        </View>
      ))}

      {/* Divider */}
      <View
        style={[styles.divider, { backgroundColor: dividerColor }]}
      />

      {/* Service fee */}
      <View style={styles.lineItem}>
        <Text variant="body" color="midGray" style={styles.lineLabel}>
          Service fee (2%)
        </Text>
        <Text variant="body" color="midGray">
          {centsToDisplay(serviceFeeCents)}
        </Text>
      </View>

      {/* Total */}
      <View
        style={[styles.divider, { backgroundColor: dividerColor }]}
      />

      <View style={styles.lineItem}>
        <Text variant="subheading" color="charcoal" style={styles.lineLabel}>
          Total
        </Text>
        <Text variant="price" color="deepIndigo">
          {centsToDisplay(totalCents)}
        </Text>
      </View>
    </Card>
  );
}

export default PriceBreakdown;

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
});
