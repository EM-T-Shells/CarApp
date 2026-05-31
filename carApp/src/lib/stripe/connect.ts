// Stripe Connect onboarding client — STUB (Flow 4.6).
//
// Kept separate from src/lib/stripe/index.ts (which handles deposit payment
// intents). Real implementation calls a Connect-onboarding Edge Function action
// to create/refresh an account link and returns its URL; on completion the
// provider's stripe_account_id is saved and bank_status advances. Requires:
//   • Stripe Connect platform enabled + STRIPE_SECRET_KEY (server) — 🔒 external
//
// Until then this returns { configured: false } and the Bank step shows a
// "not set up yet" message rather than a broken redirect.

export interface ConnectOnboardingResult {
  configured: boolean;
  /** Hosted Stripe Connect onboarding URL to open, when available. */
  url?: string;
  error?: string;
}

/** Start (or resume) Stripe Connect onboarding for a provider. STUB. */
export async function startConnectOnboarding(
  _providerId: string,
): Promise<ConnectOnboardingResult> {
  return {
    configured: false,
    error: 'Bank payouts (Stripe Connect) are not set up yet.',
  };
}
