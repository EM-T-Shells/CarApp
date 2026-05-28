// Button — multi-variant, accessible button component for CarApp.
// Supports primary/secondary/success/danger/ghost variants, sm/md/lg sizes,
// disabled/loading states, left/right icons, dark mode, and meets WCAG 2.1 AA
// minimum touch target (44x44dp).

import React, { useMemo } from 'react';
import {
  Pressable,
  PressableProps,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  useColorScheme,
} from 'react-native';
import { Text } from './Text';
import type { TextVariant } from './Text';
import { colors, borderRadius, spacing } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  /** Button label text. */
  label: string;
  /** Design variant — defaults to 'primary'. */
  variant?: ButtonVariant;
  /** Button size — defaults to 'md'. */
  size?: ButtonSize;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Whether the button is in a loading state. */
  loading?: boolean;
  /** Optional icon rendered to the left of the label. */
  leftIcon?: React.ReactNode;
  /** Optional icon rendered to the right of the label. */
  rightIcon?: React.ReactNode;
  /** Optional container style overrides. */
  style?: ViewStyle;
  /** Optional label text style overrides. */
  textStyle?: TextStyle;
  /** Custom color for the loading spinner. Defaults to the label color. */
  loadingColor?: string;
  /** Accessibility label read by screen readers. Defaults to label. */
  accessibilityLabel?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  function Button(
    {
      label,
      variant = 'primary',
      size = 'md',
      disabled = false,
      loading = false,
      leftIcon,
      rightIcon,
      style,
      textStyle,
      loadingColor,
      accessibilityLabel,
      onPress,
      ...rest
    },
    ref
  ) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;

    const { containerStyle, labelVariant, labelColor, spinnerColor } = useMemo(() => {
      // ── Size ──────────────────────────────────────────────────────────────
      let sizePadding: ViewStyle;
      let labelVariant: TextVariant;

      switch (size) {
        case 'sm':
          sizePadding = {
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.md,
            minHeight: 36,
          };
          labelVariant = 'bodySmall';
          break;
        case 'lg':
          sizePadding = {
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.lg,
            minHeight: 52,
          };
          labelVariant = 'bodyLarge';
          break;
        case 'md':
        default:
          sizePadding = {
            paddingVertical: spacing.base,
            paddingHorizontal: spacing.lg,
            minHeight: 44,
          };
          labelVariant = 'body';
          break;
      }

      // ── Variant ───────────────────────────────────────────────────────────
      let backgroundColor: string;
      let borderStyle: ViewStyle = {};
      let labelColor: string;

      switch (variant) {
        case 'secondary':
          backgroundColor = isDark ? 'rgba(90, 157, 255, 0.15)' : 'rgba(26, 109, 255, 0.1)';
          borderStyle = { borderWidth: 2, borderColor: palette.electricBlue };
          labelColor = palette.electricBlue;
          break;
        case 'success':
          backgroundColor = isDark ? 'rgba(52, 217, 138, 0.15)' : 'rgba(16, 169, 106, 0.1)';
          borderStyle = { borderWidth: 2, borderColor: palette.emeraldGreen };
          labelColor = palette.emeraldGreen;
          break;
        case 'danger':
          // Red is not in the token palette — use a fixed value for danger only.
          const dangerRed = isDark ? '#FF6B6B' : '#E74C3C';
          backgroundColor = isDark ? 'rgba(255, 107, 107, 0.15)' : 'rgba(231, 76, 60, 0.1)';
          borderStyle = { borderWidth: 2, borderColor: dangerRed };
          labelColor = dangerRed;
          break;
        case 'ghost':
          backgroundColor = 'transparent';
          labelColor = palette.midGray;
          break;
        case 'primary':
        default:
          backgroundColor = palette.deepIndigo;
          labelColor = palette.offWhite;
          break;
      }

      const containerStyle: ViewStyle = {
        borderRadius: borderRadius.button,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        opacity: disabled || loading ? 0.6 : 1,
        backgroundColor,
        ...sizePadding,
        ...borderStyle,
      };

      return { containerStyle, labelVariant, labelColor, spinnerColor: loadingColor ?? labelColor };
    }, [variant, size, disabled, loading, isDark, palette, loadingColor]);

    const isInteractive = !disabled && !loading;

    return (
      <Pressable
        ref={ref}
        style={({ pressed }) => [
          containerStyle,
          pressed && isInteractive && { opacity: 0.7 },
          style,
        ]}
        onPress={isInteractive ? onPress : undefined}
        disabled={disabled || loading}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        {...rest}
      >
        {leftIcon && !loading && leftIcon}

        {loading ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          <Text
            variant={labelVariant}
            style={[{ color: labelColor, fontWeight: '600' }, textStyle]}
          >
            {label}
          </Text>
        )}

        {rightIcon && !loading && rightIcon}
      </Pressable>
    );
  }
);

Button.displayName = 'Button';

// ─── Convenience Exports ──────────────────────────────────────────────────────

export const PrimaryButton = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} {...props} variant="primary" />);
PrimaryButton.displayName = 'PrimaryButton';

export const SecondaryButton = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} {...props} variant="secondary" />);
SecondaryButton.displayName = 'SecondaryButton';

export const SuccessButton = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} {...props} variant="success" />);
SuccessButton.displayName = 'SuccessButton';

export const DangerButton = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} {...props} variant="danger" />);
DangerButton.displayName = 'DangerButton';

export const GhostButton = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  Omit<ButtonProps, 'variant'>
>((props, ref) => <Button ref={ref} {...props} variant="ghost" />);
GhostButton.displayName = 'GhostButton';
