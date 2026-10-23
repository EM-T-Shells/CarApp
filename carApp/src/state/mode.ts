// Zustand active-mode store — holds which dashboard a dual-role ('both')
// user is currently acting in: the Customer tab bar or the Provider tab bar.
//
// This value has no column on the `users` table — it's a purely client-side
// "which persona am I using right now" preference — so it is persisted locally
// on the device via AsyncStorage (same pattern as settings.ts). Persisting it
// means a dual user who left off in Provider mode re-opens the app straight
// into the provider dashboard.
//
// Only `role === 'both'` accounts ever consult this: the root auth gate
// (app/_layout.tsx) has a fixed destination for pure customer / pure provider
// accounts and never reads activeMode for them. It is only ever *set* by the
// two "Switch dashboard" controls (customer More hub + provider More hub).
//
// New global state lives in its own domain file per CLAUDE.md — do not fold
// this into auth.ts.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── State Shape ─────────────────────────────────────────────────────────

/** Which dashboard a dual-role user is currently viewing. */
export type ActiveMode = 'customer' | 'provider';

export interface ModeState {
  /** The dashboard the user is currently acting in. Defaults to 'customer'. */
  activeMode: ActiveMode;
  /** True until the persisted state has rehydrated from AsyncStorage. */
  hydrated: boolean;

  // ── Mutators ─────────────────────────────────────────────────────────

  /** Switch the active dashboard. */
  setActiveMode: (mode: ActiveMode) => void;
  /** Reset to the customer dashboard (used on sign-out / tests). */
  reset: () => void;
}

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_MODE: ActiveMode = 'customer';

// ── Store ───────────────────────────────────────────────────────────────

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      activeMode: DEFAULT_MODE,
      hydrated: false,

      setActiveMode: (mode) => set({ activeMode: mode }),

      reset: () => set({ activeMode: DEFAULT_MODE }),
    }),
    {
      name: 'carapp.mode',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the mode itself — not the hydration flag.
      partialize: (s) => ({ activeMode: s.activeMode }),
      // Flip `hydrated` once AsyncStorage has finished rehydrating so the
      // auth gate can avoid routing on a stale default before the real
      // persisted mode is known.
      onRehydrateStorage: () => () => {
        useModeStore.setState({ hydrated: true });
      },
    },
  ),
);

// ── Selectors ───────────────────────────────────────────────────────────

/** The current active dashboard mode. */
export const selectActiveMode = (s: ModeState): ActiveMode => s.activeMode;

/** True when the user is currently in the provider dashboard. */
export const selectIsProviderMode = (s: ModeState): boolean =>
  s.activeMode === 'provider';
