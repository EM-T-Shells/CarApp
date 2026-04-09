// Design Tokens — single source of truth for all design values in CarApp.
// Never hardcode hex values, font sizes, spacing, or radius in components.

// ─── Color Types ─────────────────────────────────────────────────────────────

type ColorRole =
  | 'deepIndigo'
  | 'electricBlue'
  | 'emeraldGreen'
  | 'gearGold'
  | 'offWhite'
  | 'charcoal'
  | 'midGray';

type ColorMap = Record<ColorRole, string>;

export interface Colors {
  readonly light: ColorMap;
  readonly dark: ColorMap;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

export const colors = {
  light: {
    deepIndigo: '#3D3B8E',
    electricBlue: '#1A6DFF',
    emeraldGreen: '#10A96A',
    gearGold: '#D4A017',
    offWhite: '#F7F8FC',
    charcoal: '#222222',
    midGray: '#777777',
  },
  dark: {
    deepIndigo: '#8D8BDE',
    electricBlue: '#5A9DFF',
    emeraldGreen: '#34D98A',
    gearGold: '#F0C040',
    offWhite: '#1A1A2E',
    charcoal: '#F0F0F0',
    midGray: '#A0A0A0',
  },
} as const satisfies Colors;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const borderRadius = {
  card: 12,
  input: 8,
  button: 24,
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const typography = {
  brand: 'SpaceGrotesk',
  ui: 'Inter',
  mono: 'JetBrainsMono',
} as const;

// ─── Combined Default Export ─────────────────────────────────────────────────

const tokens = {
  colors,
  borderRadius,
  spacing,
  typography,
} as const;

export default tokens;
