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
