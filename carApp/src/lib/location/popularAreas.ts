// Popular service areas — the curated shortlist of Northern Virginia / DC
// Metro locations shown in the location picker (search/location.tsx) before
// the customer types anything. Each carries pre-resolved coordinates so
// selecting one seeds the search origin directly, skipping a Nominatim
// geocode round-trip (see geocodeAddress in ./index.ts).
//
// The marketplace only operates in this region (CLAUDE.md), so this list is
// intentionally static — not fetched. Add towns here as coverage expands.

import type { LatLng } from './index';

export interface PopularArea {
  /** Display label, e.g. "Tysons, VA". Also used as the search query. */
  label: string;
  /** Pre-resolved centroid for the area. */
  coords: LatLng;
}

export const POPULAR_AREAS: readonly PopularArea[] = [
  { label: 'Arlington, VA', coords: { latitude: 38.8816, longitude: -77.091 } },
  { label: 'Alexandria, VA', coords: { latitude: 38.8048, longitude: -77.0469 } },
  { label: 'Tysons, VA', coords: { latitude: 38.9187, longitude: -77.2311 } },
  { label: 'McLean, VA', coords: { latitude: 38.9339, longitude: -77.1773 } },
  { label: 'Reston, VA', coords: { latitude: 38.9586, longitude: -77.357 } },
  { label: 'Vienna, VA', coords: { latitude: 38.9012, longitude: -77.2653 } },
  { label: 'Fairfax, VA', coords: { latitude: 38.8462, longitude: -77.3064 } },
  { label: 'Ashburn, VA', coords: { latitude: 39.0437, longitude: -77.4875 } },
  { label: 'Herndon, VA', coords: { latitude: 38.9696, longitude: -77.3861 } },
  { label: 'Falls Church, VA', coords: { latitude: 38.8823, longitude: -77.1711 } },
  { label: 'Washington, DC', coords: { latitude: 38.9072, longitude: -77.0369 } },
  { label: 'Bethesda, MD', coords: { latitude: 38.9847, longitude: -77.0947 } },
];

/**
 * Case-insensitive substring filter over the popular-area labels. An empty or
 * whitespace-only query returns the full list unchanged.
 */
export function filterPopularAreas(query: string): readonly PopularArea[] {
  const q = query.trim().toLowerCase();
  if (!q) return POPULAR_AREAS;
  return POPULAR_AREAS.filter((a) => a.label.toLowerCase().includes(q));
}
