/**
 * Typed route params for all dynamic Expo Router segments.
 * Used with useLocalSearchParams<T>() in screen components.
 *
 * Expo Router delivers all params as strings at runtime.
 */

// ── Auth ──────────────────────────────────────────────────────────────

/**
 * (auth)/otp-verify.tsx — one-time-code entry.
 * Must stay a type alias, not an interface: `useLocalSearchParams<T>()`
 * constrains T to `Record<string, string | string[]>`, and only type aliases
 * get the implicit index signature that satisfies it.
 */
export type OtpVerifyParams = {
  /** 'email' or 'phone'; any other value is treated as email. */
  method?: string;
  email?: string;
  phone?: string;
};

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
