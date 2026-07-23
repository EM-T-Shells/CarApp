// location.test.tsx — unit tests for the location picker screen. Covers the
// static quick options (Current location / Anywhere), popular-area selection,
// the free-text search row, recents, and the current-location GPS flow with
// permission handling. The search store, expo-router, and expo-location are
// mocked; the picker's own wiring is under test.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

const mockRequestPermission = jest.fn();
const mockGetPosition = jest.fn();
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...a: unknown[]) => mockRequestPermission(...a),
  getCurrentPositionAsync: (...a: unknown[]) => mockGetPosition(...a),
}));

// Controllable store state shared across selector calls.
const mockApplySelection = jest.fn();
const mockAddRecent = jest.fn();
const mockClearRecent = jest.fn();
const mockFetchResults = jest.fn();

interface MockState {
  locationQuery: string;
  recentLocations: { label: string; coords: unknown }[];
  applyLocationSelection: typeof mockApplySelection;
  addRecentLocation: typeof mockAddRecent;
  clearRecentLocations: typeof mockClearRecent;
  fetchResults: typeof mockFetchResults;
}

let mockStoreState: MockState;

jest.mock('../../../../src/state/search', () => ({
  useSearchStore: (selector: (s: MockState) => unknown) => selector(mockStoreState),
}));

// Keep the LocationSearchBar simple — it has its own tests.
jest.mock('../../../../src/components/search/LocationSearchBar', () => {
  const { Text } = require('react-native');
  return {
    LocationSearchBar: ({ placeholder }: { placeholder: string }) => (
      <Text>{placeholder}</Text>
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
    Navigation: icon('Navigation'),
    Globe: icon('Globe'),
    Clock: icon('Clock'),
    Building2: icon('Building2'),
    Search: icon('Search'),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

import LocationPickerScreen from '../location';

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreState = {
    locationQuery: '',
    recentLocations: [],
    applyLocationSelection: mockApplySelection,
    addRecentLocation: mockAddRecent,
    clearRecentLocations: mockClearRecent,
    fetchResults: mockFetchResults,
  };
});

describe('LocationPickerScreen', () => {
  it('renders the quick options and popular areas by default', () => {
    render(<LocationPickerScreen />);
    expect(screen.getByText('Current location')).toBeTruthy();
    expect(screen.getByText('Anywhere')).toBeTruthy();
    expect(screen.getByText('Reston, VA')).toBeTruthy();
    expect(screen.getByText('POPULAR AREAS')).toBeTruthy();
  });

  it('applies a popular area, remembers it, and jumps to results', async () => {
    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Reston, VA'));

    expect(mockApplySelection).toHaveBeenCalledWith('Reston, VA', {
      latitude: 38.9586,
      longitude: -77.357,
    });
    expect(mockAddRecent).toHaveBeenCalledWith({
      label: 'Reston, VA',
      coords: { latitude: 38.9586, longitude: -77.357 },
    });
    expect(mockFetchResults).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/search/results');
  });

  it('models Anywhere as an empty selection that is not remembered', () => {
    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Anywhere'));

    expect(mockApplySelection).toHaveBeenCalledWith('', null);
    expect(mockAddRecent).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/search/results');
  });

  it('shows a free-text search row and filters areas when a query is present', () => {
    mockStoreState.locationQuery = 'Ashburn';
    render(<LocationPickerScreen />);

    expect(screen.getByText('Search "Ashburn"')).toBeTruthy();
    expect(screen.getByText('Ashburn, VA')).toBeTruthy();
    expect(screen.queryByText('Reston, VA')).toBeNull();
  });

  it('applies free text with no coords so results geocode it', () => {
    mockStoreState.locationQuery = '22102';
    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Search "22102"'));

    expect(mockApplySelection).toHaveBeenCalledWith('22102', null);
    expect(mockAddRecent).toHaveBeenCalledWith({ label: '22102', coords: null });
  });

  it('renders recents when idle and clears them on request', () => {
    mockStoreState.recentLocations = [{ label: 'Baltimore, MD', coords: null }];
    render(<LocationPickerScreen />);

    expect(screen.getByText('RECENT')).toBeTruthy();
    expect(screen.getByText('Baltimore, MD')).toBeTruthy();

    fireEvent.press(screen.getByText('Clear'));
    expect(mockClearRecent).toHaveBeenCalled();
  });

  it('uses the device GPS when permission is granted', async () => {
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockGetPosition.mockResolvedValue({
      coords: { latitude: 38.9, longitude: -77.2 },
    });

    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Current location'));

    await waitFor(() => {
      expect(mockApplySelection).toHaveBeenCalledWith(
        'Current location',
        { latitude: 38.9, longitude: -77.2 },
      );
    });
    // Transient GPS fix is not stored as a recent.
    expect(mockAddRecent).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/search/results');
  });

  it('surfaces an inline error when location permission is denied', async () => {
    mockRequestPermission.mockResolvedValue({ granted: false });

    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Current location'));

    await waitFor(() => {
      expect(
        screen.getByText('Location permission is off. Enable it in Settings.'),
      ).toBeTruthy();
    });
    expect(mockGetPosition).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cancels back to the previous screen', () => {
    render(<LocationPickerScreen />);
    fireEvent.press(screen.getByText('Cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});
