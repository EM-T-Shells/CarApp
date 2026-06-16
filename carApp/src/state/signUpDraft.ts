// Zustand signUpDraft store — holds the in-progress customer sign-up
// state across the multi-step onboarding flow that runs the first
// time a new user lands on the app after verifying OTP or completing
// an OAuth sign-in.
//
// The flow is:
//   1. role          — customer / provider / both (RoleSelector)
//   2. profile       — full name, phone, address (customer/both)
//   3. vehicle       — primary vehicle details    (VehicleForm)
//
// Customer/both submit at the end of the vehicle step and the root auth
// gate routes them into the main nav. Provider-only signups skip the
// vehicle step and submit on the (untracked) review screen instead.
//
// On successful submit, signUpSubmit.ts writes the rows and calls
// `reset()` on this store. On cancel (user backs out entirely) the
// root auth gate also calls reset to avoid leaking stale state.

import { create } from 'zustand';
import type { UserRole } from './auth';

// ── Step Definition ────────────────────────────────────────────────────

// The three tracked, indicator-backed steps. The provider-only "review"
// screen is a terminal screen reached by explicit navigation and is not
// part of this list (it shares step index 2 with the vehicle step).
export const SIGN_UP_STEPS = ['role', 'profile', 'vehicle'] as const;
export type SignUpStep = (typeof SIGN_UP_STEPS)[number];

// ── Draft Shape ────────────────────────────────────────────────────────

export interface VehicleDraft {
  year: string;
  make: string;
  model: string;
  trim: string | null;
  color: string | null;
  licensePlate: string | null;
}

/** Editable profile fields captured on the profile step. */
export interface ProfileFields {
  fullName: string;
  avatarUrl: string | null;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface SignUpDraftState {
  // Step tracking
  currentStep: SignUpStep;

  // Profile (maps to users row)
  fullName: string;
  avatarUrl: string | null;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;

  // Role (maps to users.role)
  role: UserRole | null;

  // Vehicle (maps to vehicles row; optional for provider-only signup)
  vehicle: VehicleDraft;

  // ── Mutators ─────────────────────────────────────────────────────────

  setStep: (step: SignUpStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  /** Merge a partial profile patch (name, phone, address fields). */
  setProfile: (patch: Partial<ProfileFields>) => void;
  setRole: (role: UserRole) => void;
  setVehicle: (patch: Partial<VehicleDraft>) => void;

  /** Clear all draft state back to defaults. */
  reset: () => void;
}

// ── Defaults ────────────────────────────────────────────────────────────

const emptyVehicle: VehicleDraft = {
  year: '',
  make: '',
  model: '',
  trim: null,
  color: null,
  licensePlate: null,
};

const initialState = {
  currentStep: 'role' as SignUpStep,
  fullName: '',
  avatarUrl: null as string | null,
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  role: null as UserRole | null,
  vehicle: { ...emptyVehicle },
};

// ── Step Navigation Helpers ────────────────────────────────────────────

function advance(step: SignUpStep, delta: 1 | -1): SignUpStep {
  const idx = SIGN_UP_STEPS.indexOf(step);
  const next = Math.min(Math.max(idx + delta, 0), SIGN_UP_STEPS.length - 1);
  return SIGN_UP_STEPS[next];
}

// ── Store ───────────────────────────────────────────────────────────────

export const useSignUpDraftStore = create<SignUpDraftState>((set) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((s) => ({ currentStep: advance(s.currentStep, 1) })),
  prevStep: () => set((s) => ({ currentStep: advance(s.currentStep, -1) })),

  setProfile: (patch) => set((s) => ({ ...s, ...patch })),

  setRole: (role) => set({ role }),

  setVehicle: (patch) =>
    set((s) => ({ vehicle: { ...s.vehicle, ...patch } })),

  reset: () => set({ ...initialState, vehicle: { ...emptyVehicle } }),
}));

// ── Selectors ───────────────────────────────────────────────────────────

/** Zero-based index of the current step — useful for the StepIndicator. */
export const selectStepIndex = (s: SignUpDraftState): number =>
  SIGN_UP_STEPS.indexOf(s.currentStep);

/** True when the profile step has the minimum required info (name + phone). */
export const selectProfileComplete = (s: SignUpDraftState): boolean =>
  s.fullName.trim().length >= 2 && s.phone.trim().length > 0;

/**
 * True when a customer/both account has a complete mailing address.
 * Providers don't enter an address on this step, so callers should only
 * gate on this for customer/both roles.
 */
export const selectAddressComplete = (s: SignUpDraftState): boolean =>
  s.addressLine1.trim().length > 0 &&
  s.city.trim().length > 0 &&
  s.state.trim().length > 0 &&
  s.postalCode.trim().length > 0;

/** True when the role step has a valid selection. */
export const selectRoleComplete = (s: SignUpDraftState): boolean =>
  s.role !== null;

/** True when the vehicle step has the minimum required info. */
export const selectVehicleComplete = (s: SignUpDraftState): boolean =>
  s.vehicle.year.trim().length > 0 &&
  s.vehicle.make.trim().length > 0 &&
  s.vehicle.model.trim().length > 0;
