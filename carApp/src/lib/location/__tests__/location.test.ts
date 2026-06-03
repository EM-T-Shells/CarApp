// location.test.ts — unit tests for distance / bearing / ETA / formatting.

import {
  distanceKm,
  distanceMiles,
  formatDistanceMiles,
  bearingDegrees,
  estimateEtaMinutes,
  formatEtaMinutes,
  regionForPoints,
  DEFAULT_AVG_SPEED_MPH,
  type LatLng,
} from '../index';

// Known city pairs for reality-checking the Haversine math.
const TYSONS: LatLng = { latitude: 38.9187, longitude: -77.2311 };
const DC_UNION_STATION: LatLng = { latitude: 38.8973, longitude: -77.0063 };
const ARLINGTON: LatLng = { latitude: 38.88, longitude: -77.1 };

describe('distanceKm / distanceMiles', () => {
  it('returns 0 for identical points', () => {
    expect(distanceKm(TYSONS, TYSONS)).toBeCloseTo(0, 5);
    expect(distanceMiles(TYSONS, TYSONS)).toBeCloseTo(0, 5);
  });

  it('matches a known city pair (Tysons → DC Union Station ≈ 19.5 km)', () => {
    const km = distanceKm(TYSONS, DC_UNION_STATION);
    // Allow ±1 km tolerance — Haversine is exact on a sphere, not WGS84.
    expect(km).toBeGreaterThan(18);
    expect(km).toBeLessThan(21);
  });

  it('is symmetric (A→B == B→A)', () => {
    expect(distanceKm(TYSONS, DC_UNION_STATION)).toBeCloseTo(
      distanceKm(DC_UNION_STATION, TYSONS),
      5,
    );
  });

  it('converts to miles using the standard factor', () => {
    const km = distanceKm(TYSONS, DC_UNION_STATION);
    const miles = distanceMiles(TYSONS, DC_UNION_STATION);
    expect(miles).toBeCloseTo(km / 1.609344, 5);
  });
});

describe('formatDistanceMiles', () => {
  it('shows one decimal place under 10 miles', () => {
    expect(formatDistanceMiles(0.3)).toBe('0.3 mi');
    expect(formatDistanceMiles(9.9)).toBe('9.9 mi');
  });

  it('rounds to integer at or above 10 miles', () => {
    expect(formatDistanceMiles(10)).toBe('10 mi');
    expect(formatDistanceMiles(12.4)).toBe('12 mi');
    expect(formatDistanceMiles(12.6)).toBe('13 mi');
  });
});

describe('bearingDegrees', () => {
  it('returns a bearing in [0, 360)', () => {
    const b = bearingDegrees(TYSONS, DC_UNION_STATION);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it('returns ~90° (east) for a due-east destination', () => {
    const from: LatLng = { latitude: 38.9, longitude: -77.2 };
    const to: LatLng = { latitude: 38.9, longitude: -77.0 };
    const b = bearingDegrees(from, to);
    expect(b).toBeGreaterThan(89);
    expect(b).toBeLessThan(91);
  });

  it('returns ~0° (north) for a due-north destination', () => {
    const from: LatLng = { latitude: 38.8, longitude: -77.1 };
    const to: LatLng = { latitude: 39.0, longitude: -77.1 };
    const b = bearingDegrees(from, to);
    expect(b).toBeLessThan(1);
  });
});

describe('estimateEtaMinutes', () => {
  it('returns 0 when points are identical', () => {
    expect(estimateEtaMinutes(TYSONS, TYSONS)).toBe(0);
  });

  it('scales inversely with average speed', () => {
    const slow = estimateEtaMinutes(TYSONS, DC_UNION_STATION, 10);
    const fast = estimateEtaMinutes(TYSONS, DC_UNION_STATION, 60);
    expect(slow).toBeGreaterThan(fast);
  });

  it('uses the default speed when none is passed', () => {
    const a = estimateEtaMinutes(TYSONS, DC_UNION_STATION);
    const b = estimateEtaMinutes(
      TYSONS,
      DC_UNION_STATION,
      DEFAULT_AVG_SPEED_MPH,
    );
    expect(a).toBeCloseTo(b, 5);
  });

  it('treats zero or negative speed as ETA=0 (no division by zero)', () => {
    expect(estimateEtaMinutes(TYSONS, DC_UNION_STATION, 0)).toBe(0);
    expect(estimateEtaMinutes(TYSONS, DC_UNION_STATION, -5)).toBe(0);
  });
});

describe('formatEtaMinutes', () => {
  it('says "Arriving" for 0 or negative', () => {
    expect(formatEtaMinutes(0)).toBe('Arriving');
    expect(formatEtaMinutes(-3)).toBe('Arriving');
    expect(formatEtaMinutes(0.4)).toBe('Arriving');
  });

  it('renders minutes under an hour', () => {
    expect(formatEtaMinutes(1)).toBe('1 min');
    expect(formatEtaMinutes(47)).toBe('47 min');
    expect(formatEtaMinutes(59.4)).toBe('59 min');
  });

  it('renders whole hours without remainder', () => {
    expect(formatEtaMinutes(60)).toBe('1 hr');
    expect(formatEtaMinutes(120)).toBe('2 hr');
  });

  it('renders hours + minutes when there is a remainder', () => {
    expect(formatEtaMinutes(75)).toBe('1 hr 15 min');
    expect(formatEtaMinutes(135)).toBe('2 hr 15 min');
  });
});

describe('regionForPoints', () => {
  it('centers on the midpoint of the two coordinates', () => {
    const r = regionForPoints(TYSONS, DC_UNION_STATION);
    expect(r.latitude).toBeCloseTo(
      (TYSONS.latitude + DC_UNION_STATION.latitude) / 2,
      5,
    );
    expect(r.longitude).toBeCloseTo(
      (TYSONS.longitude + DC_UNION_STATION.longitude) / 2,
      5,
    );
  });

  it('enforces a minimum delta for near-identical points', () => {
    const r = regionForPoints(TYSONS, TYSONS);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(0.01);
    expect(r.longitudeDelta).toBeGreaterThanOrEqual(0.01);
  });

  it('expands the deltas (>=1.6x) for spread-out points', () => {
    const r = regionForPoints(TYSONS, ARLINGTON);
    const latSpan = Math.abs(TYSONS.latitude - ARLINGTON.latitude);
    const lngSpan = Math.abs(TYSONS.longitude - ARLINGTON.longitude);
    expect(r.latitudeDelta).toBeGreaterThanOrEqual(latSpan * 1.6 - 1e-9);
    expect(r.longitudeDelta).toBeGreaterThanOrEqual(lngSpan * 1.6 - 1e-9);
  });
});
