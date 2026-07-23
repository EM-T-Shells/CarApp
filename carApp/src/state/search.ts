// Zustand search store — holds location query, provider search filters,
// and search results. Populated by the search home screen and consumed
// by the results list and provider cards.
//
// Distance: the customer's typed location is forward-geocoded to a lat/lng
// (`origin`) on the first fetch after it changes. Each result is annotated
// with the Haversine distance from `origin` to the provider's geocoded base,
// and when sortBy === 'distance' (the default) results are ordered nearest
// first. Providers without base coordinates sink to the bottom.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ProviderSearchResult,
  ProviderSearchFilters,
} from '../lib/supabase/queries';
import { searchProviders } from '../lib/supabase/queries';
import { distanceMiles, geocodeAddress, type LatLng } from '../lib/location';

// ── State Shape ────────────────────────────────────────────────────────

/**
 * A location the customer previously searched, kept for the picker's "Recent"
 * list. Coordinates are stored when known (a popular-area tap) so re-selecting
 * skips the geocode; free-text searches persist with null coords and re-geocode
 * on next use.
 */
export interface RecentLocation {
  /** Display label / search query, e.g. "Reston, VA". */
  label: string;
  /** Resolved coordinates, or null when the label must be geocoded. */
  coords: LatLng | null;
}

/** How many recent locations to retain in the picker. */
const RECENT_LIMIT = 6;

export interface SearchState {
  /** Free-text location query entered in the LocationSearchBar. */
  locationQuery: string;
  /**
   * Geocoded coordinates for `locationQuery`, or null when it is empty or
   * has not been resolved yet. Cleared whenever the query changes so the
   * next fetch re-geocodes.
   */
  origin: LatLng | null;
  /** Active filter set applied to the provider search. */
  filters: ProviderSearchFilters;
  /** Provider results returned by the most recent search. */
  results: ProviderSearchResult[];
  /** True while a search request is in flight. */
  isLoading: boolean;
  /** Error from the most recent search, or null on success. */
  error: Error | null;

  /**
   * Top-rated detailers shown in the discovery carousel on the search home
   * screen (before any location search). Sorted by gear rating, not distance.
   */
  featuredDetailers: ProviderSearchResult[];
  /** Top-rated mechanics shown in the discovery carousel on the search home. */
  featuredMechanics: ProviderSearchResult[];
  /** True while the discovery carousels are loading. */
  isLoadingFeatured: boolean;
  /** Error from the most recent discovery fetch, or null on success. */
  featuredError: Error | null;

  /**
   * Locations the customer recently searched, most-recent first. Persisted
   * locally so the picker can offer them across sessions.
   */
  recentLocations: RecentLocation[];

  // ── Mutators ──────────────────────────────────────────────────────

  /** Update the location search text (clears the resolved origin). */
  setLocationQuery: (query: string) => void;
  /**
   * Set the location query and origin together from a picked suggestion.
   * Pass `coords` for a place with known coordinates (popular area, current
   * location) to skip the geocode; omit them for a free-text label that the
   * next fetch should geocode. An empty label + null coords means "Anywhere".
   */
  applyLocationSelection: (label: string, coords?: LatLng | null) => void;
  /**
   * Record a searched location at the front of the recents list, de-duplicated
   * by label (case-insensitive) and capped at RECENT_LIMIT. No-op for a blank
   * label so "Anywhere" never lands in recents.
   */
  addRecentLocation: (entry: RecentLocation) => void;
  /** Remove all recent locations. */
  clearRecentLocations: () => void;
  /** Merge partial filter updates into the active filter set. */
  setFilters: (updates: Partial<ProviderSearchFilters>) => void;
  /** Reset filters to their defaults. */
  resetFilters: () => void;
  /** Execute a provider search with the current filters. */
  fetchResults: () => Promise<void>;
  /**
   * Load the top-rated detailers and mechanics for the discovery carousels.
   * Fetches both provider types in parallel, sorted by rating. Safe to call
   * on every mount — it is a no-op-ish refresh, not tied to the filter set.
   */
  fetchFeatured: () => Promise<void>;
  /** Clear all search state back to initial values. */
  reset: () => void;
}

// ── Provider type identifiers ─────────────────────────────────────────
// Match the `provider_types.name` values filtered on elsewhere (search home
// category tiles). Kept here so the discovery fetch and the tiles agree.

const PROVIDER_TYPE_DETAILER = 'DETAILER';
const PROVIDER_TYPE_MECHANIC = 'MECHANIC';

/** How many providers to show per discovery carousel. */
const FEATURED_LIMIT = 10;

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_FILTERS: ProviderSearchFilters = {
  sortBy: 'distance',
};

// ── Distance helpers ──────────────────────────────────────────────────

/**
 * Annotates each provider with `distance_miles` from `origin` to the
 * provider's geocoded base. Yields null when the origin is unknown or the
 * provider has no base coordinates.
 */
function annotateDistances(
  providers: ProviderSearchResult[],
  origin: LatLng | null,
): ProviderSearchResult[] {
  return providers.map((p) => {
    if (origin == null || p.base_lat == null || p.base_lng == null) {
      return { ...p, distance_miles: null };
    }
    const miles = distanceMiles(origin, {
      latitude: Number(p.base_lat),
      longitude: Number(p.base_lng),
    });
    return { ...p, distance_miles: miles };
  });
}

/**
 * Stable ascending sort by `distance_miles`. Providers with an unknown
 * distance (null) are kept after all providers with a known distance, in
 * their existing (DB) order.
 */
function sortByDistance(
  providers: ProviderSearchResult[],
): ProviderSearchResult[] {
  return [...providers].sort((a, b) => {
    const da = a.distance_miles;
    const db = b.distance_miles;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
}

// ── Store ─────────────────────────────────────────────────────────────

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      locationQuery: '',
      origin: null,
      filters: { ...DEFAULT_FILTERS },
      results: [],
      isLoading: false,
      error: null,
      featuredDetailers: [],
      featuredMechanics: [],
      isLoadingFeatured: false,
      featuredError: null,
      recentLocations: [],

      setLocationQuery: (query) => set({ locationQuery: query, origin: null }),

      applyLocationSelection: (label, coords) =>
        set({ locationQuery: label, origin: coords ?? null }),

      addRecentLocation: (entry) => {
        const label = entry.label.trim();
        if (!label) return;
        set((s) => {
          const key = label.toLowerCase();
          const deduped = s.recentLocations.filter(
            (r) => r.label.toLowerCase() !== key,
          );
          return {
            recentLocations: [{ label, coords: entry.coords }, ...deduped].slice(
              0,
              RECENT_LIMIT,
            ),
          };
        });
      },

      clearRecentLocations: () => set({ recentLocations: [] }),

      setFilters: (updates) =>
        set((s) => ({ filters: { ...s.filters, ...updates } })),

      resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

      fetchResults: async () => {
        set({ isLoading: true, error: null });
        const { filters, locationQuery } = get();

        // Resolve the customer's coordinates once per location change so distances
        // (and distance sorting) have an origin to measure from.
        let origin = get().origin;
        if (origin == null && locationQuery.trim()) {
          origin = await geocodeAddress(locationQuery.trim());
          set({ origin });
        }

        const { data, error } = await searchProviders(filters);

        if (error) {
          set({ isLoading: false, error, results: [] });
          return;
        }

        const annotated = annotateDistances(data, origin);
        const results =
          filters.sortBy === 'distance' ? sortByDistance(annotated) : annotated;

        set({ isLoading: false, error: null, results });
      },

      fetchFeatured: async () => {
        set({ isLoadingFeatured: true, featuredError: null });

        const [detailers, mechanics] = await Promise.all([
          searchProviders({
            providerTypeName: PROVIDER_TYPE_DETAILER,
            sortBy: 'rating',
          }),
          searchProviders({
            providerTypeName: PROVIDER_TYPE_MECHANIC,
            sortBy: 'rating',
          }),
        ]);

        const error = detailers.error ?? mechanics.error;
        if (error) {
          set({ isLoadingFeatured: false, featuredError: error });
          return;
        }

        set({
          isLoadingFeatured: false,
          featuredError: null,
          featuredDetailers: (detailers.data ?? []).slice(0, FEATURED_LIMIT),
          featuredMechanics: (mechanics.data ?? []).slice(0, FEATURED_LIMIT),
        });
      },

      reset: () =>
        set({
          locationQuery: '',
          origin: null,
          filters: { ...DEFAULT_FILTERS },
          results: [],
          isLoading: false,
          error: null,
          featuredDetailers: [],
          featuredMechanics: [],
          isLoadingFeatured: false,
          featuredError: null,
          recentLocations: [],
        }),
    }),
    {
      name: 'carapp.search',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the recents list is durable — query, filters, and results are
      // per-session and recomputed on demand.
      partialize: (s) => ({ recentLocations: s.recentLocations }),
    },
  ),
);

// ── Selectors ─────────────────────────────────────────────────────────

/** True when a search has been performed and returned results. */
export const selectHasResults = (s: SearchState): boolean =>
  s.results.length > 0;

/** True when any filter differs from the default. */
export const selectHasActiveFilters = (s: SearchState): boolean =>
  s.filters.providerTypeName !== undefined ||
  s.filters.minRating !== undefined ||
  s.filters.sortBy !== DEFAULT_FILTERS.sortBy;

/** Number of active non-default filters, useful for badge counts. */
export const selectActiveFilterCount = (s: SearchState): number => {
  let count = 0;
  if (s.filters.providerTypeName !== undefined) count++;
  if (s.filters.minRating !== undefined) count++;
  if (s.filters.sortBy !== DEFAULT_FILTERS.sortBy) count++;
  return count;
};
