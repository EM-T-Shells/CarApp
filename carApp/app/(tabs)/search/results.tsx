// Search results — filtered provider list. Renders ProviderCard tiles
// in a FlatList with a collapsed search pill, filter bar, and FiltersSheet
// drawer. The search pill reopens the SearchOverlay (Where / When) so the
// customer can refine location and date without leaving the list. Handles
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SlidersHorizontal, MapPin } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Button } from '../../../src/components/ui/Button';
import { Spacer } from '../../../src/components/ui/Spacer';
import { ProviderCard } from '../../../src/components/search/ProviderCard';
import { FiltersSheet } from '../../../src/components/search/FiltersSheet';
import { SearchOverlay } from '../../../src/components/search/SearchOverlay';
import { colors, spacing, borderRadius } from '../../../src/design/tokens';
import { formatDate } from '../../../src/utils/date';
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
  const { openSearch } = useLocalSearchParams<{ openSearch?: string }>();

  const results = useSearchStore((s) => s.results);
  const isLoading = useSearchStore((s) => s.isLoading);
  const error = useSearchStore((s) => s.error);
  const locationQuery = useSearchStore((s) => s.locationQuery);
  const fetchResults = useSearchStore((s) => s.fetchResults);
  const activeFilterCount = useSearchStore(selectActiveFilterCount);

  const [filtersVisible, setFiltersVisible] = useState(false);
  // Open the refine overlay automatically when arriving from "Current location".
  const [overlayVisible, setOverlayVisible] = useState(() => openSearch === '1');
  const [serviceDate, setServiceDate] = useState<Date | null>(null);

  // Consume the openSearch flag: open the overlay and strip the param so it
  // does not linger and re-trigger on later re-renders. Also covers the case
  // where the results screen was already mounted when the flag arrives.
  useEffect(() => {
    if (openSearch === '1') {
      setOverlayVisible(true);
      router.setParams({ openSearch: '' });
    }
  }, [openSearch, router]);

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

  const handleOverlaySubmit = useCallback(() => {
    setOverlayVisible(false);
    fetchResults();
  }, [fetchResults]);

  const renderItem = useCallback(
    ({ item }: { item: ProviderSearchResult }) => (
      <ProviderCard provider={item} onPress={() => handleProviderPress(item)} />
    ),
    [handleProviderPress],
  );

  const keyExtractor = useCallback(
    (item: ProviderSearchResult) => item.id,
    [],
  );

  // Collapsed search summary — location + date, tappable to reopen the overlay.
  const locationLabel = locationQuery.trim() || 'Anywhere';
  const dateLabel = serviceDate
    ? formatDate(serviceDate.toISOString())
    : 'Add dates';

  const searchPill = (
    <Pressable
      onPress={() => setOverlayVisible(true)}
      style={[
        styles.pill,
        {
          backgroundColor: isDark
            ? 'rgba(255,255,255,0.08)'
            : 'rgba(0,0,0,0.05)',
        },
      ]}
      accessibilityRole="search"
      accessibilityLabel={`Search: ${locationLabel}, ${dateLabel}`}
      accessibilityHint="Reopens the search panel"
    >
      <MapPin
        size={18}
        color={palette.electricBlue}
        strokeWidth={2}
        style={styles.pillIcon}
      />
      <View style={styles.pillText}>
        <Text variant="label" color="charcoal" numberOfLines={1}>
          {locationLabel}
        </Text>
        <Text variant="caption" color="midGray" numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
    </Pressable>
  );

  const overlay = (
    <SearchOverlay
      visible={overlayVisible}
      onClose={() => setOverlayVisible(false)}
      onSubmit={handleOverlaySubmit}
      serviceDate={serviceDate}
      onChangeDate={setServiceDate}
    />
  );

  // Body varies by state, but the SafeAreaView root, search pill, and overlay
  // stay mounted across every state — a stable root keeps the overlay's Modal
  // from being torn down (and reset) when loading transitions to results.
  let body: React.ReactElement;
  if (isLoading) {
    body = (
      <View style={styles.centeredBody}>
        <ActivityIndicator size="large" color={palette.electricBlue} />
        <Spacer size="md" />
        <Text variant="body" color="midGray">
          Finding providers...
        </Text>
      </View>
    );
  } else if (error) {
    body = (
      <View style={styles.centeredBody}>
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
  } else if (results.length === 0) {
    body = (
      <View style={styles.centeredBody}>
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
      </View>
    );
  } else {
    body = (
      <>
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
                  activeFilterCount > 0
                    ? palette.electricBlue
                    : palette.midGray,
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
      </>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      {searchPill}
      {body}

      <FiltersSheet
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
      />
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  emptyText: {
    textAlign: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.button,
    minHeight: 48,
  },
  pillIcon: {
    marginRight: spacing.sm,
  },
  pillText: {
    flex: 1,
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
