// KudosDisplay — read-only summary of the kudos a provider has received,
// shown on the provider profile and the rating completion confirmation.
// Takes the raw `kudos` rows (snake_case enum strings from DB) and
// aggregates them into per-badge counts before rendering.

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import {
  KudosBadge,
  ALL_KUDOS,
  type KudosType,
} from '../ui/KudosBadge';
import { spacing } from '../../design/tokens';
import { kudosFromStorage } from './KudosBadgeSelector';

// ─── Types ─────────────────────────────────────────────────────────────

export interface KudosDisplayProps {
  /**
   * Either the raw badge column from the `kudos` table (snake_case strings)
   * or already-aggregated counts keyed by KudosType. Use the array form
   * when reading directly from the DB rows.
   */
  kudos: { badge: string }[] | Partial<Record<KudosType, number>>;
  /** Hides badges with a count of 0 when true (default). */
  hideEmpty?: boolean;
  /** Optional label shown above the badges. */
  label?: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export function KudosDisplay({
  kudos,
  hideEmpty = true,
  label,
}: KudosDisplayProps): React.ReactElement | null {
  const counts = useMemo(() => aggregate(kudos), [kudos]);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  const renderable = ALL_KUDOS.filter(
    (b) => !hideEmpty || (counts[b] ?? 0) > 0,
  );

  if (renderable.length === 0) {
    return null;
  }

  return (
    <View>
      {label && (
        <>
          <Text variant="label" color="charcoal">
            {label}
          </Text>
          <Spacer size="sm" />
        </>
      )}
      <View style={styles.grid}>
        {renderable.map((badge) => (
          <KudosBadge
            key={badge}
            badge={badge}
            count={counts[badge]}
            size="sm"
          />
        ))}
      </View>
      <Spacer size="xs" />
      <Text variant="caption" color="midGray">
        {total} {total === 1 ? 'kudo' : 'kudos'} received
      </Text>
    </View>
  );
}

export default KudosDisplay;

// ─── Aggregation ───────────────────────────────────────────────────────

function aggregate(
  input: KudosDisplayProps['kudos'],
): Partial<Record<KudosType, number>> {
  if (Array.isArray(input)) {
    const counts: Partial<Record<KudosType, number>> = {};
    for (const row of input) {
      const badge = kudosFromStorage(row.badge);
      if (!badge) continue;
      counts[badge] = (counts[badge] ?? 0) + 1;
    }
    return counts;
  }
  return input;
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
