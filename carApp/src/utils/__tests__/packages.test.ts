import {
  PACKAGE_TIERS,
  advertisedPriceRangeCents,
  durationRangeLabel,
  isAddOn,
  isPackageTier,
  modifierSurchargeRangeCents,
  organizePackages,
} from '../packages';
import type { ServicePackage } from '../../types/models';

function pkg(overrides: Partial<ServicePackage> & { id: string }): ServicePackage {
  return {
    provider_id: 'pp1',
    catalog_id: null,
    name: overrides.id,
    description: null,
    category: 'detailing',
    base_price: 100,
    duration_mins: 60,
    duration_min_mins: null,
    duration_max_mins: null,
    tier: null,
    parent_package_id: null,
    is_active: true,
    is_custom: false,
    is_approved: true,
    sort_order: 0,
    created_at: '2026-09-28T00:00:00Z',
    ...overrides,
  };
}

describe('tiers', () => {
  // Mirrors service_packages_tier_check; a value outside it is refused (23514).
  it('matches the database vocabulary', () => {
    expect([...PACKAGE_TIERS]).toEqual(['basic', 'standard', 'premium']);
    expect(isPackageTier('premium')).toBe(true);
    expect(isPackageTier('gold')).toBe(false);
    expect(isPackageTier(null)).toBe(false);
  });
});

describe('organizePackages', () => {
  it('orders main services basic → premium, then untiered', () => {
    const { mains } = organizePackages([
      pkg({ id: 'untiered' }),
      pkg({ id: 'premium', tier: 'premium' }),
      pkg({ id: 'basic', tier: 'basic' }),
      pkg({ id: 'standard', tier: 'standard' }),
    ]);
    expect(mains.map((p) => p.id)).toEqual(['basic', 'standard', 'premium', 'untiered']);
  });

  it('groups add-ons under the service they attach to', () => {
    const { mains, addOnsByParent } = organizePackages([
      pkg({ id: 'detail' }),
      pkg({ id: 'ceramic', parent_package_id: 'detail', sort_order: 2 }),
      pkg({ id: 'pet-hair', parent_package_id: 'detail', sort_order: 1 }),
    ]);
    expect(mains.map((p) => p.id)).toEqual(['detail']);
    expect(addOnsByParent.detail.map((p) => p.id)).toEqual(['pet-hair', 'ceramic']);
  });

  // The database refuses a booking carrying an add-on without its parent, so an
  // orphan would only produce a failed request.
  it('drops an add-on whose main service is not offered', () => {
    const { mains, addOnsByParent } = organizePackages([
      pkg({ id: 'orphan', parent_package_id: 'hidden-parent' }),
    ]);
    expect(mains).toEqual([]);
    expect(addOnsByParent).toEqual({});
  });

  it('knows an add-on when it sees one', () => {
    expect(isAddOn({ parent_package_id: 'x' })).toBe(true);
    expect(isAddOn({ parent_package_id: null })).toBe(false);
  });
});

describe('durationRangeLabel', () => {
  it('shows an advertised range', () => {
    expect(
      durationRangeLabel({ duration_mins: 150, duration_min_mins: 120, duration_max_mins: 180 }),
    ).toBe('2 hr–3 hr');
  });

  it('collapses a range with equal ends', () => {
    expect(
      durationRangeLabel({ duration_mins: 150, duration_min_mins: 120, duration_max_mins: 120 }),
    ).toBe('2 hr');
  });

  it('falls back to the single duration, then to nothing', () => {
    expect(
      durationRangeLabel({ duration_mins: 45, duration_min_mins: null, duration_max_mins: null }),
    ).toBe('45 min');
    expect(
      durationRangeLabel({ duration_mins: null, duration_min_mins: null, duration_max_mins: null }),
    ).toBe('');
  });
});

describe('modifierSurchargeRangeCents', () => {
  it('sums the largest surcharge of each factor type, since a job matches one value per type', () => {
    expect(
      modifierSurchargeRangeCents([
        { factor_type: 'size_class', delta_price: 30 },
        { factor_type: 'size_class', delta_price: 50 },
        { factor_type: 'size_class', delta_price: -10 },
        { factor_type: 'soil_level', delta_price: 25 },
      ]),
    ).toEqual({ minCents: 0, maxCents: 7500 });
  });

  // QuoteBuilder only itemises surcharges, so the range must not promise a
  // discount no quote pre-fill can carry.
  it('ignores discount modifiers', () => {
    expect(
      modifierSurchargeRangeCents([{ factor_type: 'size_class', delta_price: -20 }]),
    ).toEqual({ minCents: 0, maxCents: 0 });
  });

  it('is zero with no modifiers', () => {
    expect(modifierSurchargeRangeCents([])).toEqual({ minCents: 0, maxCents: 0 });
  });
});

describe('advertisedPriceRangeCents', () => {
  it('runs from the base price to what the modifiers could add', () => {
    expect(
      advertisedPriceRangeCents(15000, [
        { factor_type: 'size_class', delta_price: 30 },
        { factor_type: 'size_class', delta_price: -10 },
      ]),
    ).toEqual({ minCents: 15000, maxCents: 18000 });
  });

  it('is a single price with no surcharging modifiers', () => {
    expect(advertisedPriceRangeCents(500, [])).toEqual({ minCents: 500, maxCents: 500 });
  });
});
