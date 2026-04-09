// Theme — combined theme object merging tokens and typography.
// Components should import from this file when they need values from multiple token groups.

import tokens from './tokens';
import typography from './typography';

const theme = {
  colors: tokens.colors.light,
  dark: tokens.colors.dark,
  spacing: tokens.spacing,
  radius: tokens.borderRadius,
  typography: { ...typography },
} as const;

export type Theme = typeof theme;

export default theme;
