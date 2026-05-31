// (provider)/background.tsx — vetting Background-check step (Flow 4.3).
//
// Authorizing records consent and marks the step "Under review". The real
// Checkr report kicks off server-side once Checkr is configured (src/lib/checkr
// + checkr-webhook are stubbed pending CHECKR_API_KEY).

import React, { useCallback } from 'react';
import {
  VettingActionStep,
  type VettingActionResult,
} from '../../src/components/provider/VettingActionStep';
import { startBackgroundCheck } from '../../src/lib/checkr';
import { updateProviderVetting } from '../../src/lib/supabase/mutations';

export default function BackgroundStep(): React.ReactElement {
  const onAction = useCallback(
    async (providerId: string): Promise<VettingActionResult> => {
      // Will kick off the real Checkr report once configured; for now this is a
      // no-op that lets us record the provider's consent below.
      await startBackgroundCheck(providerId);
      const res = await updateProviderVetting(providerId, {
        background_status: 'submitted',
      });
      if (res.error) return { error: res.error.message };
      return { status: 'submitted' };
    },
    [],
  );

  return (
    <VettingActionStep
      statusField="background_status"
      title="Background check"
      description="We run a standard background screen through Checkr to keep customers safe. Tap below to authorize the check — it won't affect your credit."
      actionLabel="Authorize background check"
      onAction={onAction}
    />
  );
}
