// Search results — filtered provider list. Renders ProviderCard tiles
// in a FlatList with a filter bar and FiltersSheet drawer. Handles
// loading, empty, and error states per project conventions.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Spacer } from '../../../src/components/ui/Spacer';
import { ProviderCard } from '../../../src/components/search/ProviderCard';
import { FiltersSheet } from '../../../src/components/search/FiltersSheet';
import { colors, spacing } from '../../../src/design/tokens';
import {
  useSearchStore,
  selectActiveFilterCount,
} from '../../../src/state/search';
import type { ProviderSearchResult } from '../../../src/lib/supabase/queries';

export default function ResultsScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const results = useSearchStore((s) => s.results);
  const isLoading = useSearchStore((s) => s.isLoading);
  const error = useSearchStore((s) => s.error);
  const fetchResults = useSearchStore((s) => s.fetchResults);
  const activeFilterCount = useSearchStore(selectActiveFilterCount);

  const [filtersVisible, setFiltersVisible] = useState(false);

  // Fetch on mount if results are empty (e.g. deep link or refresh).
  useEffect(() => {
    if (results.length === 0 && !isLoading && !error) {
      fetchResults();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderPress = useCallback(
    (provider: ProviderSearchResult) => {
      router.push(`/search/provider/${provider.id}`);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProviderSearchResult }) => (
      <ProviderCard
        provider={item}
        onPress={() => handleProviderPress(item)}
      />
    ),
    [handleProviderPress],
  );

  const keyExtractor = useCallback(
    (item: ProviderSearchResult) => item.id,
    [],
  );

  // ── Loading ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
        <Spacer size="md" />
        <Text variant="body" color="midGray">
          Finding providers...
        </Text>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="subheading" color="charcoal">
          Something went wrong
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray">
          {error.message}
        </Text>
        <Spacer size="lg" />
        <Button
          label="Retry"
          variant="primary"
          size="md"
          onPress={fetchResults}
        />
      </View>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────
  if (results.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: palette.offWhite }]}>
        <Text variant="subheading" color="charcoal">
          No providers found
        </Text>
        <Spacer size="sm" />
        <Text variant="body" color="midGray" style={styles.emptyText}>
          Try adjusting your filters or searching in a different area
        </Text>
        <Spacer size="lg" />
        <Button
          label="Adjust Filters"
          variant="secondary"
          size="md"
          onPress={() => setFiltersVisible(true)}
        />

        <FiltersSheet
          visible={filtersVisible}
          onClose={() => setFiltersVisible(false)}
        />
      </View>
    );
  }

  // ── Results list ───────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: palette.offWhite }]}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <Text variant="body" color="midGray">
          {results.length} {results.length === 1 ? 'provider' : 'providers'}
        </Text>
        <Pressable
          onPress={() => setFiltersVisible(true)}
          style={[
            styles.filterButton,
            {
              backgroundColor: isDark
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(0,0,0,0.05)',
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
        >
          <SlidersHorizontal
            size={16}
            color={
              activeFilterCount > 0 ? palette.electricBlue : palette.midGray
            }
            strokeWidth={2}
          />
          <Text
            variant="label"
            style={{
              color:
                activeFilterCount > 0 ? palette.electricBlue : palette.midGray,
            }}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <Spacer size="md" />}
        showsVerticalScrollIndicator={false}
      />

      <FiltersSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  emptyText: {
    textAlign: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    minHeight: 44,
  },
  listContent: {
    padding: spacing.base,
    paddingTop: spacing.sm,
  },
});
