// KudosBadgeSelector — interactive grid for awarding kudos badges in the
// post-service rating sheet. Wraps the existing KudosBadge primitive with
// selected/unselected state, multi-select toggling, and an optional cap on
// how many badges a single customer can give per rating.

import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { Spacer } from '../ui/Spacer';
import {
  KudosBadge,
  ALL_KUDOS,
  type KudosType,
} from '../ui/KudosBadge';
import { spacing } from '../../design/tokens';

// ─── Types ─────────────────────────────────────────────────────────────

export interface KudosBadgeSelectorProps {
  /** Currently selected badge names. */
  selected: KudosType[];
  /** Called with the next selection after a tap. */
  onChange: (next: KudosType[]) => void;
  /** Maximum badges the user can pick. Defaults to ALL_KUDOS.length. */
  max?: number;
}

// ─── Component ─────────────────────────────────────────────────────────

export function KudosBadgeSelector({
  selected,
  onChange,
  max = ALL_KUDOS.length,
}: KudosBadgeSelectorProps): React.ReactElement {
  const toggle = useCallback(
    (badge: KudosType) => {
      const isSelected = selected.includes(badge);
      if (isSelected) {
        onChange(selected.filter((b) => b !== badge));
      } else if (selected.length < max) {
        onChange([...selected, badge]);
      }
    },
    [selected, onChange, max],
  );

  return (
    <View>
      <View style={styles.grid}>
        {ALL_KUDOS.map((badge) => {
          const isSelected = selected.includes(badge);
          const disabled = !isSelected && selected.length >= max;
          return (
            <KudosBadge
              key={badge}
              badge={badge}
              selected={isSelected}
              onPress={disabled ? undefined : () => toggle(badge)}
              size="md"
            />
          );
        })}
      </View>
      <Spacer size="xs" />
      <Text variant="caption" color="midGray">
        {selected.length}/{max} selected
      </Text>
    </View>
  );
}

export default KudosBadgeSelector;

// ─── Storage-format helpers ────────────────────────────────────────────

const TO_STORAGE: Record<KudosType, string> = {
  Meticulous: 'meticulous',
  Reliable: 'reliable',
  'Magic Hands': 'magic_hands',
  'Great Value': 'great_value',
  'Fast Worker': 'fast_worker',
  Communicator: 'communicator',
};

const FROM_STORAGE: Record<string, KudosType> = Object.fromEntries(
  Object.entries(TO_STORAGE).map(([k, v]) => [v, k as KudosType]),
);

/** Converts a display-name badge to the snake_case enum value stored in DB. */
export function kudosToStorage(badge: KudosType): string {
  return TO_STORAGE[badge];
}

/** Converts a DB enum value back to the display-name badge (or null if unknown). */
export function kudosFromStorage(value: string): KudosType | null {
  return FROM_STORAGE[value] ?? null;
}

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
