/**
 * Typed route params for all dynamic Expo Router segments.
 * Used with useLocalSearchParams<T>() in screen components.
 *
 * Expo Router delivers all params as strings at runtime.
 */

// ── Search ────────────────────────────────────────────────────────────

/** (tabs)/search/provider/[id].tsx */
export type ProviderDetailParams = {
  id: string;
};

/** (tabs)/search/book/[providerId].tsx */
export type BookProviderParams = {
  providerId: string;
};

// ── Services ──────────────────────────────────────────────────────────

/** (tabs)/services/[catalogId].tsx — providers offering a catalog service */
export type ServiceProvidersParams = {
  catalogId: string;
  /** Service name, passed through for the screen header. */
  name?: string;
};

// ── Bookings ──────────────────────────────────────────────────────────

/** (tabs)/bookings/[id].tsx */
export type BookingDetailParams = {
  id: string;
};

/** (tabs)/bookings/tracking/[bookingId].tsx */
export type BookingTrackingParams = {
  bookingId: string;
};

// ── Provider dashboard ────────────────────────────────────────────────

/** (provider-tabs)/jobs/[bookingId].tsx — provider active-job view */
export type ProviderJobParams = {
  bookingId: string;
};

// ── Inbox ─────────────────────────────────────────────────────────────

/** (tabs)/inbox/[threadId].tsx */
export type MessageThreadParams = {
  threadId: string;
};
