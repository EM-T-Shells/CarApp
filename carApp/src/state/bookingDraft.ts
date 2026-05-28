// Zustand booking draft store — holds the in-progress booking being built
// by the customer in the booking flow. Tracks selected provider, services,
// vehicle, address, scheduled time, and computed price breakdown.
//
// This store is populated step-by-step as the customer moves through the
// booking screen and is cleared on successful submission or abandonment.

import { create } from 'zustand';
import type { ServicePackage } from '../types/models';
import {
  calculateDeposit,
  calculateServiceFee,
} from '../utils/money';

// ── Types ─────────────────────────────────────────────────────────────

export interface ServiceSnapshot {
  id: string;
  name: string;
  description: string | null;
  category: string;
  base_price: number;
  duration_mins: number | null;
}

export interface BookingDraftState {
  /** Provider profile ID being booked. */
  providerId: string | null;
  /** Provider user-facing name (for display in the flow). */
  providerName: string | null;
  /** Selected services snapshotted at selection time. Prices in cents. */
  selectedServices: ServiceSnapshot[];
  /** Customer vehicle ID to be serviced. */
  vehicleId: string | null;
  /** Service address entered by the customer. */
  serviceAddress: string;
  /** Latitude of the service location. */
  locationLat: number | null;
  /** Longitude of the service location. */
  locationLng: number | null;
  /** Scheduled date/time as ISO string. */
  scheduledAt: string | null;
  /** Free-text notes from the customer. */
  notes: string;

  // ── Mutators ──────────────────────────────────────────────────────

  setProvider: (providerId: string, providerName: string) => void;
  toggleService: (pkg: ServicePackage) => void;
  setVehicleId: (vehicleId: string) => void;
  setServiceAddress: (address: string) => void;
  setLocation: (lat: number, lng: number) => void;
  setScheduledAt: (iso: string) => void;
  setNotes: (notes: string) => void;
  reset: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

function snapshotService(pkg: ServicePackage): ServiceSnapshot {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description ?? null,
    category: pkg.category,
    base_price: Math.round(Number(pkg.base_price ?? 0) * 100),
    duration_mins: pkg.duration_mins,
  };
}

// ── Initial State ─────────────────────────────────────────────────────

const INITIAL_STATE = {
  providerId: null,
  providerName: null,
  selectedServices: [] as ServiceSnapshot[],
  vehicleId: null,
  serviceAddress: '',
  locationLat: null,
  locationLng: null,
  scheduledAt: null,
  notes: '',
};

// ── Store ─────────────────────────────────────────────────────────────

export const useBookingDraftStore = create<BookingDraftState>((set) => ({
  ...INITIAL_STATE,

  setProvider: (providerId, providerName) =>
    set({ providerId, providerName }),

  toggleService: (pkg) =>
    set((s) => {
      const exists = s.selectedServices.some((svc) => svc.id === pkg.id);
      if (exists) {
        return {
          selectedServices: s.selectedServices.filter(
            (svc) => svc.id !== pkg.id,
          ),
        };
      }
      return {
        selectedServices: [...s.selectedServices, snapshotService(pkg)],
      };
    }),

  setVehicleId: (vehicleId) => set({ vehicleId }),

  setServiceAddress: (serviceAddress) => set({ serviceAddress }),

  setLocation: (lat, lng) =>
    set({ locationLat: lat, locationLng: lng }),

  setScheduledAt: (scheduledAt) => set({ scheduledAt }),

  setNotes: (notes) => set({ notes }),

  reset: () => set({ ...INITIAL_STATE }),
}));

// ── Selectors ─────────────────────────────────────────────────────────

/** Sum of all selected service prices in cents. */
export function selectSubtotalCents(s: BookingDraftState): number {
  return s.selectedServices.reduce((sum, svc) => sum + svc.base_price, 0);
}

/** 2% customer service fee in cents. */
export function selectServiceFeeCents(s: BookingDraftState): number {
  return calculateServiceFee(selectSubtotalCents(s));
}

/** Subtotal + service fee in cents. */
export function selectTotalCents(s: BookingDraftState): number {
  return selectSubtotalCents(s) + selectServiceFeeCents(s);
}

/** 15% deposit due at booking in cents. */
export function selectDepositCents(s: BookingDraftState): number {
  return calculateDeposit(selectTotalCents(s));
}

/** Remaining balance due on job completion in cents. */
export function selectBalanceCents(s: BookingDraftState): number {
  return selectTotalCents(s) - selectDepositCents(s);
}

/** Estimated total duration in minutes. */
export function selectEstimatedDuration(s: BookingDraftState): number {
  return s.selectedServices.reduce(
    (sum, svc) => sum + (svc.duration_mins ?? 0),
    0,
  );
}

/** True when the draft has all required fields filled for submission. */
export function selectIsReadyToBook(s: BookingDraftState): boolean {
  return (
    s.providerId !== null &&
    s.selectedServices.length > 0 &&
    s.vehicleId !== null &&
    s.serviceAddress.trim().length > 0 &&
    s.scheduledAt !== null
  );
}

/** True when at least one service is selected. */
export function selectHasServices(s: BookingDraftState): boolean {
  return s.selectedServices.length > 0;
}
