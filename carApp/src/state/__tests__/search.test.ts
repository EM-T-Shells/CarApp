// search.test.ts — unit tests for the search store's distance annotation,
// distance sorting, origin geocoding, and filter selectors. searchProviders
// and geocodeAddress are mocked; the Haversine math (distanceMiles) is real.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../../lib/supabase/queries', () => ({
  searchProviders: jest.fn(),
}));

jest.mock('../../lib/location', () => {
  const actual = jest.requireActual('../../lib/location');
  return { __esModule: true, ...actual, geocodeAddress: jest.fn() };
});

import {
  useSearchStore,
  selectActiveFilterCount,
  selectHasActiveFilters,
} from '../search';
import { searchProviders } from '../../lib/supabase/queries';
import { geocodeAddress } from '../../lib/location';
import type { ProviderSearchResult } from '../../lib/supabase/queries';

const mockSearch = searchProviders as jest.MockedFunction<typeof searchProviders>;
const mockGeocode = geocodeAddress as jest.MockedFunction<typeof geocodeAddress>;

// ── Fixtures ──────────────────────────────────────────────────────────

// Customer origin (Tysons); Reston is nearer than Alexandria.
const TYSONS = { latitude: 38.9187, longitude: -77.2311 };

const makeProvider = (
  id: string,
  base_lat: number | null,
  base_lng: number | null,
): ProviderSearchResult =>
  ({
    id,
    base_lat,
    base_lng,
    avg_gear_rating: 4.5,
    users: null,
    provider_types: null,
  }) as unknown as ProviderSearchResult;

const RESTON = makeProvider('reston', 38.953282, -77.3464516); // ~6 mi
const ALEXANDRIA = makeProvider('alexandria', 38.8051095, -77.0470229); // ~14 mi
const NO_COORDS = makeProvider('unknown', null, null);

const resetStore = () => useSearchStore.getState().reset();

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
  mockSearch.mockResolvedValue({
    data: [ALEXANDRIA, RESTON, NO_COORDS],
    error: null,
  });
  mockGeocode.mockResolvedValue(TYSONS);
});

describe('defaults', () => {
  it('defaults sortBy to distance', () => {
    expect(useSearchStore.getState().filters.sortBy).toBe('distance');
    expect(useSearchStore.getState().origin).toBeNull();
  });
});

describe('fetchResults — distance annotation & sorting', () => {
  it('geocodes the location query once and stores the origin', async () => {
    useSearchStore.getState().setLocationQuery('22102');
    await useSearchStore.getState().fetchResults();

    expect(mockGeocode).toHaveBeenCalledTimes(1);
    expect(mockGeocode).toHaveBeenCalledWith('22102');
    expect(useSearchStore.getState().origin).toEqual(TYSONS);
  });

  it('sorts nearest first and sinks providers without coordinates', async () => {
    useSearchStore.getState().setLocationQuery('22102');
    await useSearchStore.getState().fetchResults();

    const results = useSearchStore.getState().results;
    expect(results.map((r) => r.id)).toEqual(['reston', 'alexandria', 'unknown']);
    // Nearer provider has the smaller mileage; unknown coords → null.
    expect(results[0].distance_miles).toBeLessThan(results[1].distance_miles!);
    expect(results[2].distance_miles).toBeNull();
  });

  it('does not re-geocode on a second fetch with the same query', async () => {
    useSearchStore.getState().setLocationQuery('22102');
    await useSearchStore.getState().fetchResults();
    await useSearchStore.getState().fetchResults();
    expect(mockGeocode).toHaveBeenCalledTimes(1);
  });

  it('annotates distance but preserves DB order for non-distance sorts', async () => {
    useSearchStore.getState().setLocationQuery('22102');
    useSearchStore.getState().setFilters({ sortBy: 'rating' });
    await useSearchStore.getState().fetchResults();

    const results = useSearchStore.getState().results;
    // DB order kept (alexandria first as returned), distances still attached.
    expect(results.map((r) => r.id)).toEqual([
      'alexandria',
      'reston',
      'unknown',
    ]);
    expect(results[0].distance_miles).not.toBeNull();
  });

  it('leaves distances null when there is no location query', async () => {
    await useSearchStore.getState().fetchResults();
    expect(mockGeocode).not.toHaveBeenCalled();
    expect(
      useSearchStore.getState().results.every((r) => r.distance_miles == null),
    ).toBe(true);
  });

  it('clears results and keeps the error on a failed search', async () => {
    const error = new Error('boom');
    mockSearch.mockResolvedValue({ data: null, error });
    useSearchStore.getState().setLocationQuery('22102');
    await useSearchStore.getState().fetchResults();

    expect(useSearchStore.getState().results).toEqual([]);
    expect(useSearchStore.getState().error).toBe(error);
  });
});

describe('setLocationQuery', () => {
  it('clears a previously resolved origin so the next fetch re-geocodes', async () => {
    useSearchStore.getState().setLocationQuery('22102');
    await useSearchStore.getState().fetchResults();
    expect(useSearchStore.getState().origin).toEqual(TYSONS);

    useSearchStore.getState().setLocationQuery('20190');
    expect(useSearchStore.getState().origin).toBeNull();
  });
});

describe('fetchFeatured — discovery carousels', () => {
  const DETAILER = makeProvider('detailer-1', null, null);
  const MECHANIC = makeProvider('mechanic-1', null, null);

  // Return a different list per requested provider type so we can assert the
  // two carousels are populated from independent, type-filtered queries.
  const byType = () =>
    mockSearch.mockImplementation((filters) =>
      Promise.resolve({
        data:
          filters?.providerTypeName === 'DETAILER'
            ? [DETAILER]
            : filters?.providerTypeName === 'MECHANIC'
              ? [MECHANIC]
              : [],
        error: null,
      }),
    );

  it('loads detailers and mechanics into separate lists, sorted by rating', async () => {
    byType();
    await useSearchStore.getState().fetchFeatured();

    const state = useSearchStore.getState();
    expect(state.featuredDetailers.map((p) => p.id)).toEqual(['detailer-1']);
    expect(state.featuredMechanics.map((p) => p.id)).toEqual(['mechanic-1']);
    expect(state.isLoadingFeatured).toBe(false);
    expect(state.featuredError).toBeNull();

    // Each carousel is fetched with its own type filter and rating sort.
    expect(mockSearch).toHaveBeenCalledWith({
      providerTypeName: 'DETAILER',
      sortBy: 'rating',
    });
    expect(mockSearch).toHaveBeenCalledWith({
      providerTypeName: 'MECHANIC',
      sortBy: 'rating',
    });
  });

  it('does not geocode — discovery is location-independent', async () => {
    byType();
    await useSearchStore.getState().fetchFeatured();
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('records the error and leaves the lists empty when a fetch fails', async () => {
    const error = new Error('discovery boom');
    mockSearch.mockResolvedValue({ data: null, error });

    await useSearchStore.getState().fetchFeatured();

    const state = useSearchStore.getState();
    expect(state.featuredError).toBe(error);
    expect(state.featuredDetailers).toEqual([]);
    expect(state.featuredMechanics).toEqual([]);
    expect(state.isLoadingFeatured).toBe(false);
  });
});

describe('applyLocationSelection', () => {
  it('sets the query and origin together, skipping the geocode on fetch', async () => {
    const coords = { latitude: 38.9586, longitude: -77.357 };
    useSearchStore.getState().applyLocationSelection('Reston, VA', coords);

    const state = useSearchStore.getState();
    expect(state.locationQuery).toBe('Reston, VA');
    expect(state.origin).toEqual(coords);

    await useSearchStore.getState().fetchResults();
    // Origin was pre-resolved, so no geocode round-trip is needed.
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it('clears the origin for a free-text label so the next fetch geocodes', async () => {
    useSearchStore.getState().applyLocationSelection('22102');
    expect(useSearchStore.getState().origin).toBeNull();

    await useSearchStore.getState().fetchResults();
    expect(mockGeocode).toHaveBeenCalledWith('22102');
  });

  it('models "Anywhere" as an empty query with no origin and no geocode', async () => {
    useSearchStore.getState().applyLocationSelection('', null);
    expect(useSearchStore.getState().locationQuery).toBe('');

    await useSearchStore.getState().fetchResults();
    expect(mockGeocode).not.toHaveBeenCalled();
  });
});

describe('recent locations', () => {
  it('adds a location to the front of the list', () => {
    useSearchStore.getState().addRecentLocation({ label: 'Reston, VA', coords: null });
    useSearchStore.getState().addRecentLocation({ label: 'Tysons, VA', coords: null });

    expect(
      useSearchStore.getState().recentLocations.map((r) => r.label),
    ).toEqual(['Tysons, VA', 'Reston, VA']);
  });

  it('de-duplicates case-insensitively and promotes the repeat to the front', () => {
    useSearchStore.getState().addRecentLocation({ label: 'Reston, VA', coords: null });
    useSearchStore.getState().addRecentLocation({ label: 'Tysons, VA', coords: null });
    useSearchStore.getState().addRecentLocation({ label: 'reston, va', coords: null });

    const labels = useSearchStore.getState().recentLocations.map((r) => r.label);
    expect(labels).toEqual(['reston, va', 'Tysons, VA']);
  });

  it('ignores blank labels so "Anywhere" never lands in recents', () => {
    useSearchStore.getState().addRecentLocation({ label: '   ', coords: null });
    expect(useSearchStore.getState().recentLocations).toEqual([]);
  });

  it('caps the list at six entries, dropping the oldest', () => {
    for (let i = 0; i < 8; i++) {
      useSearchStore.getState().addRecentLocation({ label: `Area ${i}`, coords: null });
    }
    const recents = useSearchStore.getState().recentLocations;
    expect(recents).toHaveLength(6);
    expect(recents[0].label).toBe('Area 7');
    expect(recents[5].label).toBe('Area 2');
  });

  it('clearRecentLocations empties the list', () => {
    useSearchStore.getState().addRecentLocation({ label: 'Reston, VA', coords: null });
    useSearchStore.getState().clearRecentLocations();
    expect(useSearchStore.getState().recentLocations).toEqual([]);
  });
});

describe('filter selectors', () => {
  it('counts a non-default sort as an active filter', () => {
    useSearchStore.getState().setFilters({ sortBy: 'rating' });
    expect(selectActiveFilterCount(useSearchStore.getState())).toBe(1);
    expect(selectHasActiveFilters(useSearchStore.getState())).toBe(true);
  });

  it('treats the default distance sort as no active filter', () => {
    expect(selectActiveFilterCount(useSearchStore.getState())).toBe(0);
    expect(selectHasActiveFilters(useSearchStore.getState())).toBe(false);
  });
});
