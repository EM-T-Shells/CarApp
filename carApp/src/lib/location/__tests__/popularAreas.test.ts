// popularAreas.test.ts — unit tests for the location picker's curated area
// list and its live substring filter.

import { POPULAR_AREAS, filterPopularAreas } from '../popularAreas';

describe('filterPopularAreas', () => {
  it('returns the full list for an empty or whitespace query', () => {
    expect(filterPopularAreas('')).toBe(POPULAR_AREAS);
    expect(filterPopularAreas('   ')).toBe(POPULAR_AREAS);
  });

  it('matches labels case-insensitively as a substring', () => {
    const labels = filterPopularAreas('rest').map((a) => a.label);
    expect(labels).toContain('Reston, VA');
    expect(labels).not.toContain('Tysons, VA');
  });

  it('matches on the state portion of the label too', () => {
    const dc = filterPopularAreas('dc').map((a) => a.label);
    expect(dc).toEqual(['Washington, DC']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterPopularAreas('nowheresville')).toEqual([]);
  });

  it('every area carries finite coordinates', () => {
    for (const area of POPULAR_AREAS) {
      expect(Number.isFinite(area.coords.latitude)).toBe(true);
      expect(Number.isFinite(area.coords.longitude)).toBe(true);
    }
  });
});
