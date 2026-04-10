// Zustand providerDraft store — holds the in-progress provider
// onboarding state across the multi-step vetting flow that runs
// when a user opts into provider mode.
//
// Steps mirror the six vetting checks the provider must clear before
// `provider_vetting.verification_status` can flip to `approved`:
//
//   1. profile      — bio, coverage area, radius, provider type
//   2. services     — picks from service_catalog (+ custom packages)
//   3. identity     — Persona inquiry id (handled via src/lib/persona)
//   4. background   — Checkr report id (handled via src/lib/checkr)
//   5. insurance    — uploaded credential docs
//   6. credentials  — extra credential docs
//   7. bank         — Stripe Connect account id
//
// The draft is scoped to the onboarding flow. Once all steps are
// complete, mutations.ts writes the provider_profiles +
// provider_vetting + service_packages rows and calls reset().

import { create } from 'zustand';

// ── Steps ───────────────────────────────────────────────────────────────

export const PROVIDER_VETTING_STEPS = [
  'profile',
  'services',
  'identity',
  'background',
  'insurance',
  'credentials',
  'bank',
] as const;
export type ProviderVettingStep = (typeof PROVIDER_VETTING_STEPS)[number];

/**
 * Vetting status for each step. Mirrors the string values used in
 * the `provider_vetting` table.
 */
export type VettingStepStatus =
  | 'not_started'
  | 'pending'
  | 'submitted'
  | 'approved'
  | 'rejected';

// ── Draft Shape ────────────────────────────────────────────────────────

export interface ProviderProfileDraft {
  providerTypeId: string | null;
  bio: string;
  coverageArea: string;
  mileRadius: number;
}

export interface ServicePackageDraft {
  /** FK to service_catalog.id when catalogId is set, else a custom pkg. */
  catalogId: string | null;
  name: string;
  category: string;
  /** Base price in cents — consistent with bookings.total_amount. */
  basePrice: number;
  durationMins: number;
  description: string | null;
  isCustom: boolean;
}

export interface VettingStatuses {
  identity: VettingStepStatus;
  background: VettingStepStatus;
  insurance: VettingStepStatus;
  credentials: VettingStepStatus;
  bank: VettingStepStatus;
}

export interface ProviderDraftState {
  currentStep: ProviderVettingStep;

  profile: ProviderProfileDraft;
  services: ServicePackageDraft[];

  /** Persona inquiry id returned from the identity step. */
  personaInquiryId: string | null;
  /** Checkr report id returned from the background step. */
  checkrReportId: string | null;
  /** Stripe Connect account id returned from the bank step. */
  stripeAccountId: string | null;

  statuses: VettingStatuses;

  // ── Mutators ─────────────────────────────────────────────────────────

  setStep: (step: ProviderVettingStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  setProfile: (patch: Partial<ProviderProfileDraft>) => void;

  addService: (service: ServicePackageDraft) => void;
  removeService: (catalogId: string | null, name: string) => void;
  clearServices: () => void;

  setPersonaInquiryId: (id: string | null) => void;
  setCheckrReportId: (id: string | null) => void;
  setStripeAccountId: (id: string | null) => void;

  setStatus: (step: keyof VettingStatuses, status: VettingStepStatus) => void;

  reset: () => void;
}

// ── Defaults ────────────────────────────────────────────────────────────

const defaultProfile: ProviderProfileDraft = {
  providerTypeId: null,
  bio: '',
  coverageArea: '',
  mileRadius: 25,
};

const defaultStatuses: VettingStatuses = {
  identity: 'not_started',
  background: 'not_started',
  insurance: 'not_started',
  credentials: 'not_started',
  bank: 'not_started',
};

const initialState = {
  currentStep: 'profile' as ProviderVettingStep,
  profile: { ...defaultProfile },
  services: [] as ServicePackageDraft[],
  personaInquiryId: null as string | null,
  checkrReportId: null as string | null,
  stripeAccountId: null as string | null,
  statuses: { ...defaultStatuses },
};

// ── Step Navigation Helpers ────────────────────────────────────────────

function advance(
  step: ProviderVettingStep,
  delta: 1 | -1,
): ProviderVettingStep {
  const idx = PROVIDER_VETTING_STEPS.indexOf(step);
  const next = Math.min(
    Math.max(idx + delta, 0),
    PROVIDER_VETTING_STEPS.length - 1,
  );
  return PROVIDER_VETTING_STEPS[next];
}

// ── Store ───────────────────────────────────────────────────────────────

export const useProviderDraftStore = create<ProviderDraftState>((set) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: advance(s.currentStep, 1) })),
  prevStep: () => set((s) => ({ currentStep: advance(s.currentStep, -1) })),

  setProfile: (patch) =>
    set((s) => ({ profile: { ...s.profile, ...patch } })),

  addService: (service) =>
    set((s) => {
      const exists = s.services.some(
        (x) =>
          (service.catalogId !== null && x.catalogId === service.catalogId) ||
          (service.catalogId === null &&
            x.catalogId === null &&
            x.name === service.name),
      );
      if (exists) return s;
      return { services: [...s.services, service] };
    }),

  removeService: (catalogId, name) =>
    set((s) => ({
      services: s.services.filter((x) => {
        if (catalogId !== null) return x.catalogId !== catalogId;
        return !(x.catalogId === null && x.name === name);
      }),
    })),

  clearServices: () => set({ services: [] }),

  setPersonaInquiryId: (id) => set({ personaInquiryId: id }),
  setCheckrReportId: (id) => set({ checkrReportId: id }),
  setStripeAccountId: (id) => set({ stripeAccountId: id }),

  setStatus: (step, status) =>
    set((s) => ({ statuses: { ...s.statuses, [step]: status } })),

  reset: () =>
    set({
      ...initialState,
      profile: { ...defaultProfile },
      services: [],
      statuses: { ...defaultStatuses },
    }),
}));

// ── Selectors ───────────────────────────────────────────────────────────

export const selectStepIndex = (s: ProviderDraftState): number =>
  PROVIDER_VETTING_STEPS.indexOf(s.currentStep);

/** True when the profile step has the minimum required info. */
export const selectProfileStepComplete = (s: ProviderDraftState): boolean =>
  s.profile.providerTypeId !== null &&
  s.profile.bio.trim().length >= 20 &&
  s.profile.coverageArea.trim().length > 0 &&
  s.profile.mileRadius > 0;

/** True when the services step has at least one service selected. */
export const selectServicesStepComplete = (s: ProviderDraftState): boolean =>
  s.services.length > 0;

/** True when all 5 vetting-side steps are approved. */
export const selectAllStepsApproved = (s: ProviderDraftState): boolean =>
  s.statuses.identity === 'approved' &&
  s.statuses.background === 'approved' &&
  s.statuses.insurance === 'approved' &&
  s.statuses.credentials === 'approved' &&
  s.statuses.bank === 'approved';

/**
 * Rough profile-completeness score used as a proxy for the
 * `provider_vetting.profile_completeness` column. Ranges 0–100.
 */
export const selectProfileCompleteness = (s: ProviderDraftState): number => {
  let score = 0;
  if (s.profile.providerTypeId !== null) score += 20;
  if (s.profile.bio.trim().length >= 20) score += 20;
  if (s.profile.coverageArea.trim().length > 0) score += 20;
  if (s.profile.mileRadius > 0) score += 10;
  if (s.services.length > 0) score += 30;
  return score;
};
