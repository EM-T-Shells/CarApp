// FiltersSheet — bottom drawer for refining provider search results.
// Exposes minimum rating and sort order filters. Uses a local draft so
// changes only apply when the user taps Apply. Composes the Sheet and
// Rating UI primitives and reads/writes the Zustand search store.

import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Rating } from '../ui/Rating';
import { Spacer } from '../ui/Spacer';
import { colors, spacing, borderRadius } from '../../design/tokens';
import type { ProviderSearchFilters } from '../../lib/supabase/queries';
import { useSearchStore } from '../../state/search';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FiltersSheetProps {
  /** Controls whether the sheet is shown. */
  visible: boolean;
  /** Called when the sheet requests to close. */
  onClose: () => void;
}

// ── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: {
  value: NonNullable<ProviderSearchFilters['sortBy']>;
  label: string;
}[] = [
  { value: 'rating', label: 'Top Rated' },
  { value: 'newest', label: 'Newest' },
];

// ── Component ───────────────────────────────────────────────────────────────

export function FiltersSheet({
  visible,
  onClose,
}: FiltersSheetProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;

  const storeFilters = useSearchStore((s) => s.filters);
  const setFilters = useSearchStore((s) => s.setFilters);
  const resetFilters = useSearchStore((s) => s.resetFilters);
  const fetchResults = useSearchStore((s) => s.fetchResults);

  // Local draft so changes don't apply until the user taps Apply.
  const [draft, setDraft] = useState<ProviderSearchFilters>({
    ...storeFilters,
  });

  // Sync local draft when the sheet opens.
  useEffect(() => {
    if (visible) {
      setDraft({ ...storeFilters });
    }
  }, [visible, storeFilters]);

  const handleApply = useCallback(() => {
    setFilters(draft);
    onClose();
    fetchResults();
  }, [draft, setFilters, onClose, fetchResults]);

  const handleReset = useCallback(() => {
    resetFilters();
    onClose();
    fetchResults();
  }, [resetFilters, onClose, fetchResults]);

  const chipBg = (active: boolean) =>
    active
      ? palette.deepIndigo
      : isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.05)';

  const chipText = (active: boolean) =>
    active ? palette.offWhite : palette.charcoal;

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={styles.scroll}
      >
        {/* ── Sort By ─────────────────────────────────────── */}
        <Text variant="label" color="midGray">
          Sort By
        </Text>
        <Spacer size="sm" />
        <View style={styles.chipRow}>
          {SORT_OPTIONS.map(({ value, label }) => {
            const active = (draft.sortBy ?? 'rating') === value;
            return (
              <Pressable
                key={value}
                onPress={() => setDraft((d) => ({ ...d, sortBy: value }))}
                style={[
                  styles.chip,
                  { backgroundColor: chipBg(active) },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Sort by ${label}`}
              >
                <Text variant="label" style={{ color: chipText(active) }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Spacer size="xl" />

        {/* ── Minimum Rating ──────────────────────────────── */}
        <Text variant="label" color="midGray">
          Minimum Rating
        </Text>
        <Spacer size="sm" />
        <View style={styles.ratingRow}>
          <Rating
            value={draft.minRating ?? 0}
            size="md"
            interactive
            onChange={(value) =>
              setDraft((d) => ({
                ...d,
                minRating: value === d.minRating ? undefined : value,
              }))
            }
            accessibilityLabel="Minimum rating filter"
          />
          {draft.minRating !== undefined && (
            <Text variant="body" color="charcoal" style={styles.ratingLabel}>
              {draft.minRating}+
            </Text>
          )}
        </View>

        <Spacer size="xl" />

        {/* ── Action Buttons ──────────────────────────────── */}
        <View style={styles.actions}>
          <Button
            label="Reset"
            variant="ghost"
            size="md"
            onPress={handleReset}
            style={styles.actionButton}
          />
          <Button
            label="Apply"
            variant="primary"
            size="md"
            onPress={handleApply}
            style={styles.actionButton}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

export default FiltersSheet;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 400,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.button,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ratingLabel: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
