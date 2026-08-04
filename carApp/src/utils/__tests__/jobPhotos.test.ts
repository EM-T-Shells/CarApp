// jobPhotos.test.ts — the per-type before/after photo gate for completing a job.

import { MIN_PHOTOS_PER_TYPE, photoRequirement } from '../jobPhotos';
import type { BookingPhoto } from '../../types/models';

function photo(photo_type: 'before' | 'after', id: string): BookingPhoto {
  return {
    id,
    booking_id: 'booking-1',
    photo_type,
    storage_url: `https://signed.example/${id}.jpg`,
    uploaded_at: '2026-08-03T12:00:00.000Z',
  };
}

const before = (n: number) => Array.from({ length: n }, (_, i) => photo('before', `b${i}`));
const after = (n: number) => Array.from({ length: n }, (_, i) => photo('after', `a${i}`));

describe('photoRequirement', () => {
  it('requires 2 of each type', () => {
    expect(MIN_PHOTOS_PER_TYPE).toBe(2);
  });

  it('is satisfied with 2 before and 2 after', () => {
    const req = photoRequirement([...before(2), ...after(2)]);
    expect(req).toEqual({ before: 2, after: 2, satisfied: true, missingLabel: '' });
  });

  it('is not satisfied by 4 photos that are all before photos', () => {
    const req = photoRequirement(before(4));
    expect(req.satisfied).toBe(false);
    expect(req.before).toBe(4);
    expect(req.after).toBe(0);
    expect(req.missingLabel).toBe('2 more after');
  });

  it('is not satisfied by 4 photos that are all after photos', () => {
    const req = photoRequirement(after(4));
    expect(req.satisfied).toBe(false);
    expect(req.missingLabel).toBe('2 more before');
  });

  it('names both shortfalls when each type is short', () => {
    const req = photoRequirement([...before(1), ...after(0)]);
    expect(req.missingLabel).toBe('1 more before and 2 more after');
  });

  it('stays satisfied above the minimum', () => {
    const req = photoRequirement([...before(5), ...after(3)]);
    expect(req.satisfied).toBe(true);
    expect(req.missingLabel).toBe('');
  });

  it('treats an empty set as unsatisfied', () => {
    const req = photoRequirement([]);
    expect(req).toEqual({
      before: 0,
      after: 0,
      satisfied: false,
      missingLabel: '2 more before and 2 more after',
    });
  });
});
