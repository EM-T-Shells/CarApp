// Zustand auth store — holds the authenticated Supabase session, the
// corresponding `users` row, and the derived role flags used to gate
// navigation and provider-only UI.
//
// This store is hydrated by app/_layout.tsx via onAuthStateChange. It
// should never be mutated directly from screens — use setSession and
// clear, which are the only mutators this store exposes.

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types/models';

// ── Roles ───────────────────────────────────────────────────────────────

/**
 * Role values stored in `users.role`. Mirrors the check constraint in
 * carApp/supabase/schema.sql on the `users` table.
 */
export type UserRole = 'customer' | 'provider' | 'both';

/** Mirrors provider_profiles.verification_status. */
export type ProviderVerificationStatus = 'pending' | 'approved' | 'suspended';

// ── State Shape ─────────────────────────────────────────────────────────

export interface AuthState {
  /** Current Supabase auth session, or null when signed out. */
  session: Session | null;
  /** Hydrated row from the `users` table for the signed-in user. */
  user: User | null;
  /** Role string pulled from `user.role`, or null when signed out. */
  role: UserRole | null;
  /**
   * The signed-in provider's `provider_profiles.verification_status`, when the
   * user has a provider role. `null` means "not a provider, or not yet
   * resolved" — the root gate waits for a non-null value before deciding
   * whether to hold a provider-only user on the pending-approval screen.
   */
  providerVerification: ProviderVerificationStatus | null;
  /**
   * True while the root auth gate is still resolving the initial
   * session from SecureStore. Screens should render a splash while
   * this is true to avoid flashing the sign-in screen on cold start.
   */
  isHydrating: boolean;

  // ── Mutators ─────────────────────────────────────────────────────────

  /**
   * Set the current session and hydrated user row. Passing null for
   * either clears the store. Also flips `isHydrating` to false.
   */
  setSession: (session: Session | null, user: User | null) => void;
  /** Set the provider's verification status (or null when not a provider). */
  setProviderVerification: (status: ProviderVerificationStatus | null) => void;
  /** Clear the store back to signed-out state. */
  clear: () => void;
  /** Mark hydration complete without setting a session. */
  finishHydration: () => void;
}

// ── Role Helpers ────────────────────────────────────────────────────────

function resolveRole(user: User | null): UserRole | null {
  if (!user) return null;
  const raw = user.role;
  if (raw === 'customer' || raw === 'provider' || raw === 'both') {
    return raw;
  }
  return 'customer';
}

// ── Store ───────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  providerVerification: null,
  isHydrating: true,

  setSession: (session, user) =>
    set({
      session,
      user,
      role: resolveRole(user),
      isHydrating: false,
    }),

  setProviderVerification: (status) => set({ providerVerification: status }),

  clear: () =>
    set({
      session: null,
      user: null,
      role: null,
      providerVerification: null,
      isHydrating: false,
    }),

  finishHydration: () => set({ isHydrating: false }),
}));

// ── Selectors ───────────────────────────────────────────────────────────

/** True when there is an authenticated session. */
export const selectIsAuthenticated = (s: AuthState): boolean =>
  s.session !== null;

/** True when the signed-in user has any provider role. */
export const selectIsProvider = (s: AuthState): boolean =>
  s.role === 'provider' || s.role === 'both';

/** True when the signed-in user is acting as a customer. */
export const selectIsCustomer = (s: AuthState): boolean =>
  s.role === 'customer' || s.role === 'both';
