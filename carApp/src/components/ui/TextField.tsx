// TextField — labeled text input with error/hint display, icon slots,
// secure-text toggle, multiline support, focus styling, and dark mode.
// Meets WCAG 2.1 AA (44pt minimum touch target on interactive affordances).

import React, { useState, useCallback } from 'react';
import {
  TextInput,
  TextInputProps,
  View,
  Pressable,
  ViewStyle,
  useColorScheme,
  StyleSheet,
} from 'react-native';
import { Text } from './Text';
import { colors, borderRadius, spacing } from '../../design/tokens';
import { textStyles, fontFamilies } from '../../design/typography';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TextFieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  /** Label rendered above the input. */
  label?: string;
  /** Inline error message. When set the border turns red and the message appears below. */
  error?: string;
  /** Helper text rendered below the input. Hidden when `error` is set. */
  hint?: string;
  /** Icon rendered inside the left edge of the input. */
  leftIcon?: React.ReactNode;
  /** Icon rendered inside the right edge of the input. */
  rightIcon?: React.ReactNode;
  /** Renders a password input with a built-in show/hide toggle. */
  secureTextEntry?: boolean;
  /** Disables interaction and dims the input. */
  disabled?: boolean;
  /** Optional style overrides for the outer container. */
  containerStyle?: ViewStyle;
  /** Optional style overrides for the input wrapper (border box). */
  inputWrapperStyle?: ViewStyle;
}

// ─── Internal constants ───────────────────────────────────────────────────────

// Danger red is not in the core token palette — defined locally for error states only.
const DANGER_RED_LIGHT = '#E74C3C';
const DANGER_RED_DARK = '#FF6B6B';

// ─── Component ───────────────────────────────────────────────────────────────

export const TextField = React.forwardRef<TextInput, TextFieldProps>(
  function TextField(
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      secureTextEntry = false,
      disabled = false,
      containerStyle,
      inputWrapperStyle,
      onFocus,
      onBlur,
      multiline = false,
      ...rest
    },
    ref
  ) {
    const scheme = useColorScheme();
    const isDark = scheme === 'dark';
    const palette = isDark ? colors.dark : colors.light;
    const dangerRed = isDark ? DANGER_RED_DARK : DANGER_RED_LIGHT;

    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(secureTextEntry);

    const handleFocus = useCallback(
      (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
        setFocused(true);
        onFocus?.(e);
      },
      [onFocus]
    );

    const handleBlur = useCallback(
      (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
        setFocused(false);
        onBlur?.(e);
      },
      [onBlur]
    );

    // ── Border color resolution ──────────────────────────────────────────────
    let borderColor: string;
    if (error) {
      borderColor = dangerRed;
    } else if (focused) {
      borderColor = palette.electricBlue;
    } else {
      borderColor = isDark ? 'rgba(160,160,160,0.35)' : 'rgba(119,119,119,0.35)';
    }

    // ── Wrapper style ────────────────────────────────────────────────────────
    const wrapperStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: multiline ? 'flex-start' : 'center',
      borderWidth: 1.5,
      borderColor,
      borderRadius: borderRadius.input,
      backgroundColor: disabled
        ? isDark
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(0,0,0,0.04)'
        : isDark
        ? 'rgba(255,255,255,0.03)'
        : palette.offWhite,
      paddingHorizontal: spacing.md,
      paddingVertical: multiline ? spacing.md : 0,
      minHeight: 44,
      opacity: disabled ? 0.55 : 1,
    };

    // ── Secure-text toggle label ──────────────────────────────────────────────
    const toggleLabel = hidden ? 'Show' : 'Hide';

    return (
      <View style={[styles.container, containerStyle]}>
        {/* Label */}
        {label ? (
          <Text
            variant="label"
            style={[styles.label, error ? { color: dangerRed } : undefined]}
          >
            {label}
          </Text>
        ) : null}

        {/* Input wrapper */}
        <View style={[wrapperStyle, inputWrapperStyle]}>
          {/* Left icon */}
          {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}

          {/* Text input */}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              {
                color: palette.charcoal,
                fontFamily: fontFamilies.ui,
                fontSize: textStyles.body.fontSize,
                lineHeight: textStyles.body.lineHeight,
              },
              multiline && styles.inputMultiline,
            ]}
            placeholderTextColor={palette.midGray}
            secureTextEntry={hidden}
            editable={!disabled}
            multiline={multiline}
            onFocus={handleFocus}
            onBlur={handleBlur}
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            {...rest}
          />

          {/* Right icon or secure-text toggle */}
          {secureTextEntry ? (
            <Pressable
              onPress={() => setHidden((h) => !h)}
              style={styles.iconRight}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
              hitSlop={8}
            >
              <Text variant="label" color="electricBlue">
                {toggleLabel}
              </Text>
            </Pressable>
          ) : rightIcon ? (
            <View style={styles.iconRight}>{rightIcon}</View>
          ) : null}
        </View>

        {/* Error or hint */}
        {error ? (
          <Text variant="caption" style={[styles.subText, { color: dangerRed }]}>
            {error}
          </Text>
        ) : hint ? (
          <Text variant="caption" color="midGray" style={styles.subText}>
            {hint}
          </Text>
        ) : null}
      </View>
    );
  }
);

TextField.displayName = 'TextField';

export default TextField;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginBottom: spacing.xs,
  },
  input: {
    flex: 1,
    // Remove default inner padding Android adds inside TextInput.
    paddingVertical: spacing.sm,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: spacing.xs,
  },
  iconLeft: {
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconRight: {
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  subText: {
    marginTop: spacing.xs,
  },
});
