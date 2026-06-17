// Zustand settings store — holds the user's notification preferences.
//
// These preferences have no column on the `users` table (and we are not
// running a schema migration for them yet), so they are persisted locally
// on the device via AsyncStorage. Once FCM push registration lands
// (Flow 2.9) and/or a server-side settings column exists, the notify-*
// Edge Functions should read these to decide whether to deliver a push.
//
// New global state lives in its own domain file per CLAUDE.md — do not fold
// this into auth.ts.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── State Shape ─────────────────────────────────────────────────────────

/** Toggleable push/notification categories surfaced on the Settings screen. */
export interface NotificationPreferences {
  /** Booking confirmed / status changes for the customer's own bookings. */
  bookingUpdates: boolean;
  /** Provider en-route + arrival alerts during an active booking. */
  providerEnRoute: boolean;
  /** New in-app messages from a provider (or support). */
  messages: boolean;
  /** Marketing — promotions, offers, and product news. */
  promotions: boolean;
}

export type NotificationPreferenceKey = keyof NotificationPreferences;

export interface SettingsState {
  notifications: NotificationPreferences;
  /** True until the persisted state has rehydrated from AsyncStorage. */
  hydrated: boolean;

  // ── Mutators ─────────────────────────────────────────────────────────

  /** Flip a single notification category. */
  toggleNotification: (key: NotificationPreferenceKey) => void;
  /** Replace all notification preferences at once. */
  setNotifications: (prefs: Partial<NotificationPreferences>) => void;
  /** Reset to defaults (used on sign-out / tests). */
  reset: () => void;
}

// ── Defaults ────────────────────────────────────────────────────────────

const defaultNotifications: NotificationPreferences = {
  bookingUpdates: true,
  providerEnRoute: true,
  messages: true,
  promotions: false,
};

// ── Store ───────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      notifications: { ...defaultNotifications },
      hydrated: false,

      toggleNotification: (key) =>
        set((s) => ({
          notifications: {
            ...s.notifications,
            [key]: !s.notifications[key],
          },
        })),

      setNotifications: (prefs) =>
        set((s) => ({
          notifications: { ...s.notifications, ...prefs },
        })),

      reset: () => set({ notifications: { ...defaultNotifications } }),
    }),
    {
      name: 'carapp.settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the preferences themselves — not the hydration flag.
      partialize: (s) => ({ notifications: s.notifications }),
      // Flip `hydrated` once AsyncStorage has finished rehydrating so the
      // Settings screen can avoid flashing default toggle positions.
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);

// ── Selectors ───────────────────────────────────────────────────────────

export const selectNotifications = (s: SettingsState): NotificationPreferences =>
  s.notifications;
