// Card — flexible surface container for CarApp.
// Supports elevated/outlined/flat variants, optional press interaction,
// dark mode via design tokens, and 12px card border radius per spec.

import React, { useMemo } from 'react';
import {
  View,
  Pressable,
  ViewStyle,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { colors, borderRadius, spacing } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardVariant = 'elevated' | 'outlined' | 'flat';

export interface CardProps {
  /** Visual style of the card surface. Defaults to 'elevated'. */
  variant?: CardVariant;
  /** When provided the card becomes pressable with press feedback. */
  onPress?: () => void;
  /** Disables press interaction and dims the card (only applies when onPress is set). */
  disabled?: boolean;
  /** Content rendered inside the card. */
  children: React.ReactNode;
  /** Override the outer card container style. */
  style?: ViewStyle;
  /** Override the inner content padding style. */
  contentStyle?: ViewStyle;
  /** Accessibility label read by screen readers (recommended when card is pressable). */
  accessibilityLabel?: string;
  /** Accessibility hint read by screen readers. */
  accessibilityHint?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Card = React.forwardRef<View, CardProps>(
  function Card(
    {
      variant = 'elevated',
      onPress,
      disabled = false,
      children,
      style,
      contentStyle,
      accessibilityLabel,
      accessibilityHint,
    },
    ref
  ) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;

    const cardStyle = useMemo((): ViewStyle => {
      const base: ViewStyle = {
        borderRadius: borderRadius.card,
        overflow: 'hidden',
      };

      switch (variant) {
        case 'outlined':
          return {
            ...base,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : palette.offWhite,
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(160,160,160,0.25)' : 'rgba(119,119,119,0.2)',
          };

        case 'flat':
          return {
            ...base,
            backgroundColor: 'transparent',
          };

        case 'elevated':
        default:
          return {
            ...base,
            backgroundColor: isDark ? '#1E1E2E' : '#FFFFFF',
            // iOS shadow
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.4 : 0.08,
            shadowRadius: 8,
            // Android elevation
            elevation: isDark ? 6 : 3,
          };
      }
    }, [variant, isDark, palette]);

    const isInteractive = !!onPress && !disabled;

    if (onPress) {
      return (
        <Pressable
          ref={ref as React.Ref<View>}
          onPress={isInteractive ? onPress : undefined}
          disabled={disabled}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          style={({ pressed }) => [
            cardStyle,
            disabled && styles.disabled,
            pressed && isInteractive && styles.pressed,
            style,
          ]}
        >
          <View style={[styles.content, contentStyle]}>{children}</View>
        </Pressable>
      );
    }

    return (
      <View
        ref={ref}
        style={[cardStyle, style]}
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }
);

Card.displayName = 'Card';

export default Card;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
