// Typography Tokens — font families, sizes, weights, line heights, and pre-composed text styles.
// All typography values in CarApp come from this file.

// ─── Font Families ───────────────────────────────────────────────────────────

export const fontFamilies = {
  brand: 'SpaceGrotesk',
  ui: 'Inter',
  mono: 'JetBrainsMono',
} as const;

// ─── Font Sizes (sp) ────────────────────────────────────────────────────────

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

// ─── Font Weights ────────────────────────────────────────────────────────────

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// ─── Line Heights ────────────────────────────────────────────────────────────

export const lineHeights = {
  xs: 16,
  sm: 18,
  md: 22,
  lg: 26,
  xl: 28,
  '2xl': 32,
  '3xl': 38,
  '4xl': 44,
} as const;

// ─── Text Style Type ─────────────────────────────────────────────────────────

interface TextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly lineHeight: number;
}

// ─── Text Styles ─────────────────────────────────────────────────────────────

export const textStyles = {
  displayLarge: {
    fontFamily: fontFamilies.brand,
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights['4xl'],
  },
  displayMedium: {
    fontFamily: fontFamilies.brand,
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights['3xl'],
  },
  heading: {
    fontFamily: fontFamilies.brand,
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights['2xl'],
  },
  subheading: {
    fontFamily: fontFamilies.brand,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.xl,
  },
  bodyLarge: {
    fontFamily: fontFamilies.ui,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.lg,
  },
  body: {
    fontFamily: fontFamilies.ui,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.md,
  },
  bodySmall: {
    fontFamily: fontFamilies.ui,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.sm,
  },
  label: {
    fontFamily: fontFamilies.ui,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.sm,
  },
  caption: {
    fontFamily: fontFamilies.ui,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.xs,
  },
  price: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.lg,
  },
  bookingId: {
    fontFamily: fontFamilies.mono,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    lineHeight: lineHeights.sm,
  },
} as const satisfies Record<string, TextStyle>;

// ─── Combined Default Export ─────────────────────────────────────────────────

const typography = {
  fontFamilies,
  fontSizes,
  fontWeights,
  lineHeights,
  textStyles,
} as const;

export default typography;
