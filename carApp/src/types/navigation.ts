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

// ── Bookings ──────────────────────────────────────────────────────────

/** (tabs)/bookings/[id].tsx */
export type BookingDetailParams = {
  id: string;
};

/** (tabs)/bookings/tracking/[bookingId].tsx */
export type BookingTrackingParams = {
  bookingId: string;
};

// ── Inbox ─────────────────────────────────────────────────────────────

/** (tabs)/inbox/[threadId].tsx */
export type MessageThreadParams = {
  threadId: string;
};
