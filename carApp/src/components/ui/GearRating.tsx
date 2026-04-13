// GearRating — 4-dimension rating widget for CarApp's gear rating system.
// Renders Quality, Timeliness, Communication, and Value rows — each scored
// 1–5 stars. Supports display mode (read-only, fractional half-star rendering)
// and interactive mode (tappable per-dimension input). Shows an optional
// overall score row computed as the arithmetic mean of all four dimensions.
// Uses gearGold design tokens and full dark-mode support.

import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  useColorScheme,
  ViewStyle,
} from 'react-native';
import { Rating, RatingSize } from './Rating';
import { Text } from './Text';
import { colors, spacing, borderRadius } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GearRatingValues {
  /** Quality score 1–5. */
  quality: number;
  /** Timeliness score 1–5. */
  timeliness: number;
  /** Communication score 1–5. */
  communication: number;
  /** Value score 1–5. */
  value: number;
}

export type GearRatingDimension = keyof GearRatingValues;

export interface GearRatingProps {
  /**
   * Current scores per dimension. Unset dimensions default to 0 (no stars).
   * Fractional values are honoured in display mode.
   */
  values?: Partial<GearRatingValues>;
  /** Star size preset applied to every dimension row. Defaults to 'sm'. */
  size?: RatingSize;
  /**
   * When true each dimension row is independently tappable.
   * Fractional rendering is disabled — stars snap to whole numbers.
   * Defaults to false.
   */
  interactive?: boolean;
  /**
   * Called when the user changes a dimension score.
   * Only fires when interactive is true.
   */
  onChange?: (dimension: GearRatingDimension, rating: number) => void;
  /**
   * When true an "Overall" row is appended showing the arithmetic mean of
   * all four dimensions. Only shown when at least one dimension has a value.
   * Defaults to true.
   */
  showOverall?: boolean;
  /** Container style override. */
  style?: ViewStyle;
  /** Accessibility label for the whole widget. */
  accessibilityLabel?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DIMENSIONS: { key: GearRatingDimension; label: string }[] = [
  { key: 'quality', label: 'Quality' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'communication', label: 'Communication' },
  { key: 'value', label: 'Value' },
];

// ─── Helper: compute arithmetic mean across entered dimensions ────────────────

function computeOverall(values: Partial<GearRatingValues>): number | null {
  const scores = DIMENSIONS.map(({ key }) => values[key] ?? 0);
  const nonZero = scores.filter((s) => s > 0);
  if (nonZero.length === 0) return null;
  const sum = nonZero.reduce((acc, s) => acc + s, 0);
  return Math.round((sum / nonZero.length) * 10) / 10;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const GearRating = React.memo<GearRatingProps>(function GearRating({
  values = {},
  size = 'sm',
  interactive = false,
  onChange,
  showOverall = true,
  style,
  accessibilityLabel,
}) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const overall = useMemo(() => computeOverall(values), [values]);

  const a11yLabel =
    accessibilityLabel ??
    (interactive ? 'Gear rating input' : 'Gear rating');

  return (
    <View
      style={[styles.container, style]}
      accessibilityLabel={a11yLabel}
      accessibilityRole="none"
    >
      {DIMENSIONS.map(({ key, label }, index) => {
        const score = values[key] ?? 0;
        const isLastBeforeOverall = index === DIMENSIONS.length - 1;

        return (
          <View
            key={key}
            style={[
              styles.row,
              !isLastBeforeOverall && styles.rowGap,
            ]}
          >
            <Text
              variant="label"
              color="midGray"
              style={styles.dimensionLabel}
            >
              {label}
            </Text>

            <Rating
              value={score}
              size={size}
              interactive={interactive}
              onChange={
                interactive && onChange
                  ? (rating) => onChange(key, rating)
                  : undefined
              }
              accessibilityLabel={`${label} rating${interactive ? ' input' : ''}, ${score} out of 5`}
            />
          </View>
        );
      })}

      {showOverall && overall !== null && (
        <View
          style={[
            styles.row,
            styles.overallRow,
            {
              borderTopColor: isDark
                ? 'rgba(255,255,255,0.10)'
                : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <Text variant="label" color="charcoal" style={styles.dimensionLabel}>
            Overall
          </Text>

          <View style={styles.overallRight}>
            <Rating
              value={overall}
              size={size}
              interactive={false}
              accessibilityLabel={`Overall gear rating: ${overall} out of 5`}
            />
            <Text
              variant="price"
              style={{ color: palette.gearGold }}
            >
              {overall.toFixed(1)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

GearRating.displayName = 'GearRating';

export default GearRating;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44, // WCAG 2.1 AA minimum touch target
  },
  rowGap: {
    marginBottom: spacing.xs,
  },
  dimensionLabel: {
    flex: 1,
    marginRight: spacing.sm,
  },
  overallRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  overallRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
