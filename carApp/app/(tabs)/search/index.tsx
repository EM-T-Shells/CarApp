// Search home — landing screen for the Search tab. Shows a location
// search bar, a primary search button, and category quick-filter tiles
// (Detailing / Mechanical) that navigate to the filtered results list.

import React, { useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, Wrench } from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Card } from '../../../src/components/ui/Card';
import { Spacer } from '../../../src/components/ui/Spacer';
import { LocationSearchBar } from '../../../src/components/search/LocationSearchBar';
import { ProviderCarousel } from '../../../src/components/search/ProviderCarousel';
import { colors, spacing } from '../../../src/design/tokens';
import { useSearchStore } from '../../../src/state/search';
import type { ProviderSearchResult } from '../../../src/lib/supabase/queries';

export default function SearchScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const isLoading = useSearchStore((s) => s.isLoading);
  const setFilters = useSearchStore((s) => s.setFilters);
  const resetFilters = useSearchStore((s) => s.resetFilters);
  const fetchResults = useSearchStore((s) => s.fetchResults);

  const featuredDetailers = useSearchStore((s) => s.featuredDetailers);
  const featuredMechanics = useSearchStore((s) => s.featuredMechanics);
  const isLoadingFeatured = useSearchStore((s) => s.isLoadingFeatured);
  const fetchFeatured = useSearchStore((s) => s.fetchFeatured);

  // Load the discovery carousels once when the search home mounts.
  useEffect(() => {
    void fetchFeatured();
  }, [fetchFeatured]);

  const handleSearch = useCallback(async () => {
    resetFilters();
    await fetchResults();
    router.push('/search/results');
  }, [resetFilters, fetchResults, router]);

  const handleCategoryPress = useCallback(
    async (providerTypeName: string) => {
      setFilters({ providerTypeName });
      await fetchResults();
      router.push('/search/results');
    },
    [setFilters, fetchResults, router],
  );

  const handleProviderPress = useCallback(
    (provider: ProviderSearchResult) => {
      router.push(`/search/provider/${provider.id}`);
    },
    [router],
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="heading" color="charcoal">
          Find a Provider
        </Text>
        <Spacer size="xs" />
        <Text variant="body" color="midGray">
          Mobile detailers and mechanics near you
        </Text>

        <Spacer size="xl" />

        <LocationSearchBar
          onSubmit={handleSearch}
          placeholder="Enter your address or zip code"
          showSearchButton
          loading={isLoading}
        />

        <Spacer size="2xl" />

        <ProviderCarousel
          title="Top-rated detailers"
          providers={featuredDetailers}
          loading={isLoadingFeatured}
          onPressProvider={handleProviderPress}
          onSeeAll={() => handleCategoryPress('DETAILER')}
          emptyLabel="No detailers available yet"
        />

        <Spacer size="2xl" />

        <ProviderCarousel
          title="Top-rated mechanics"
          providers={featuredMechanics}
          loading={isLoadingFeatured}
          onPressProvider={handleProviderPress}
          onSeeAll={() => handleCategoryPress('MECHANIC')}
          emptyLabel="No mechanics available yet"
        />

        <Spacer size="2xl" />

        <Text variant="subheading" color="charcoal">
          Browse by Category
        </Text>
        <Spacer size="md" />

        <View style={styles.categoryRow}>
          <Card
            variant="elevated"
            onPress={() => handleCategoryPress('DETAILER')}
            style={styles.categoryCard}
            accessibilityLabel="Browse detailers"
            accessibilityHint="Shows detailing providers"
          >
            <View style={styles.categoryInner}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isDark
                      ? 'rgba(90,157,255,0.15)'
                      : 'rgba(26,109,255,0.1)',
                  },
                ]}
              >
                <Sparkles
                  size={28}
                  color={palette.electricBlue}
                  strokeWidth={1.8}
                />
              </View>
              <Spacer size="sm" />
              <Text variant="label" color="charcoal">
                Detailing
              </Text>
              <Text variant="caption" color="midGray">
                Interior & exterior
              </Text>
            </View>
          </Card>

          <Card
            variant="elevated"
            onPress={() => handleCategoryPress('MECHANIC')}
            style={styles.categoryCard}
            accessibilityLabel="Browse mechanics"
            accessibilityHint="Shows mechanical providers"
          >
            <View style={styles.categoryInner}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: isDark
                      ? 'rgba(52,217,138,0.15)'
                      : 'rgba(16,169,106,0.1)',
                  },
                ]}
              >
                <Wrench
                  size={28}
                  color={palette.emeraldGreen}
                  strokeWidth={1.8}
                />
              </View>
              <Spacer size="sm" />
              <Text variant="label" color="charcoal">
                Mechanical
              </Text>
              <Text variant="caption" color="midGray">
                Repairs & maintenance
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  categoryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  categoryCard: {
    flex: 1,
  },
  categoryInner: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
