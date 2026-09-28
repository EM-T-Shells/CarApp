// packages.ts — package tiers, advertised ranges and add-ons (spec §4, §6).
//
// A provider's menu is main services, optionally tiered (basic / standard /
// premium), each of which may carry add-ons: packages whose parent_package_id
// points at it. Migration 20260822000000 enforces the shape — one level deep,
// same provider, add-ons untiered — and refuses a booking that carries an
// add-on without its main service. This file is the display side of the same
// rules.
//
// The price shown is a RANGE, not a single figure (§6), because the quote can
// add surcharges. The range is honest about where those come from: the
// provider's own published modifiers (service_duration_modifiers.delta_price),
// which are also what QuoteBuilder pre-fills the surcharges from. The upper end
// is therefore what the pre-fill would add at most — not a cap, since §2
// dropped the price cap and a provider can itemise anything.

import type { ServiceDurationModifier, ServicePackage } from '../types/models';
import { formatDuration } from './duration';

// ── Tiers ─────────────────────────────────────────────────────────────

/** Mirrors service_packages_tier_check. */
export const PACKAGE_TIERS = ['basic', 'standard', 'premium'] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];

export const TIER_LABELS: Record<PackageTier, string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

export function isPackageTier(value: unknown): value is PackageTier {
  return (
    typeof value === 'string' &&
    (PACKAGE_TIERS as readonly string[]).includes(value)
  );
}

export function isAddOn(pkg: Pick<ServicePackage, 'parent_package_id'>): boolean {
  return pkg.parent_package_id != null;
}

// ── Menu shape ────────────────────────────────────────────────────────

export interface OrganizedPackages {
  /** Main services: tiered first, basic → premium, then untiered. */
  mains: ServicePackage[];
  /** Add-ons keyed by the main service they attach to. */
  addOnsByParent: Record<string, ServicePackage[]>;
}

function tierRank(tier: string | null): number {
  const index = (PACKAGE_TIERS as readonly (string | null)[]).indexOf(tier);
  return index === -1 ? PACKAGE_TIERS.length : index;
}

/**
 * Splits a provider's packages into main services and their add-ons.
 *
 * An add-on whose parent is not in the list — inactive, unapproved, or hidden
 * by RLS — is dropped: the database would refuse a booking carrying it without
 * its parent, so offering it would only produce a failed request.
 */
export function organizePackages(packages: ServicePackage[]): OrganizedPackages {
  const mains = packages
    .filter((pkg) => !isAddOn(pkg))
    .sort(
      (a, b) =>
        tierRank(a.tier) - tierRank(b.tier) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name),
    );

  const mainIds = new Set(mains.map((pkg) => pkg.id));
  const addOnsByParent: Record<string, ServicePackage[]> = {};
  for (const pkg of packages) {
    if (!pkg.parent_package_id || !mainIds.has(pkg.parent_package_id)) continue;
    (addOnsByParent[pkg.parent_package_id] ??= []).push(pkg);
  }
  for (const list of Object.values(addOnsByParent)) {
    list.sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
    );
  }

  return { mains, addOnsByParent };
}

// ── Ranges ────────────────────────────────────────────────────────────

/**
 * "2 hr–3 hr" when the package advertises a range, otherwise its single
 * duration, otherwise ''. The range is display only: duration_mins stays the
 * figure the suggestion engine and derive_booking_amounts use.
 */
export function durationRangeLabel(
  pkg: Pick<ServicePackage, 'duration_mins' | 'duration_min_mins' | 'duration_max_mins'>,
): string {
  const { duration_min_mins: min, duration_max_mins: max } = pkg;
  if (min != null && max != null && min > 0) {
    return min === max ? formatDuration(min) : `${formatDuration(min)}–${formatDuration(max)}`;
  }
  return formatDuration(pkg.duration_mins);
}

export interface CentsRange {
  minCents: number;
  maxCents: number;
}

/**
 * How much a provider's published modifiers can add to a job's price, in
 * cents.
 *
 * Per factor type the job matches at most one value (one size, one soil level,
 * …), so the most it can add is the largest surcharge of each type, summed
 * across types. Discount modifiers are ignored, matching surchargeLineItems:
 * QuoteBuilder only itemises surcharges, so no quote pre-fill can carry a
 * discount and the range must not promise one.
 */
export function modifierSurchargeRangeCents(
  modifiers: Pick<ServiceDurationModifier, 'factor_type' | 'delta_price'>[],
): CentsRange {
  const highest = new Map<string, number>();
  for (const modifier of modifiers) {
    const cents = Math.round(Number(modifier.delta_price ?? 0) * 100);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    highest.set(modifier.factor_type, Math.max(highest.get(modifier.factor_type) ?? 0, cents));
  }

  let maxCents = 0;
  for (const cents of highest.values()) maxCents += cents;
  return { minCents: 0, maxCents };
}

/**
 * The advertised price range for a package: its base price up to what the
 * provider's modifiers could add. Never below zero.
 */
export function advertisedPriceRangeCents(
  basePriceCents: number,
  modifiers: Pick<ServiceDurationModifier, 'factor_type' | 'delta_price'>[],
): CentsRange {
  const { minCents, maxCents } = modifierSurchargeRangeCents(modifiers);
  return {
    minCents: Math.max(basePriceCents + minCents, 0),
    maxCents: Math.max(basePriceCents + maxCents, 0),
  };
}
