// PackageSelector — the customer's service choice for a quote request (spec §6:
// "tiers + add-ons, shows a range not a single price").
//
// Main services first, tiered basic → premium. A main service's add-ons appear
// under it once it is selected, because an add-on cannot be booked without its
// main service (the database refuses it — 20260822000000 — and the draft store
// drops add-ons when their parent is deselected).
//
// Prices are ranges: the base price moved by what the provider's own modifiers
// could add for size and condition (see advertisedPriceRangeCents). It is an
// estimate; the provider's quote is what the customer approves.

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import { Check, Clock } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { Card } from '../ui/Card';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius, type Palette } from '../../design/tokens';
import { centsToDisplay } from '../../utils/money';
import {
  TIER_LABELS,
  advertisedPriceRangeCents,
  durationRangeLabel,
  isPackageTier,
  organizePackages,
  type CentsRange,
} from '../../utils/packages';
import type { ServiceDurationModifier, ServicePackage } from '../../types/models';

export interface PackageSelectorProps {
  packages: ServicePackage[];
  /** The provider's published modifiers; empty when they have none. */
  modifiers: ServiceDurationModifier[];
  selectedIds: string[];
  onToggle: (pkg: ServicePackage) => void;
}

function basePriceCents(pkg: ServicePackage): number {
  return Math.round(Number(pkg.base_price ?? 0) * 100);
}

/** "$150.00" or "$150.00–$205.00". */
export function formatPriceRange(range: CentsRange): string {
  return range.minCents === range.maxCents
    ? centsToDisplay(range.minCents)
    : `${centsToDisplay(range.minCents)}–${centsToDisplay(range.maxCents)}`;
}

export function PackageSelector({
  packages,
  modifiers,
  selectedIds,
  onToggle,
}: PackageSelectorProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;
  const { mains, addOnsByParent } = useMemo(() => organizePackages(packages), [packages]);

  if (mains.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="body" color="midGray">
          This provider has no services available.
        </Text>
      </View>
    );
  }

  const hasRanges = modifiers.some((m) => Number(m.delta_price ?? 0) > 0);

  return (
    <View>
      <Text variant="subheading" color="charcoal">
        Select Services
      </Text>
      <Spacer size="sm" />
      <Text variant="body" color="midGray">
        {hasRanges
          ? 'Prices are a range: your provider may add for vehicle size or condition, itemised in the quote you approve.'
          : 'Choose one or more services. Your provider confirms the final price in a quote you approve.'}
      </Text>
      <Spacer size="lg" />

      {mains.map((pkg) => {
        const selected = selectedIds.includes(pkg.id);
        const addOns = addOnsByParent[pkg.id] ?? [];
        return (
          <View key={pkg.id} style={styles.group}>
            <PackageRow
              pkg={pkg}
              selected={selected}
              onPress={() => onToggle(pkg)}
              price={formatPriceRange(advertisedPriceRangeCents(basePriceCents(pkg), modifiers))}
              palette={palette}
            />

            {selected && addOns.length > 0 && (
              <View style={[styles.addOns, { borderLeftColor: palette.deepIndigo + '44' }]}>
                <Text variant="caption" color="midGray">
                  Add-ons
                </Text>
                {addOns.map((addOn) => (
                  <PackageRow
                    key={addOn.id}
                    pkg={addOn}
                    selected={selectedIds.includes(addOn.id)}
                    onPress={() => onToggle(addOn)}
                    price={`+${centsToDisplay(basePriceCents(addOn))}`}
                    palette={palette}
                    compact
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

interface PackageRowProps {
  pkg: ServicePackage;
  selected: boolean;
  onPress: () => void;
  price: string;
  palette: Palette;
  compact?: boolean;
}

function PackageRow({
  pkg,
  selected,
  onPress,
  price,
  palette,
  compact = false,
}: PackageRowProps): React.ReactElement {
  const duration = durationRangeLabel(pkg);
  const tier = isPackageTier(pkg.tier) ? TIER_LABELS[pkg.tier] : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${pkg.name}${tier ? `, ${tier}` : ''}, ${price}${duration ? `, ${duration}` : ''}`}
      testID={`package-${pkg.id}`}
    >
      <Card
        variant={selected ? 'elevated' : 'outlined'}
        style={[
          compact ? styles.compactCard : styles.card,
          selected && { borderWidth: 2, borderColor: palette.deepIndigo },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text variant={compact ? 'bodySmall' : 'body'} color="charcoal">
                {pkg.name}
              </Text>
              {tier && (
                <View style={[styles.tier, { backgroundColor: palette.deepIndigo + '1A' }]}>
                  <Text variant="caption" style={{ color: palette.deepIndigo }}>
                    {tier}
                  </Text>
                </View>
              )}
            </View>
            {!compact && pkg.description != null && pkg.description.length > 0 && (
              <Text variant="caption" color="midGray" numberOfLines={2}>
                {pkg.description}
              </Text>
            )}
            {duration.length > 0 && (
              <View style={styles.durationRow}>
                <Clock size={12} color={palette.midGray} strokeWidth={2} />
                <Text variant="caption" color="midGray">
                  {duration}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.right}>
            <Text variant={compact ? 'bodySmall' : 'price'} color="charcoal" testID={`package-price-${pkg.id}`}>
              {price}
            </Text>
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: selected ? palette.deepIndigo : 'transparent',
                  borderColor: selected ? palette.deepIndigo : palette.midGray,
                },
              ]}
            >
              {selected && <Check size={14} color={palette.offWhite} strokeWidth={3} />}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default PackageSelector;

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  group: { marginBottom: spacing.sm },
  card: { minHeight: 44 },
  compactCard: { minHeight: 44, paddingVertical: spacing.sm },
  addOns: {
    marginTop: spacing.sm,
    marginLeft: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  info: { flex: 1, marginRight: spacing.md, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  tier: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.input,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  right: { alignItems: 'flex-end', gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
