// Text — branded typography wrapper for all text in CarApp.
// Maps every textStyle variant from design/typography.ts to a
// React Native Text element with automatic dark-mode color resolution.

import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { textStyles } from '../../design/typography';
import { colors } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TextVariant = keyof typeof textStyles;
export type TextColor = keyof typeof colors.light;

export interface TextProps extends Omit<RNTextProps, 'style'> {
  /**
   * Typography variant — maps directly to a textStyle defined in
   * src/design/typography.ts. Defaults to 'body'.
   */
  variant?: TextVariant;
  /**
   * Named color role from the design token palette.
   * Resolved against the active color scheme (light/dark).
   * Defaults to 'charcoal'.
   */
  color?: TextColor;
  /** Escape hatch to merge additional RN TextStyle overrides. */
  style?: RNTextProps['style'];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Text({
  variant = 'body',
  color = 'charcoal',
  style,
  ...rest
}: TextProps): React.ReactElement {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? colors.dark : colors.light;

  return (
    <RNText
      style={[styles.base, textStyles[variant], { color: palette[color] }, style]}
      {...rest}
    />
  );
}

export default Text;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  base: {
    // Prevent inheriting unexpected color from a parent RN Text.
    includeFontPadding: false,
  },
});
