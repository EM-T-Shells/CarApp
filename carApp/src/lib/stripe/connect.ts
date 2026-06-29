// Stripe Connect onboarding client (Flow 4.6).
//
// Kept separate from src/lib/stripe/index.ts (which handles deposit payment
// intents). Talks to the stripe-webhook Edge Function:
//   • connect_onboarding — creates/reuses the provider's Express account and
//     returns a hosted onboarding URL to open.
//   • connect_status — re-checks the account after the provider returns and
//     reports whether payouts are enabled yet.
//
// Requires Stripe Connect (Express) enabled on the platform + STRIPE_SECRET_KEY
// on the server — 🔒 external setup.

import { supabase } from '../supabase/client';

export interface ConnectOnboardingResult {
  configured: boolean;
  /** Hosted Stripe Connect onboarding URL to open, when available. */
  url?: string;
  error?: string;
}

/** Result of re-checking Connect onboarding after the provider returns. */
export type ConnectStatusState = 'approved' | 'pending' | 'not_started';

export interface ConnectStatusResult {
  state: ConnectStatusState;
  error?: string;
}

/** Start (or resume) Stripe Connect onboarding for a provider. */
export async function startConnectOnboarding(
  providerId: string,
): Promise<ConnectOnboardingResult> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'connect_onboarding', provider_id: providerId },
    });

    if (error) {
      return { configured: false, error: error.message ?? 'Connect onboarding failed.' };
    }

    const response = data as { configured?: boolean; url?: string; error?: string };
    if (!response?.configured || !response.url) {
      return {
        configured: false,
        error: response?.error ?? 'Bank payouts are not set up yet.',
      };
    }

    return { configured: true, url: response.url };
  } catch (err) {
    return {
      configured: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Re-check Connect onboarding status after the provider returns from Stripe.
 * `approved` once the account can receive payouts; `pending` while Stripe is
 * still reviewing; `not_started` if onboarding was never begun.
 */
export async function refreshConnectStatus(
  providerId: string,
): Promise<ConnectStatusResult> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-webhook', {
      body: { action: 'connect_status', provider_id: providerId },
    });

    if (error) {
      return { state: 'pending', error: error.message ?? 'Status check failed.' };
    }

    const response = data as { state?: ConnectStatusState; error?: string };
    return { state: response?.state ?? 'pending', error: response?.error };
  } catch (err) {
    return {
      state: 'pending',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
