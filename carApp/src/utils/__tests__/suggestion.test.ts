import {
  MIN_SUGGESTED_MINS,
  conditionAnswersFromJson,
  factorValueLabel,
  isConditionComplete,
  isVehicleSizeClass,
  selectModifiers,
  suggestDuration,
  surchargeFromModifiers,
} from '../suggestion';
import type { ServiceDurationModifier } from '../../types/models';

function modifier(
  factorType: string,
  factorValue: string,
  deltaMins: number,
  deltaPrice = 0,
): ServiceDurationModifier {
  return {
    id: `${factorType}-${factorValue}`,
    provider_id: 'pp1',
    factor_type: factorType,
    factor_value: factorValue,
    delta_mins: deltaMins,
    delta_price: deltaPrice,
    created_at: '2026-08-20T00:00:00Z',
  };
}

// The same modifier set the SQL test uses, so the two suites assert the same
// arithmetic against the same numbers.
const MODIFIERS = [
  modifier('size_class', 'suv', 30),
  modifier('size_class', 'compact', -15),
  modifier('soil_level', 'heavy', 45),
  modifier('pets', 'frequent', 20),
];

// ── Vocabulary ────────────────────────────────────────────────────────

describe('isVehicleSizeClass', () => {
  it('accepts the classes the CHECK constraint allows', () => {
    expect(isVehicleSizeClass('suv')).toBe(true);
    expect(isVehicleSizeClass('oversized')).toBe(true);
  });

  it('rejects anything the database would refuse', () => {
    expect(isVehicleSizeClass('spaceship')).toBe(false);
    expect(isVehicleSizeClass('')).toBe(false);
    expect(isVehicleSizeClass(null)).toBe(false);
    expect(isVehicleSizeClass(3)).toBe(false);
  });
});

describe('factorValueLabel', () => {
  it('labels each factor type from its own vocabulary', () => {
    expect(factorValueLabel('size_class', 'suv')).toBe('SUV / Crossover');
    expect(factorValueLabel('soil_level', 'heavy')).toBe('Heavily soiled');
    expect(factorValueLabel('pets', 'frequent')).toBe('Regularly');
    expect(factorValueLabel('stains', 'none')).toBe('None');
  });

  it('falls back to the raw value rather than rendering undefined', () => {
    expect(factorValueLabel('size_class', 'hovercraft')).toBe('hovercraft');
    expect(factorValueLabel('mystery', 'value')).toBe('value');
  });
});

// ── conditionAnswersFromJson ──────────────────────────────────────────

describe('conditionAnswersFromJson', () => {
  it('reads a well-formed answer set', () => {
    expect(
      conditionAnswersFromJson({
        soil_level: 'heavy',
        pets: 'frequent',
        stains: 'none',
      }),
    ).toEqual({ soil_level: 'heavy', pets: 'frequent', stains: 'none' });
  });

  it('keeps a partial answer set partial', () => {
    expect(conditionAnswersFromJson({ soil_level: 'light' })).toEqual({
      soil_level: 'light',
    });
  });

  // The validation trigger rejects these at write time, but drafts in client
  // state have not been near the database yet.
  it('drops values outside the grammar', () => {
    expect(
      conditionAnswersFromJson({ soil_level: 'filthy', pets: 'frequent' }),
    ).toEqual({ pets: 'frequent' });
  });

  it('ignores unknown keys', () => {
    expect(conditionAnswersFromJson({ soilLevel: 'heavy' })).toEqual({});
  });

  it('returns an empty set for a non-object', () => {
    expect(conditionAnswersFromJson(null)).toEqual({});
    expect(conditionAnswersFromJson(['heavy'])).toEqual({});
    expect(conditionAnswersFromJson('heavy')).toEqual({});
  });
});

describe('isConditionComplete', () => {
  it('requires all three questions', () => {
    expect(
      isConditionComplete({
        soil_level: 'light',
        pets: 'none',
        stains: 'none',
      }),
    ).toBe(true);
    expect(isConditionComplete({ soil_level: 'light', pets: 'none' })).toBe(
      false,
    );
    expect(isConditionComplete({})).toBe(false);
  });

  // 'none' is an answer, not an absence.
  it('counts a "none" answer as answered', () => {
    expect(
      isConditionComplete({ soil_level: 'light', pets: 'none', stains: 'none' }),
    ).toBe(true);
  });
});

// ── selectModifiers ───────────────────────────────────────────────────

describe('selectModifiers', () => {
  it('matches only the declared size and answered conditions', () => {
    const selected = selectModifiers(MODIFIERS, 'suv', {
      soil_level: 'heavy',
      pets: 'frequent',
      stains: 'none',
    });
    expect(selected.map((m) => m.id)).toEqual([
      'size_class-suv',
      'soil_level-heavy',
      'pets-frequent',
    ]);
  });

  // Unanswered is its own state: defaulting it would either bill for a
  // condition nobody claimed or under-quote the provider.
  it('matches nothing for an unanswered question', () => {
    const selected = selectModifiers(MODIFIERS, null, {});
    expect(selected).toEqual([]);
  });

  it('does not match a value against the wrong factor type', () => {
    const selected = selectModifiers(MODIFIERS, 'heavy', {});
    expect(selected).toEqual([]);
  });

  it('ignores an answer the provider has published no modifier for', () => {
    const selected = selectModifiers(MODIFIERS, 'sedan', {
      soil_level: 'light',
    });
    expect(selected).toEqual([]);
  });
});

// ── suggestDuration ───────────────────────────────────────────────────

describe('suggestDuration', () => {
  // The number the SQL test asserts: base 90 + suv 30 + heavy 45 + pets 20.
  it('sums the package base and every matching modifier', () => {
    const result = suggestDuration({
      baseMins: 90,
      sizeClass: 'suv',
      answers: { soil_level: 'heavy', pets: 'frequent', stains: 'none' },
      modifiers: MODIFIERS,
    });
    expect(result.totalMins).toBe(185);
    expect(result.deltaMins).toBe(95);
    expect(result.applied).toHaveLength(3);
  });

  it('returns the bare base when nothing was declared', () => {
    const result = suggestDuration({
      baseMins: 90,
      modifiers: MODIFIERS,
    });
    expect(result.totalMins).toBe(90);
    expect(result.deltaMins).toBe(0);
  });

  it('subtracts a negative modifier', () => {
    const result = suggestDuration({
      baseMins: 90,
      sizeClass: 'compact',
      modifiers: MODIFIERS,
    });
    expect(result.totalMins).toBe(75);
  });

  // A suggestion at or below zero reads downstream as "unknown duration",
  // which is the one thing the suggestion exists to prevent.
  it('floors the total rather than proposing a zero-minute job', () => {
    const result = suggestDuration({
      baseMins: 30,
      sizeClass: 'compact',
      answers: { soil_level: 'light' },
      modifiers: [
        modifier('size_class', 'compact', -240),
        modifier('soil_level', 'light', -240),
      ],
    });
    expect(result.totalMins).toBe(MIN_SUGGESTED_MINS);
  });

  // Not zero — resolveDurationMins draws the same distinction, so "ready by" is
  // absent rather than "ready immediately".
  it('returns null when no package declares a duration', () => {
    const result = suggestDuration({
      baseMins: 0,
      sizeClass: 'suv',
      modifiers: MODIFIERS,
    });
    expect(result.totalMins).toBeNull();
  });

  it('reports what applied, for the explanation under the estimate', () => {
    const result = suggestDuration({
      baseMins: 90,
      sizeClass: 'suv',
      modifiers: MODIFIERS,
    });
    expect(result.applied).toEqual([
      {
        factorType: 'size_class',
        factorValue: 'suv',
        label: 'SUV / Crossover',
        deltaMins: 30,
        deltaPrice: 0,
      },
    ]);
  });
});

describe('surchargeFromModifiers', () => {
  it('totals the price deltas of the applied modifiers', () => {
    const result = suggestDuration({
      baseMins: 90,
      sizeClass: 'suv',
      answers: { stains: 'heavy' },
      modifiers: [
        modifier('size_class', 'suv', 30, 30),
        modifier('stains', 'heavy', 20, 25),
        modifier('pets', 'frequent', 20, 15),
      ],
    });
    expect(surchargeFromModifiers(result)).toBe(55);
  });

  it('is zero when nothing applied', () => {
    const result = suggestDuration({ baseMins: 90, modifiers: MODIFIERS });
    expect(surchargeFromModifiers(result)).toBe(0);
  });
});
