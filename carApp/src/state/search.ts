// Zustand search store — holds location query, provider search filters,
// and search results. Populated by the search home screen and consumed
// by the results list and provider cards.

import { create } from 'zustand';
import type {
  ProviderSearchResult,
  ProviderSearchFilters,
} from '../lib/supabase/queries';
import { searchProviders } from '../lib/supabase/queries';

// ── State Shape ────────────────────────────────────────────────────────

export interface SearchState {
  /** Free-text location query entered in the LocationSearchBar. */
  locationQuery: string;
  /** Active filter set applied to the provider search. */
  filters: ProviderSearchFilters;
  /** Provider results returned by the most recent search. */
  results: ProviderSearchResult[];
  /** True while a search request is in flight. */
  isLoading: boolean;
  /** Error from the most recent search, or null on success. */
  error: Error | null;

  // ── Mutators ──────────────────────────────────────────────────────

  /** Update the location search text. */
  setLocationQuery: (query: string) => void;
  /** Merge partial filter updates into the active filter set. */
  setFilters: (updates: Partial<ProviderSearchFilters>) => void;
  /** Reset filters to their defaults. */
  resetFilters: () => void;
  /** Execute a provider search with the current filters. */
  fetchResults: () => Promise<void>;
  /** Clear all search state back to initial values. */
  reset: () => void;
}

// ── Defaults ──────────────────────────────────────────────────────────

const DEFAULT_FILTERS: ProviderSearchFilters = {
  sortBy: 'rating',
};

// ── Store ─────────────────────────────────────────────────────────────

export const useSearchStore = create<SearchState>((set, get) => ({
  locationQuery: '',
  filters: { ...DEFAULT_FILTERS },
  results: [],
  isLoading: false,
  error: null,

  setLocationQuery: (query) => set({ locationQuery: query }),

  setFilters: (updates) =>
    set((s) => ({ filters: { ...s.filters, ...updates } })),

  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  fetchResults: async () => {
    set({ isLoading: true, error: null });
    const { filters } = get();
    const { data, error } = await searchProviders(filters);

    if (error) {
      set({ isLoading: false, error, results: [] });
    } else {
      set({ isLoading: false, error: null, results: data });
    }
  },

  reset: () =>
    set({
      locationQuery: '',
      filters: { ...DEFAULT_FILTERS },
      results: [],
      isLoading: false,
      error: null,
    }),
}));

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
