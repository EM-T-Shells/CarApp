// LiveMap — renders the provider's live position and the customer's
// service address on a free OpenStreetMap basemap. Uses `react-native-maps`
// with a UrlTile pointing at OSM tiles so we don't depend on a Google Maps
// API key (per the MVP cost constraint in CLAUDE.md / Blueprint).
//
// react-native-maps is approved in Blueprint/dependencies_list but not yet
// installed (External). Once `expo install react-native-maps` is run on
// your dev client, this file just works — no API key required for OSM.
//
// Auto-fits the camera to a region that contains both pins. When the
// provider position is not yet known, the map centers on the destination
// only so the customer at least sees where the work will happen.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import MapView, {
  Marker,
  UrlTile,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { colors } from '../../design/tokens';
import { regionForPoints, type LatLng } from '../../lib/location';

// ─── Constants ─────────────────────────────────────────────────────────

// Free, no-key OSM raster tiles. The OSM tile-usage policy is fine for
// development and low-volume MVP traffic; before scale, swap to a hosted
// provider (MapTiler, Stadia, etc.) or self-host.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const DEFAULT_REGION_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

// ─── Types ─────────────────────────────────────────────────────────────

export interface LiveMapProps {
  /** Customer's service address coordinates. */
  destination: LatLng;
  /** Provider's last known GPS position; null until first ping arrives. */
  providerPosition: LatLng | null;
}

// ─── Component ─────────────────────────────────────────────────────────

export function LiveMap({
  destination,
  providerPosition,
}: LiveMapProps): React.ReactElement {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const palette = isDark ? colors.dark : colors.light;
  const mapRef = useRef<MapView | null>(null);

  const initialRegion = useMemo(() => {
    if (providerPosition) {
      return regionForPoints(providerPosition, destination);
    }
    return {
      latitude: destination.latitude,
      longitude: destination.longitude,
      ...DEFAULT_REGION_DELTA,
    };
  }, [destination, providerPosition]);

  // Animate the camera to refit both points whenever the provider moves.
  useEffect(() => {
    if (!providerPosition || !mapRef.current) return;
    const next = regionForPoints(providerPosition, destination);
    mapRef.current.animateToRegion(next, 800);
  }, [
    providerPosition?.latitude,
    providerPosition?.longitude,
    destination.latitude,
    destination.longitude,
  ]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsCompass
        showsScale
        showsUserLocation={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        mapType="none"
      >
        {/* OSM raster tile overlay — no API key required. */}
        <UrlTile
          urlTemplate={OSM_TILE_URL}
          maximumZ={19}
          flipY={false}
        />

        {/* Service address pin */}
        <Marker
          coordinate={destination}
          title="Service location"
          pinColor={palette.deepIndigo}
          accessibilityLabel="Service location pin"
        />

        {/* Provider live pin */}
        {providerPosition && (
          <Marker
            coordinate={providerPosition}
            title="Provider"
            pinColor={palette.electricBlue}
            accessibilityLabel="Provider's current position"
          />
        )}
      </MapView>
    </View>
  );
}

export default LiveMap;

// ─── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
});
