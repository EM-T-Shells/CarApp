// Rating — general-purpose 1–5 star widget for CarApp.
// Supports display mode (read-only, fractional half-star rendering) and
// interactive mode (tappable whole-number input with WCAG 2.1 AA touch
// targets). Uses the gearGold design token for filled stars. Full dark-mode.

import React, { useMemo, useCallback } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Star } from 'lucide-react-native';
import { Text } from './Text';
import { colors, spacing } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingProps {
  /** Current rating value (1–5). Fractional values are honoured in display mode. */
  value?: number;
  /** Total number of stars. Defaults to 5. */
  maxStars?: number;
  /** Star size preset. Defaults to 'md'. */
  size?: RatingSize;
  /**
   * When true the stars are tappable and onChange is called with the new value.
   * Fractional rendering is disabled — stars snap to whole numbers.
   * Defaults to false.
   */
  interactive?: boolean;
  /** Called with the selected star index (1–maxStars) when interactive is true. */
  onChange?: (rating: number) => void;
  /**
   * Optional text rendered to the right of the stars.
   * Pass the formatted score or review count, e.g. "4.8" or "(120 reviews)".
   */
  label?: string;
  /** Container style override. */
  style?: ViewStyle;
  /** Accessibility label for the whole rating row. */
  accessibilityLabel?: string;
}

// ─── Size Config ──────────────────────────────────────────────────────────────

const SIZE_MAP: Record<RatingSize, { starSize: number; gap: number }> = {
  sm: { starSize: 14, gap: 2 },
  md: { starSize: 18, gap: 3 },
  lg: { starSize: 24, gap: 4 },
};

// Minimum touch target side — stars smaller than this get a hit-slop boost.
const MIN_TOUCH = 44;

// ─── Sub-component: one star cell ─────────────────────────────────────────────

interface StarCellProps {
  /** 0 = empty, 0.5 = half, 1 = full */
  fill: 0 | 0.5 | 1;
  starSize: number;
  filledColor: string;
  emptyColor: string;
}

const StarCell = React.memo<StarCellProps>(function StarCell({
  fill,
  starSize,
  filledColor,
  emptyColor,
}) {
  if (fill === 1) {
    return (
      <Star
        size={starSize}
        color={filledColor}
        fill={filledColor}
        strokeWidth={1.5}
      />
    );
  }

  if (fill === 0) {
    return (
      <Star
        size={starSize}
        color={emptyColor}
        fill="transparent"
        strokeWidth={1.5}
      />
    );
  }

  // Half star — overlay a clipped filled star on top of an empty one.
  return (
    <View style={{ width: starSize, height: starSize }}>
      {/* Base: empty star */}
      <Star
        size={starSize}
        color={emptyColor}
        fill="transparent"
        strokeWidth={1.5}
      />
      {/* Top: filled star clipped to left half */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { width: starSize / 2, overflow: 'hidden' },
        ]}
      >
        <Star
          size={starSize}
          color={filledColor}
          fill={filledColor}
          strokeWidth={1.5}
        />
      </View>
    </View>
  );
});

// ─── Helper: derive fill values from a numeric rating ─────────────────────────

/**
 * Returns an array of fill values (0 | 0.5 | 1) for each star position.
 * Fractional values are rounded to the nearest 0.5.
 * In interactive mode every star is either fully filled or empty.
 */
function computeFills(
  value: number,
  maxStars: number,
  interactive: boolean,
): Array<0 | 0.5 | 1> {
  const clamped = Math.max(0, Math.min(value, maxStars));
  const rounded = interactive ? Math.round(clamped) : Math.round(clamped * 2) / 2;

  return Array.from({ length: maxStars }, (_, i) => {
    const position = i + 1;
    if (rounded >= position) return 1;
    if (!interactive && rounded >= position - 0.5) return 0.5;
    return 0;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Rating = React.memo<RatingProps>(function Rating({
  value = 0,
  maxStars = 5,
  size = 'md',
  interactive = false,
  onChange,
  label,
  style,
  accessibilityLabel,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const { starSize, gap } = SIZE_MAP[size];

  const filledColor = palette.gearGold;
  const emptyColor = isDark
    ? 'rgba(160,160,160,0.4)'
    : 'rgba(119,119,119,0.35)';

  const fills = useMemo(
    () => computeFills(value, maxStars, interactive),
    [value, maxStars, interactive],
  );

  const handlePress = useCallback(
    (index: number) => {
      if (interactive && onChange) {
        onChange(index + 1);
      }
    },
    [interactive, onChange],
  );

  // Hit-slop ensures stars below MIN_TOUCH still meet WCAG 2.1 AA.
  const hitSlop = useMemo(() => {
    if (starSize >= MIN_TOUCH) return undefined;
    const pad = (MIN_TOUCH - starSize) / 2;
    return { top: pad, bottom: pad, left: pad, right: pad };
  }, [starSize]);

  const a11yLabel =
    accessibilityLabel ??
    (interactive
      ? `Rating input, current value ${value} out of ${maxStars}`
      : `Rating: ${value} out of ${maxStars} stars`);

  return (
    <View
      style={[styles.row, { gap }, style]}
      accessibilityLabel={a11yLabel}
      accessibilityRole={interactive ? 'adjustable' : 'none'}
      accessibilityValue={
        interactive ? { min: 0, max: maxStars, now: value } : undefined
      }
    >
      {fills.map((fill, i) => {
        const starCell = (
          <StarCell
            key={i}
            fill={fill}
            starSize={starSize}
            filledColor={filledColor}
            emptyColor={emptyColor}
          />
        );

        if (!interactive) {
          return <View key={i}>{starCell}</View>;
        }

        const starValue = i + 1;
        return (
          <Pressable
            key={i}
            onPress={() => handlePress(i)}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={`${starValue} star${starValue !== 1 ? 's' : ''}`}
            accessibilityState={{ selected: value === starValue }}
            style={({ pressed }) => pressed && styles.pressed}
          >
            {starCell}
          </Pressable>
        );
      })}

      {label != null && (
        <Text
          variant="bodySmall"
          style={{ color: palette.midGray, marginLeft: spacing.xs }}
        >
          {label}
        </Text>
      )}
    </View>
  );
});

Rating.displayName = 'Rating';

export default Rating;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
