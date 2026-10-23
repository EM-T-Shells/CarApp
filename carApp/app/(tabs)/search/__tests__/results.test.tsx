// results.test.tsx — unit tests for the search results screen, focused on the
// list ⇄ map toggle (the Turo-style floating pill). The search store,
// expo-router, the map, and the heavy child components are mocked so only the
// screen's own view-mode wiring is under test.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return <View testID={`icon-${name}`} {...props} />;
    };
  return {
    SlidersHorizontal: icon('SlidersHorizontal'),
    MapPin: icon('MapPin'),
    Map: icon('Map'),
    List: icon('List'),
  };
});

// Map view — stub that records the props it was mounted with.
let lastMapProps: Record<string, unknown> | null = null;
jest.mock('../../../../src/components/search/ProvidersMap', () => {
  const { Text } = require('react-native');
  return {
    ProvidersMap: (props: Record<string, unknown>) => {
      lastMapProps = props;
      return <Text testID="providers-map">MAP</Text>;
    },
  };
});

jest.mock('../../../../src/components/search/ProviderCard', () => {
  const { Text } = require('react-native');
  return {
    ProviderCard: ({
      provider,
    }: {
      provider: { id: string; users?: { full_name?: string } };
    }) => <Text testID={`card-${provider.id}`}>{provider.users?.full_name}</Text>,
  };
});

jest.mock('../../../../src/components/search/FiltersSheet', () => ({
  FiltersSheet: () => null,
}));
jest.mock('../../../../src/components/search/SearchOverlay', () => ({
  SearchOverlay: () => null,
}));

// Controllable store state shared across selector calls.
const mockFetchResults = jest.fn();

interface MockState {
  results: unknown[];
  isLoading: boolean;
  error: Error | null;
  locationQuery: string;
  origin: { latitude: number; longitude: number } | null;
  fetchResults: typeof mockFetchResults;
}

let mockStoreState: MockState;

jest.mock('../../../../src/state/search', () => ({
  useSearchStore: (selector: (s: MockState) => unknown) => selector(mockStoreState),
  selectActiveFilterCount: () => 0,
}));

import ResultsScreen from '../results';

const providers = [
  { id: 'p1', base_lat: 38.96, base_lng: -77.35, users: { full_name: 'Marcus Reyes' } },
  { id: 'p2', base_lat: 38.9, base_lng: -77.2, users: { full_name: 'Priya Patel' } },
];

beforeEach(() => {
  jest.clearAllMocks();
  lastMapProps = null;
  mockStoreState = {
    results: providers,
    isLoading: false,
    error: null,
    locationQuery: 'Reston, VA',
    origin: { latitude: 38.9586, longitude: -77.357 },
    fetchResults: mockFetchResults,
  };
});

describe('ResultsScreen — list/map toggle', () => {
  it('starts in list mode showing provider cards and a "Map" pill', () => {
    render(<ResultsScreen />);

    expect(screen.getByTestId('card-p1')).toBeTruthy();
    expect(screen.getByTestId('card-p2')).toBeTruthy();
    expect(screen.queryByTestId('providers-map')).toBeNull();
    // The floating pill offers the map.
    expect(screen.getByText('Map')).toBeTruthy();
  });

  it('flips to the map (and passes results + origin) when the pill is tapped', () => {
    render(<ResultsScreen />);

    fireEvent.press(screen.getByText('Map'));

    expect(screen.getByTestId('providers-map')).toBeTruthy();
    expect(screen.queryByTestId('card-p1')).toBeNull();
    // Now the pill offers the list back.
    expect(screen.getByText('List')).toBeTruthy();

    // The map received the current results and searched origin.
    expect(lastMapProps?.providers).toEqual(providers);
    expect(lastMapProps?.origin).toEqual({ latitude: 38.9586, longitude: -77.357 });
  });

  it('flips back to the list on a second tap', () => {
    render(<ResultsScreen />);

    fireEvent.press(screen.getByText('Map'));
    fireEvent.press(screen.getByText('List'));

    expect(screen.getByTestId('card-p1')).toBeTruthy();
    expect(screen.queryByTestId('providers-map')).toBeNull();
  });

  it('hides the toggle pill when there are no results', () => {
    mockStoreState.results = [];
    render(<ResultsScreen />);

    expect(screen.queryByText('Map')).toBeNull();
    expect(screen.getByText('No providers found')).toBeTruthy();
  });
});
