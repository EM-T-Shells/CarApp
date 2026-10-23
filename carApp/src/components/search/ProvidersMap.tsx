// ProvidersMap — map view of provider search results. Drops a pin for every
// provider with known base coordinates and (when available) the customer's
// searched origin, then frames the camera to fit them all. Tapping a pin
// selects that provider and floats a ProviderCard preview over the bottom of
// the map; tapping the card opens the provider's profile, tapping the map
// background dismisses the preview.
//
// Renders on the same free OpenStreetMap basemap as LiveMap.tsx — no Google
// Maps API key required (per the MVP cost constraint in CLAUDE.md). This is
// the list⇄map toggle counterpart to the results FlatList.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import MapView, {
  Marker,
  UrlTile,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { Text } from '../ui/Text';
import { ProviderCard } from './ProviderCard';
import { colors, spacing } from '../../design/tokens';
import {
  regionForCoordinates,
  type LatLng,
  type MapRegion,
} from '../../lib/location';
import type { ProviderSearchResult } from '../../lib/supabase/queries';

// ─── Constants ─────────────────────────────────────────────────────────

// Free, no-key OSM raster tiles — same source as LiveMap.tsx. Fine for MVP
// volume; swap to a hosted tile provider before scale.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Fallback camera when nothing is mappable (no origin, no provider coords).
// Centers on the marketplace's home turf: the Northern Virginia / DC Metro area.
const DEFAULT_REGION: MapRegion = {
  latitude: 38.9586,
  longitude: -77.357,
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

// ─── Types ─────────────────────────────────────────────────────────────

export interface ProvidersMapProps {
  /** Provider results to plot. Those without base coordinates are skipped. */
  providers: ProviderSearchResult[];
  /** Customer's searched location, or null when searching "Anywhere". */
  origin: LatLng | null;
  /** Called when a selected provider's preview card is tapped. */
  onSelectProvider: (provider: ProviderSearchResult) => void;
}

/** A provider paired with its resolved map coordinates. */
interface MappableProvider {
  provider: ProviderSearchResult;
  coord: LatLng;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Keeps only providers with finite base coordinates, paired with their point. */
function toMappable(
  providers: ProviderSearchResult[],
): MappableProvider[] {
  const out: MappableProvider[] = [];
  for (const provider of providers) {
    if (provider.base_lat == null || provider.base_lng == null) continue;
    const latitude = Number(provider.base_lat);
    const longitude = Number(provider.base_lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    out.push({ provider, coord: { latitude, longitude } });
  }
  return out;
}

// ─── Component ─────────────────────────────────────────────────────────

export function ProvidersMap({
  providers,
  origin,
  onSelectProvider,
}: ProvidersMapProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const mapRef = useRef<MapView | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappable = useMemo(() => toMappable(providers), [providers]);

  // Frame every pin plus the origin; fall back to the marketplace region when
  // there is nothing to fit.
  const initialRegion = useMemo(() => {
    const points = mappable.map((m) => m.coord);
    if (origin) points.push(origin);
    return regionForCoordinates(points) ?? DEFAULT_REGION;
  }, [mappable, origin]);

  // Re-fit the camera whenever the plotted set changes (e.g. after filtering).
  useEffect(() => {
    if (!mapRef.current) return;
    const points = mappable.map((m) => m.coord);
    if (origin) points.push(origin);
    const next = regionForCoordinates(points);
    if (next) mapRef.current.animateToRegion(next, 500);
    // Drop a stale selection that is no longer in the results.
    setSelectedId((id) =>
      id && mappable.some((m) => m.provider.id === id) ? id : null,
    );
  }, [mappable, origin]);

  const selected = useMemo(
    () => mappable.find((m) => m.provider.id === selectedId) ?? null,
    [mappable, selectedId],
  );

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsCompass
        showsUserLocation={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        mapType="none"
        onPress={() => setSelectedId(null)}
      >
        {/* OSM raster tile overlay — no API key required. */}
        <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} />

        {/* Customer's searched location. */}
        {origin && (
          <Marker
            coordinate={origin}
            title="Your search area"
            pinColor={palette.emeraldGreen}
            accessibilityLabel="Your search location"
          />
        )}

        {/* One pin per mappable provider. */}
        {mappable.map(({ provider, coord }) => {
          const name = provider.users?.full_name ?? 'Provider';
          const isSelected = provider.id === selectedId;
          return (
            <Marker
              key={provider.id}
              coordinate={coord}
              title={name}
              description={provider.provider_types?.label ?? undefined}
              pinColor={isSelected ? palette.electricBlue : palette.deepIndigo}
              onPress={() => setSelectedId(provider.id)}
              accessibilityLabel={`${name} on map`}
            />
          );
        })}
      </MapView>

      {/* Empty state — the map still renders so the customer keeps context. */}
      {mappable.length === 0 && (
        <View pointerEvents="none" style={styles.emptyBadge}>
          <Text variant="caption" color="midGray">
            No providers to map in this area
          </Text>
        </View>
      )}

      {/* Floating preview for the tapped pin — tap to open the profile. */}
      {selected && (
        <View style={styles.preview}>
          <ProviderCard
            provider={selected.provider}
            onPress={() => onSelectProvider(selected.provider)}
          />
        </View>
      )}
    </View>
  );
}

export default ProvidersMap;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  emptyBadge: {
    position: 'absolute',
    top: spacing.base,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  preview: {
    position: 'absolute',
    left: spacing.base,
    right: spacing.base,
    // Sit above the floating Map/List toggle (results screen, bottom: xl + a
    // ~44pt pill) so the two controls don't overlap.
    bottom: spacing['5xl'] + spacing.md,
  },
});
