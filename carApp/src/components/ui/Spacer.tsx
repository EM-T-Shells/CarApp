// Spacer — invisible layout utility that inserts blank space between elements.
// Accepts a named size from the spacing token scale or an exact pixel value.
// Supports vertical (default), horizontal, and flex-grow modes.
// Import this instead of adding margin/padding directly on surrounding components.

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { spacing } from '../../design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Named steps from the spacing token scale defined in tokens.ts. */
export type SpacingSize = keyof typeof spacing;

export interface SpacerProps {
  /**
   * Named spacing token (e.g. 'sm', 'md', 'xl') or an exact pixel number.
   * Ignored when `flex` is true.
   */
  size?: SpacingSize | number;
  /**
   * When true the spacer grows to fill all remaining space in the flex axis
   * (equivalent to `flex: 1`). Overrides `size`.
   */
  flex?: boolean;
  /**
   * When true the spacer expands horizontally instead of vertically.
   * Defaults to false (vertical).
   */
  horizontal?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Spacer({ size = 'base', flex = false, horizontal = false }: SpacerProps) {
  const resolvedSize: number =
    typeof size === 'number' ? size : spacing[size];

  const style: ViewStyle = flex
    ? { flex: 1 }
    : horizontal
    ? { width: resolvedSize }
    : { height: resolvedSize };

  return <View style={style} />;
}

export default Spacer;
