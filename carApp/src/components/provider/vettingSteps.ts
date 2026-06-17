// Shared config for the provider vetting flow (Section 4). The hub and each
// step screen import from here so the step list, labels, routes, and the
// provider_vetting status column each maps to stay in one place.

import type { ProviderVetting } from '../../types/models';

export interface VettingStepConfig {
  key: string;
  label: string;
  /** Route within the (provider) group. */
  route: string;
  /**
   * Column on provider_vetting whose status drives this step, or 'profile'
   * for the profile/services step which is derived from profile_completeness.
   */
  statusField:
    | keyof Pick<
        ProviderVetting,
        | 'identity_status'
        | 'background_status'
        | 'insurance_status'
        | 'credentials_status'
        | 'bank_status'
      >
    | 'profile';
}

export const VETTING_STEPS: readonly VettingStepConfig[] = [
  { key: 'profile', label: 'Profile', route: '/(provider)/profile', statusField: 'profile' },
  { key: 'identity', label: 'Identity', route: '/(provider)/identity', statusField: 'identity_status' },
  { key: 'background', label: 'Background', route: '/(provider)/background', statusField: 'background_status' },
  { key: 'insurance', label: 'Insurance', route: '/(provider)/insurance', statusField: 'insurance_status' },
  { key: 'credentials', label: 'Credentials', route: '/(provider)/credentials', statusField: 'credentials_status' },
  { key: 'bank', label: 'Bank', route: '/(provider)/bank', statusField: 'bank_status' },
] as const;

/** Minimum profile_completeness (0–100) for the profile step to count as done. */
export const PROFILE_COMPLETENESS_THRESHOLD = 80;
