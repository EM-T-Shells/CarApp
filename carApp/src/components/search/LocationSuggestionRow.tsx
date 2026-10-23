// LocationSuggestionRow — a single tappable row in the location picker
// (search/location.tsx): a rounded icon tile, a title, and an optional
// subtitle. Used for "Current location", "Anywhere", recent searches, and
// popular areas so every row shares one accessible, 44pt-tall layout.

import React from 'react';
import {
  View,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors, borderRadius, spacing } from '../../design/tokens';

export interface LocationSuggestionRowProps {
  /** Lucide icon rendered inside the leading tile. */
  icon: LucideIcon;
  /** Primary label. */
  title: string;
  /** Optional secondary label beneath the title. */
  subtitle?: string;
  /** Tint for the icon; defaults to the charcoal text color. */
  iconColor?: string;
  /** Show a spinner in place of the icon (e.g. while fetching GPS). */
  loading?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export function LocationSuggestionRow({
  icon: Icon,
  title,
  subtitle,
  iconColor,
  loading = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: LocationSuggestionRowProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const tileBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(34,34,34,0.05)';
  const tint = iconColor ?? palette.charcoal;

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' },
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <View style={[styles.tile, { backgroundColor: tileBg }]}>
        {loading ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Icon size={22} color={tint} strokeWidth={2} />
        )}
      </View>

      <View style={styles.labels}>
        <Text variant="label" color="charcoal" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="midGray" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default LocationSuggestionRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.input,
    gap: spacing.md,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.input,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labels: {
    flex: 1,
  },
});
