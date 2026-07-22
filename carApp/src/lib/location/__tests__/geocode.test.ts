// geocode.test.ts — unit tests for coverage-area normalization and the
// Nominatim-backed forward geocoder (with global.fetch mocked).

import { geocodeAddress, normalizeCoverageArea } from '../index';

describe('normalizeCoverageArea', () => {
  it('returns empty string for nullish / blank input', () => {
    expect(normalizeCoverageArea(null)).toBe('');
    expect(normalizeCoverageArea(undefined)).toBe('');
    expect(normalizeCoverageArea('   ')).toBe('');
  });

  it('strips a trailing radius clause', () => {
    expect(normalizeCoverageArea('Reston, VA + 15 miles')).toBe('Reston, VA');
    expect(normalizeCoverageArea('Fairfax, VA +18 mi')).toBe('Fairfax, VA');
    expect(normalizeCoverageArea('Arlington, VA ± 12 miles')).toBe(
      'Arlington, VA',
    );
  });

  it('keeps the first town but re-attaches a trailing state for area lists', () => {
    expect(normalizeCoverageArea('McLean / Tysons / Vienna, VA')).toBe(
      'McLean, VA',
    );
  });

  it('leaves a plain town untouched', () => {
    expect(normalizeCoverageArea('Ashburn')).toBe('Ashburn');
    expect(normalizeCoverageArea('  Reston  ')).toBe('Reston');
  });
});

describe('geocodeAddress', () => {
  const okResponse = (body: unknown) =>
    ({ ok: true, json: async () => body }) as Response;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns lat/lng from the first Nominatim match', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse([{ lat: '38.9532820', lon: '-77.3464516' }]));

    const result = await geocodeAddress('Reston, VA');

    expect(result).toEqual({ latitude: 38.953282, longitude: -77.3464516 });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('nominatim.openstreetmap.org/search');
    expect(calledUrl).toContain('countrycodes=us');
  });

  it('does not call the network for an empty query', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(await geocodeAddress('   ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when there are no matches', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse([]));
    expect(await geocodeAddress('nowhere at all')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, json: async () => [] } as Response);
    expect(await geocodeAddress('Reston, VA')).toBeNull();
  });

  it('returns null when a match has non-numeric coordinates', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(okResponse([{ lat: 'abc', lon: 'def' }]));
    expect(await geocodeAddress('Reston, VA')).toBeNull();
  });

  it('never throws — network failure resolves to null', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await geocodeAddress('Reston, VA')).toBeNull();
  });
});
