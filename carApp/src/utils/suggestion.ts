// suggestion.ts (Phase 2) — the duration suggestion engine, client side.
//
// Mirrors derive_booking_suggestion() in migration 20260820000000, the same way
// money.ts mirrors derive_booking_amounts(). The database is authoritative:
// suggested_duration_mins is outside the client's INSERT allowlist, so whatever
// this computes is display only and the stored value comes from the trigger.
//
// Both exist because they answer at different times. The customer needs to see
// "about 3 hours" while they are still choosing add-ons, before a row exists to
// trigger anything; the provider needs the stored number to be one the client
// could not have invented. Keeping the arithmetic identical is what stops the
// estimate shown at checkout from disagreeing with the one on the request card
// — so if you change one, change the other, and the SQL test asserts the
// numbers this file's tests assert.

import type { ServiceDurationModifier } from '../types/models';

// ── Vocabulary ────────────────────────────────────────────────────────
// These lists are the CHECK constraints in 20260820000000. A value absent here
// is refused by the database, so they are not merely UI copy.

export const VEHICLE_SIZE_CLASSES = [
  'compact',
  'sedan',
  'suv',
  'truck',
  'van',
  'oversized',
] as const;
export type VehicleSizeClass = (typeof VEHICLE_SIZE_CLASSES)[number];

export const SOIL_LEVELS = ['light', 'moderate', 'heavy'] as const;
export type SoilLevel = (typeof SOIL_LEVELS)[number];

export const PET_LEVELS = ['none', 'occasional', 'frequent'] as const;
export type PetLevel = (typeof PET_LEVELS)[number];

export const STAIN_LEVELS = ['none', 'some', 'heavy'] as const;
export type StainLevel = (typeof STAIN_LEVELS)[number];

export type ConditionAnswers = {
  soil_level?: SoilLevel;
  pets?: PetLevel;
  stains?: StainLevel;
};

/** The factor keys service_duration_modifiers.factor_type accepts. */
export const FACTOR_TYPES = [
  'size_class',
  'soil_level',
  'pets',
  'stains',
] as const;
export type FactorType = (typeof FACTOR_TYPES)[number];

export const FACTOR_VALUES: Record<FactorType, readonly string[]> = {
  size_class: VEHICLE_SIZE_CLASSES,
  soil_level: SOIL_LEVELS,
  pets: PET_LEVELS,
  stains: STAIN_LEVELS,
};

// ── Labels ────────────────────────────────────────────────────────────

export const VEHICLE_SIZE_LABELS: Record<VehicleSizeClass, string> = {
  compact: 'Compact',
  sedan: 'Sedan',
  suv: 'SUV / Crossover',
  truck: 'Truck',
  van: 'Van / Minivan',
  oversized: 'Oversized',
};

export const SOIL_LEVEL_LABELS: Record<SoilLevel, string> = {
  light: 'Lightly used',
  moderate: 'Normal wear',
  heavy: 'Heavily soiled',
};

export const PET_LEVEL_LABELS: Record<PetLevel, string> = {
  none: 'No kids or pets',
  occasional: 'Sometimes',
  frequent: 'Regularly',
};

export const STAIN_LEVEL_LABELS: Record<StainLevel, string> = {
  none: 'None',
  some: 'A few spots',
  heavy: 'Heavy stains, smoke or pet hair',
};

export const FACTOR_TYPE_LABELS: Record<FactorType, string> = {
  size_class: 'Vehicle size',
  soil_level: 'Interior condition',
  pets: 'Kids or pets',
  stains: 'Stains, smoke or pet hair',
};

/** The display label for any factor value, whatever its type. */
export function factorValueLabel(
  factorType: string,
  factorValue: string,
): string {
  switch (factorType) {
    case 'size_class':
      return VEHICLE_SIZE_LABELS[factorValue as VehicleSizeClass] ?? factorValue;
    case 'soil_level':
      return SOIL_LEVEL_LABELS[factorValue as SoilLevel] ?? factorValue;
    case 'pets':
      return PET_LEVEL_LABELS[factorValue as PetLevel] ?? factorValue;
    case 'stains':
      return STAIN_LEVEL_LABELS[factorValue as StainLevel] ?? factorValue;
    default:
      return factorValue;
  }
}

// ── Parsing ───────────────────────────────────────────────────────────

export function isVehicleSizeClass(value: unknown): value is VehicleSizeClass {
  return (
    typeof value === 'string' &&
    (VEHICLE_SIZE_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * Reads a stored condition_answers column back into a typed object.
 *
 * Drops anything the database grammar would not have accepted rather than
 * carrying it through. A row can only hold valid answers today (the validation
 * trigger sees to that), but this also runs on drafts held in client state,
 * which nothing has validated yet.
 */
export function conditionAnswersFromJson(value: unknown): ConditionAnswers {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const answers: ConditionAnswers = {};

  if ((SOIL_LEVELS as readonly unknown[]).includes(raw.soil_level)) {
    answers.soil_level = raw.soil_level as SoilLevel;
  }
  if ((PET_LEVELS as readonly unknown[]).includes(raw.pets)) {
    answers.pets = raw.pets as PetLevel;
  }
  if ((STAIN_LEVELS as readonly unknown[]).includes(raw.stains)) {
    answers.stains = raw.stains as StainLevel;
  }
  return answers;
}

/** True when every question has been answered — the intake step's gate. */
export function isConditionComplete(answers: ConditionAnswers): boolean {
  return (
    answers.soil_level !== undefined &&
    answers.pets !== undefined &&
    answers.stains !== undefined
  );
}

// ── The engine ────────────────────────────────────────────────────────

/**
 * The floor the SQL applies. A provider's modifiers can legitimately sum
 * negative, and a suggestion at or below zero reads downstream as "duration
 * unknown" — the one thing the suggestion exists to prevent.
 */
export const MIN_SUGGESTED_MINS = 15;

export interface SuggestionInput {
  /** Summed duration_mins of the chosen packages. */
  baseMins: number;
  sizeClass?: string | null;
  answers?: ConditionAnswers | null;
  modifiers: ServiceDurationModifier[];
}

export interface SuggestionBreakdown {
  /** Null when no package carries a duration — never 0, which reads as instant. */
  totalMins: number | null;
  baseMins: number;
  /** Every modifier that matched, for the "why" line under the estimate. */
  applied: {
    factorType: string;
    factorValue: string;
    label: string;
    deltaMins: number;
    deltaPrice: number;
  }[];
  deltaMins: number;
}

/**
 * Which modifiers apply to a given size and set of answers.
 *
 * An unanswered question matches nothing. That is deliberate and matches the
 * SQL: defaulting an unanswered soil level to 'moderate' would quietly bill a
 * customer for a condition they never claimed, and defaulting it to 'light'
 * would under-quote the provider. Unanswered is its own state.
 */
export function selectModifiers(
  modifiers: ServiceDurationModifier[],
  sizeClass?: string | null,
  answers?: ConditionAnswers | null,
): ServiceDurationModifier[] {
  const wanted = new Map<string, string>();
  if (sizeClass) wanted.set('size_class', sizeClass);
  if (answers?.soil_level) wanted.set('soil_level', answers.soil_level);
  if (answers?.pets) wanted.set('pets', answers.pets);
  if (answers?.stains) wanted.set('stains', answers.stains);

  return modifiers.filter(
    (m) => wanted.get(m.factor_type) === m.factor_value,
  );
}

export function suggestDuration(input: SuggestionInput): SuggestionBreakdown {
  const { baseMins, sizeClass, answers, modifiers } = input;

  const applicable = selectModifiers(modifiers, sizeClass, answers);
  const deltaMins = applicable.reduce((sum, m) => sum + (m.delta_mins ?? 0), 0);

  const applied = applicable.map((m) => ({
    factorType: m.factor_type,
    factorValue: m.factor_value,
    label: factorValueLabel(m.factor_type, m.factor_value),
    deltaMins: m.delta_mins ?? 0,
    deltaPrice: Number(m.delta_price ?? 0),
  }));

  // A base of zero means no chosen package declares a duration, which is not
  // the same as a zero-minute job. The SQL returns NULL here for the same
  // reason resolveDurationMins does.
  const totalMins =
    baseMins > 0 ? Math.max(baseMins + deltaMins, MIN_SUGGESTED_MINS) : null;

  return { totalMins, baseMins, applied, deltaMins };
}

/**
 * The price side of the same modifiers.
 *
 * Returned separately from the duration and NOT summed into any total, because
 * Phase 2 does not price from modifiers at all — derive_booking_amounts still
 * computes every money column from service_packages alone. This exists so the
 * provider's modifier editor can show what they have configured; wiring it into
 * a charge is Phase 3's quote, which goes through an Edge Function.
 */
export function surchargeFromModifiers(
  breakdown: SuggestionBreakdown,
): number {
  return breakdown.applied.reduce((sum, m) => sum + m.deltaPrice, 0);
}
