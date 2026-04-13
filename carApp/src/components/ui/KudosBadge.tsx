// KudosBadge — pill badge for CarApp's kudos recognition system.
// Renders one of the 6 fixed kudos types with a Lucide icon, label, and an
// optional received-count. Supports read-only display and interactive
// (selectable) modes with selected / unselected visual states.
// Dark mode is fully supported via dynamic color tokens.

import React, { useCallback } from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import {
  Sparkles,
  ShieldCheck,
  Wand2,
  Coins,
  Zap,
  MessageCircle,
  LucideIcon,
} from 'lucide-react-native';
import { Text } from './Text';
import { colors, spacing, borderRadius } from '../../design/tokens';

// ─── Kudos Types ──────────────────────────────────────────────────────────────

export type KudosType =
  | 'Meticulous'
  | 'Reliable'
  | 'Magic Hands'
  | 'Great Value'
  | 'Fast Worker'
  | 'Communicator';

export const ALL_KUDOS: KudosType[] = [
  'Meticulous',
  'Reliable',
  'Magic Hands',
  'Great Value',
  'Fast Worker',
  'Communicator',
];

// ─── Icon map ─────────────────────────────────────────────────────────────────

const KUDOS_ICON: Record<KudosType, LucideIcon> = {
  Meticulous: Sparkles,
  Reliable: ShieldCheck,
  'Magic Hands': Wand2,
  'Great Value': Coins,
  'Fast Worker': Zap,
  Communicator: MessageCircle,
};

// ─── Size config ──────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  sm: { iconSize: 14, paddingH: spacing.sm, paddingV: spacing.xs, gap: spacing.xs },
  md: { iconSize: 16, paddingH: spacing.md, paddingV: spacing.sm, gap: spacing.sm },
} as const;

export type KudosBadgeSize = keyof typeof SIZE_CONFIG;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface KudosBadgeProps {
  /** The kudos badge to display. */
  badge: KudosType;
  /**
   * Number of times this kudos was given to the provider.
   * Displayed as "×N" after the label when > 0.
   */
  count?: number;
  /**
   * Whether the badge is in a selected/active state.
   * Only meaningful when onPress is provided.
   * Defaults to false.
   */
  selected?: boolean;
  /**
   * Tapping callback. When provided the badge renders as a Pressable
   * with full touch affordance and WCAG 44pt minimum target.
   */
  onPress?: () => void;
  /** Visual size preset. Defaults to 'md'. */
  size?: KudosBadgeSize;
  /** Container style override. */
  style?: ViewStyle;
  /** Override the default accessibility label. */
  accessibilityLabel?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KudosBadge = React.memo<KudosBadgeProps>(function KudosBadge({
  badge,
  count,
  selected = false,
  onPress,
  size = 'md',
  style,
  accessibilityLabel,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const { iconSize, paddingH, paddingV, gap } = SIZE_CONFIG[size];
  const Icon = KUDOS_ICON[badge];

  const isInteractive = onPress !== undefined;

  // Colour logic:
  //   selected   → gearGold fill, charcoal text/icon
  //   unselected → transparent fill, deepIndigo stroke + text/icon
  const bgColor = selected ? palette.gearGold : 'transparent';
  const borderColor = selected ? palette.gearGold : palette.deepIndigo;
  const contentColor = selected
    ? colors.light.charcoal  // always dark text on gearGold fill for contrast
    : palette.deepIndigo;

  const a11yLabel =
    accessibilityLabel ??
    [
      badge,
      count != null && count > 0 ? `received ${count} times` : null,
      selected ? 'selected' : null,
    ]
      .filter(Boolean)
      .join(', ');

  const badgeContent = (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bgColor,
          borderColor,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          gap,
        },
      ]}
    >
      <Icon
        size={iconSize}
        color={contentColor}
        strokeWidth={2}
      />

      <Text
        variant="label"
        style={{ color: contentColor }}
        numberOfLines={1}
      >
        {badge}
      </Text>

      {count != null && count > 0 && (
        <Text
          variant="caption"
          style={{ color: contentColor, opacity: 0.75 }}
        >
          ×{count}
        </Text>
      )}
    </View>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
          style,
        ]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ selected }}
      >
        {badgeContent}
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.pressable, style]}
      accessibilityRole="text"
      accessibilityLabel={a11yLabel}
    >
      {badgeContent}
    </View>
  );
});

KudosBadge.displayName = 'KudosBadge';

export default KudosBadge;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Outer wrapper keeps the touch target ≥ 44pt per WCAG 2.1 AA.
  pressable: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.7,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: borderRadius.button,
    alignSelf: 'flex-start',
  },
});
