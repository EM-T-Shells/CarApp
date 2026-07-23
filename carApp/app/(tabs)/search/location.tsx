// Location picker — the full-screen overlay shown when the customer taps the
// search field on the search home. Offers quick ways to set a search location:
// use the device GPS ("Current location"), browse everywhere ("Anywhere"),
// re-run a recent search, or pick a popular Northern Virginia / DC area. As the
// customer types, the popular-area list filters live and a free-text
// "Search for …" row appears. Selecting any option seeds the search store and
// jumps to the results list.

import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  Navigation,
  Globe,
  Clock,
  Building2,
  Search as SearchIcon,
} from 'lucide-react-native';
import { Text } from '../../../src/components/ui/Text';
import { Spacer } from '../../../src/components/ui/Spacer';
import { LocationSearchBar } from '../../../src/components/search/LocationSearchBar';
import { LocationSuggestionRow } from '../../../src/components/search/LocationSuggestionRow';
import { colors, spacing } from '../../../src/design/tokens';
import { useSearchStore } from '../../../src/state/search';
import { filterPopularAreas } from '../../../src/lib/location/popularAreas';
import type { LatLng } from '../../../src/lib/location';

export default function LocationPickerScreen(): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const router = useRouter();

  const locationQuery = useSearchStore((s) => s.locationQuery);
  const recentLocations = useSearchStore((s) => s.recentLocations);
  const applyLocationSelection = useSearchStore((s) => s.applyLocationSelection);
  const addRecentLocation = useSearchStore((s) => s.addRecentLocation);
  const clearRecentLocations = useSearchStore((s) => s.clearRecentLocations);
  const fetchResults = useSearchStore((s) => s.fetchResults);

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const query = locationQuery.trim();
  const areas = filterPopularAreas(query);

  // Apply a selection, remember it (when meaningful), run the search, and hand
  // off to the results list — replacing the picker so Back returns to home.
  const goToResults = useCallback(
    async (
      label: string,
      coords: LatLng | null,
      { remember }: { remember: boolean } = { remember: true },
    ) => {
      applyLocationSelection(label, coords);
      if (remember && label) addRecentLocation({ label, coords });
      void fetchResults();
      router.replace('/search/results');
    },
    [applyLocationSelection, addRecentLocation, fetchResults, router],
  );

  const handleCurrentLocation = useCallback(async () => {
    setLocationError(null);
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Location permission is off. Enable it in Settings.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await goToResults(
        'Current location',
        { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        { remember: false },
      );
    } catch {
      setLocationError("Couldn't get your location. Try again.");
    } finally {
      setLocating(false);
    }
  }, [goToResults]);

  const handleAnywhere = useCallback(() => {
    // Empty label + no origin → distance-agnostic browse of every provider.
    void goToResults('', null, { remember: false });
  }, [goToResults]);

  const handleFreeText = useCallback(() => {
    // Coords resolved by fetchResults' geocode step.
    void goToResults(query, null);
  }, [goToResults, query]);

  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const showRecents = query.length === 0 && recentLocations.length > 0;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.offWhite }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <LocationSearchBar
            placeholder="City, address, or zip code"
            autoFocus
            onSubmit={query ? handleFreeText : undefined}
          />
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.cancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel location search"
        >
          <Text variant="body" color="electricBlue">
            Cancel
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Free-text search shortcut — only when the customer has typed. */}
        {query.length > 0 && (
          <LocationSuggestionRow
            icon={SearchIcon}
            title={`Search "${query}"`}
            iconColor={palette.electricBlue}
            onPress={handleFreeText}
            accessibilityLabel={`Search for ${query}`}
          />
        )}

        <LocationSuggestionRow
          icon={Navigation}
          title="Current location"
          subtitle="Find providers near you"
          iconColor={palette.electricBlue}
          loading={locating}
          onPress={handleCurrentLocation}
          accessibilityLabel="Use current location"
          accessibilityHint="Finds providers near your device location"
        />
        {locationError ? (
          <Text variant="caption" color="midGray" style={styles.errorText}>
            {locationError}
          </Text>
        ) : null}

        <LocationSuggestionRow
          icon={Globe}
          title="Anywhere"
          subtitle="Browse all providers"
          iconColor={palette.emeraldGreen}
          onPress={handleAnywhere}
          accessibilityLabel="Browse providers anywhere"
        />

        {showRecents && (
          <>
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />
            <View style={styles.sectionHeader}>
              <Text variant="caption" color="midGray">
                RECENT
              </Text>
              <Pressable
                onPress={clearRecentLocations}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear recent locations"
              >
                <Text variant="caption" color="electricBlue">
                  Clear
                </Text>
              </Pressable>
            </View>
            {recentLocations.map((r) => (
              <LocationSuggestionRow
                key={`recent:${r.label}`}
                icon={Clock}
                title={r.label}
                onPress={() => goToResults(r.label, r.coords)}
                accessibilityLabel={`Search ${r.label}`}
              />
            ))}
          </>
        )}

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        <View style={styles.sectionHeader}>
          <Text variant="caption" color="midGray">
            POPULAR AREAS
          </Text>
        </View>

        {areas.length > 0 ? (
          areas.map((a) => (
            <LocationSuggestionRow
              key={a.label}
              icon={Building2}
              title={a.label}
              onPress={() => goToResults(a.label, a.coords)}
              accessibilityLabel={`Search ${a.label}`}
            />
          ))
        ) : (
          <Text variant="body" color="midGray" style={styles.emptyAreas}>
            No matching areas. Try "{query}" as a full search above.
          </Text>
        )}

        <Spacer size="3xl" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
  },
  cancel: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  content: {
    paddingHorizontal: spacing.base,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  errorText: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
  },
  emptyAreas: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
});
