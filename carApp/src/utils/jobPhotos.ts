// jobPhotos.ts — the before/after photo requirement a provider must satisfy
// before completing a job (Flow 5.5).
//
// The gate is per-type, not a total: 4 before photos and no after photos is not
// a complete record of the work. Kept here (rather than inline in the job
// screen) so the rule and its wording are unit-testable.

import type { BookingPhoto } from '../types/models';

/** Minimum photos of EACH type ('before' and 'after') required to complete. */
export const MIN_PHOTOS_PER_TYPE = 2;

export interface PhotoRequirement {
  before: number;
  after: number;
  satisfied: boolean;
  /** e.g. "1 more before and 2 more after" — empty string when satisfied. */
  missingLabel: string;
}

export function photoRequirement(photos: BookingPhoto[]): PhotoRequirement {
  const before = photos.filter((p) => p.photo_type === 'before').length;
  const after = photos.filter((p) => p.photo_type === 'after').length;

  const missing: string[] = [];
  if (before < MIN_PHOTOS_PER_TYPE) {
    missing.push(`${MIN_PHOTOS_PER_TYPE - before} more before`);
  }
  if (after < MIN_PHOTOS_PER_TYPE) {
    missing.push(`${MIN_PHOTOS_PER_TYPE - after} more after`);
  }

  return {
    before,
    after,
    satisfied: missing.length === 0,
    missingLabel: missing.join(' and '),
  };
}
