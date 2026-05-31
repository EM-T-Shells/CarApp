// Checkr background-check client — STUB (Flow 4.3).
//
// Real implementation creates a Checkr candidate + report for the provider and
// returns the report id; the checkr-webhook Edge Function later reconciles the
// result into provider_vetting.background_status. Requires:
//   • CHECKR_API_KEY (server, via supabase secrets) — 🔒 external setup
//   • a Checkr account + package configured
//
// Until then this returns { configured: false }. The Background step still
// records the provider's consent and marks the step "Under review" so the flow
// can progress; the actual report runs server-side once Checkr is wired.

export interface BackgroundCheckResult {
  configured: boolean;
  reportId?: string;
  error?: string;
}

/** Kick off a Checkr background check for the provider. STUB — see file header. */
export async function startBackgroundCheck(
  _providerId: string,
): Promise<BackgroundCheckResult> {
  return {
    configured: false,
    error: 'Checkr background checks are not configured yet.',
  };
}
