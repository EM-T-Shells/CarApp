// Persona identity-verification client — STUB (Flow 4.2).
//
// Real implementation launches a Persona hosted inquiry (gov ID + selfie) and
// returns the inquiry id, which the persona-webhook Edge Function later
// reconciles into provider_vetting.identity_status. That requires:
//   • PERSONA_API_KEY (server, via supabase secrets) — 🔒 external setup
//   • a Persona inquiry template + the Persona RN SDK (not yet an approved dep)
//
// Until then this returns { configured: false } so the Identity step falls back
// to a manual government-ID photo upload. Do not import a Persona SDK here until
// it is added to Blueprint/dependencies_list.

export interface PersonaInquiryResult {
  /** True once the Persona integration is wired up and reachable. */
  configured: boolean;
  /** Persona inquiry id, when an inquiry was successfully created. */
  inquiryId?: string;
  error?: string;
}

/**
 * Begin a Persona identity inquiry for the given user. STUB — see file header.
 */
export async function startPersonaInquiry(
  _userId: string,
): Promise<PersonaInquiryResult> {
  return {
    configured: false,
    error: 'Persona identity verification is not configured yet.',
  };
}
