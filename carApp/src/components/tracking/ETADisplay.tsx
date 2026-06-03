// ETADisplay — bottom-of-screen ETA card for the live-tracking screen.
// Shows the estimated minutes-to-arrival, the great-circle distance to the
// service address, and the "last updated" relative timestamp. ETA is
// passed in pre-computed by the parent (using location.ts helpers) so this
// component stays purely presentational and easy to unit-test.

import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Clock, Navigation2 } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing } from '../../design/tokens';
import { formatRelativeTime } from '../../utils/date';
import {
  formatDistanceMiles,
  formatEtaMinutes,
} from '../../lib/location';

// ─── Types ─────────────────────────────────────────────────────────────

export interface ETADisplayProps {
  /** Estimated minutes to arrival. Use null when no provider position yet. */
  etaMinutes: number | null;
  /** Great-circle distance from provider to destination, in miles. */
  distanceMiles: number | null;
  /** ISO timestamp of the last position update. Null while waiting for first ping. */
  lastUpdatedAt: string | null;
}

// ─── Component ─────────────────────────────────────────────────────────

export function ETADisplay({
  etaMinutes,
  distanceMiles,
  lastUpdatedAt,
}: ETADisplayProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const hasFix = etaMinutes !== null && distanceMiles !== null;

  return (
    <Card variant="elevated">
      {!hasFix ? (
        <View style={styles.row}>
          <Clock size={20} color={palette.midGray} strokeWidth={2} />
          <View style={styles.flex}>
            <Text variant="label" color="midGray">
              Waiting for provider's location…
            </Text>
            <Text variant="caption" color="midGray">
              ETA appears once the provider starts sharing GPS.
            </Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <Navigation2
              size={20}
              color={palette.electricBlue}
              strokeWidth={2}
            />
            <View style={styles.flex}>
              <Text variant="caption" color="midGray">
                Estimated arrival
              </Text>
              <Text variant="subheading" color="charcoal">
                {formatEtaMinutes(etaMinutes!)}
              </Text>
            </View>
            <View style={styles.distanceCol}>
              <Text variant="caption" color="midGray">
                Distance
              </Text>
              <Text variant="label" color="charcoal">
                {formatDistanceMiles(distanceMiles!)}
              </Text>
            </View>
          </View>

          {lastUpdatedAt && (
            <>
              <Spacer size="sm" />
              <Text variant="caption" color="midGray">
                Updated {formatRelativeTime(lastUpdatedAt)}
              </Text>
            </>
          )}
        </>
      )}
    </Card>
  );
}

export default ETADisplay;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
    gap: spacing.xs,
  },
  distanceCol: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
});
