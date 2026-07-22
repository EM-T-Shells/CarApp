// search.test.ts — unit tests for the search store's distance annotation,
// distance sorting, origin geocoding, and filter selectors. searchProviders
// and geocodeAddress are mocked; the Haversine math (distanceMiles) is real.

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
