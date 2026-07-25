// ProvidersMap.test.tsx — unit tests for the search results map view. Covers
// which providers get a pin (only those with base coordinates), the origin
// pin, and the tap-a-pin → preview card → select flow. react-native-maps,
// ProviderCard, and the icons are mocked so only ProvidersMap's own wiring is
// under test.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Render each map primitive as an inspectable View/Pressable. Markers forward
// their onPress and accessibilityLabel so a test can "tap" a pin.
jest.mock('react-native-maps', () => {
  const RN = require('react-native');
  const ReactLib = require('react');
  const { View, Pressable } = RN;
  // Mirror the real MapView ref API (animateToRegion) so the fit-camera effect
  // in ProvidersMap can call it without throwing.
  const MapView = ReactLib.forwardRef(
    ({ children, ...rest }: Record<string, unknown>, ref: unknown) => {
      ReactLib.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn() }));
      return (
        <View testID="map-view" {...rest}>
          {children as React.ReactNode}
        </View>
      );
    },
  );
  const Marker = ({
    onPress,
    accessibilityLabel,
    pinColor,
  }: Record<string, unknown>) => (
    <Pressable
      accessibilityLabel={accessibilityLabel as string}
      onPress={onPress as () => void}
      // Surface the pin colour so a test can assert selection styling.
      testID={`marker-${accessibilityLabel as string}`}
    >
      {String(pinColor)}
    </Pressable>
  );
  const UrlTile = () => null;
  return {
    __esModule: true,
    default: MapView,
    Marker,
    UrlTile,
    PROVIDER_DEFAULT: 'default',
  };
});

// Preview card — stub to a pressable that reports the provider it was given.
const mockCardPress = jest.fn();
jest.mock('../ProviderCard', () => {
  const { Pressable, Text } = require('react-native');
  return {
    ProviderCard: ({
      provider,
      onPress,
    }: {
      provider: { id: string; users?: { full_name?: string } };
      onPress: () => void;
    }) => (
      <Pressable testID="preview-card" onPress={onPress}>
        <Text>{provider.users?.full_name ?? provider.id}</Text>
      </Pressable>
    ),
  };
});

import { ProvidersMap } from '../ProvidersMap';
import type { ProviderSearchResult } from '../../../lib/supabase/queries';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeProvider(
  id: string,
  name: string,
  base_lat: number | null,
  base_lng: number | null,
): ProviderSearchResult {
  return {
    id,
    base_lat,
    base_lng,
    users: { id: `u-${id}`, full_name: name, avatar_url: null },
    provider_types: { id: 'pt', name: 'DETAILER', label: 'Detailer' },
  } as unknown as ProviderSearchResult;
}

const RESTON = { latitude: 38.9586, longitude: -77.357 };

const withCoords = makeProvider('p1', 'Marcus Reyes', 38.96, -77.35);
const alsoCoords = makeProvider('p2', 'Priya Patel', 38.9, -77.2);
const noCoords = makeProvider('p3', 'Emre', null, null);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProvidersMap', () => {
  it('drops a pin only for providers with base coordinates', () => {
    render(
      <ProvidersMap
        providers={[withCoords, alsoCoords, noCoords]}
        origin={null}
        onSelectProvider={mockCardPress}
      />,
    );

    expect(screen.getByLabelText('Marcus Reyes on map')).toBeTruthy();
    expect(screen.getByLabelText('Priya Patel on map')).toBeTruthy();
    // The coordinate-less provider is skipped.
    expect(screen.queryByLabelText('Emre on map')).toBeNull();
  });

  it('adds an origin pin when a search location is provided', () => {
    render(
      <ProvidersMap
        providers={[withCoords]}
        origin={RESTON}
        onSelectProvider={mockCardPress}
      />,
    );
    expect(screen.getByLabelText('Your search location')).toBeTruthy();
  });

  it('shows an empty badge when nothing is mappable', () => {
    render(
      <ProvidersMap
        providers={[noCoords]}
        origin={null}
        onSelectProvider={mockCardPress}
      />,
    );
    expect(screen.getByText('No providers to map in this area')).toBeTruthy();
  });

  it('tapping a pin reveals its preview card; tapping the card selects it', () => {
    render(
      <ProvidersMap
        providers={[withCoords, alsoCoords]}
        origin={null}
        onSelectProvider={mockCardPress}
      />,
    );

    // No preview until a pin is tapped.
    expect(screen.queryByTestId('preview-card')).toBeNull();

    fireEvent.press(screen.getByLabelText('Marcus Reyes on map'));
    const card = screen.getByTestId('preview-card');
    expect(card).toBeTruthy();
    expect(screen.getByText('Marcus Reyes')).toBeTruthy();

    fireEvent.press(card);
    expect(mockCardPress).toHaveBeenCalledTimes(1);
    expect(mockCardPress).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
    );
  });
});
