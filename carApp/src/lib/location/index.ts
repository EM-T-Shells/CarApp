// Location utilities — distance, bearing, and ETA helpers used by the
// live-tracking screen. Operates entirely on lat/lng pairs already stored
// in the DB (booking.location_lat/lng + provider_location_cache), so no
// external geocoding service is required. The map tiles are rendered by
// react-native-maps; this file does not depend on it.
//
// ETA assumes a constant average ground speed (urban driving). When a real
// routing/ETA service is later wired up (Google Directions, Mapbox, etc.)
// estimateEtaMinutes() can be swapped for a network call without changing
// callers.

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

/** Default urban driving speed used by estimateEtaMinutes. */
export const DEFAULT_AVG_SPEED_MPH = 25;

// ─── Types ─────────────────────────────────────────────────────────────

export interface LatLng {
  latitude: number;
  longitude: number;
}

// ─── Conversions ───────────────────────────────────────────────────────

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ─── Distance ──────────────────────────────────────────────────────────

/**
 * Great-circle distance between two points in kilometers (Haversine).
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Great-circle distance between two points in miles.
 */
export function distanceMiles(a: LatLng, b: LatLng): number {
  return distanceKm(a, b) / KM_PER_MILE;
}

/**
 * Formats a distance in miles as a short, human-readable label.
 * Examples: 0.3 → "0.3 mi", 12.7 → "12.7 mi", 25.0 → "25 mi"
 */
export function formatDistanceMiles(miles: number): string {
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// ─── Bearing ───────────────────────────────────────────────────────────

/**
 * Initial bearing from point A to point B, in degrees clockwise from north.
 */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

// ─── ETA ───────────────────────────────────────────────────────────────

/**
 * Estimates travel time in minutes assuming constant average ground speed.
 * Defaults to DEFAULT_AVG_SPEED_MPH; pass an override for highway scenarios.
 */
export function estimateEtaMinutes(
  from: LatLng,
  to: LatLng,
  avgSpeedMph: number = DEFAULT_AVG_SPEED_MPH,
): number {
  if (avgSpeedMph <= 0) return 0;
  const miles = distanceMiles(from, to);
  return (miles / avgSpeedMph) * 60;
}

/**
 * Formats an ETA in minutes as a short, human-readable label.
 * Examples: 0 → "Arriving", 1 → "1 min", 47 → "47 min", 75 → "1 hr 15 min"
 */
export function formatEtaMinutes(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded <= 0) return 'Arriving';
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (remainder === 0) return `${hours} hr`;
  return `${hours} hr ${remainder} min`;
}

// ─── Map region ────────────────────────────────────────────────────────

/**
 * Returns a region that comfortably fits both points with a small padding.
 * Coordinates are in degrees; the deltas are sized to roughly 1.6x the
 * span between the two points (minimum span of ~1km to avoid an over-zoomed
 * view when the points are very close).
 */
export function regionForPoints(
  a: LatLng,
  b: LatLng,
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const minLatDelta = 0.01;
  const minLngDelta = 0.01;

  const latitude = (a.latitude + b.latitude) / 2;
  const longitude = (a.longitude + b.longitude) / 2;
  const latitudeDelta = Math.max(
    Math.abs(a.latitude - b.latitude) * 1.6,
    minLatDelta,
  );
  const longitudeDelta = Math.max(
    Math.abs(a.longitude - b.longitude) * 1.6,
    minLngDelta,
  );

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

// ─── Geocoding ─────────────────────────────────────────────────────────
//
// Forward-geocodes a free-text location (zip, city, or street address) to a
// lat/lng using OpenStreetMap's Nominatim service. Chosen over Google
// Geocoding because CarApp has no Google Maps key (ARCHITECTURE.md) and the
// app already renders OSM tiles. Results are biased to the US since the
// marketplace is Northern Virginia / DC Metro only.
//
// Usage note: Nominatim's policy is one request/second and no heavy bulk use.
// That's fine for a single lookup per customer search and per provider profile
// save. If search volume grows, move this behind an Edge Function with caching.

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

/** Sent so Nominatim can attribute traffic (per their usage policy). */
const GEOCODE_USER_AGENT = 'CarApp/1.0 (mobile detailing marketplace)';

/** Raw shape of a Nominatim search result (only the fields we read). */
interface NominatimResult {
  lat?: string;
  lon?: string;
}

/**
 * Cleans a provider's free-text `coverage_area` into something geocodable.
 * Examples:
 *   "Reston, VA + 15 miles"        → "Reston, VA"
 *   "McLean / Tysons / Vienna, VA" → "McLean, VA"
 *   "Ashburn"                      → "Ashburn"
 * The radius suffix and extra service areas only confuse the geocoder, so we
 * keep the primary town (and its state, if the string carried one).
 */
export function normalizeCoverageArea(text: string | null | undefined): string {
  if (!text) return '';
  // Strip a trailing radius clause: "+ 15 miles", "± 20 mi", "+18 km", …
  let s = text.replace(/\s*[+±]\s*\d+(?:\.\d+)?\s*(?:mi|mile|miles|km)\b.*$/i, '');
  s = s.trim();
  // Multi-area lists: keep the first town but re-attach a trailing state code.
  if (s.includes('/')) {
    const stateMatch = s.match(/,\s*([A-Za-z.]{2,})\s*$/);
    const first = s.split('/')[0].trim().replace(/,\s*$/, '');
    s = stateMatch && !first.includes(',') ? `${first}, ${stateMatch[1]}` : first;
  }
  return s.trim();
}

/**
 * Forward-geocodes a location string to a { latitude, longitude } pair, or
 * null when the query is empty, the lookup fails, or nothing matches. Never
 * throws — callers treat null as "location unknown" and degrade gracefully.
 */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
  });

  try {
    const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'User-Agent': GEOCODE_USER_AGENT },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as NominatimResult[];
    const first = Array.isArray(body) ? body[0] : undefined;
    if (!first || first.lat == null || first.lon == null) return null;

    const latitude = Number(first.lat);
    const longitude = Number(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    // Network error / malformed JSON — treat as "location unknown".
    return null;
  }
}
