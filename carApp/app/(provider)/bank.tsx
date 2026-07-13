// (provider)/bank.tsx — vetting Bank step (Flow 4.6).
//
// MVP prototype: real Stripe Connect (Express) payout onboarding is deferred.
// Tapping the action simply marks the bank step approved so providers can
// finish vetting without connecting a real bank. When wiring live payouts,
// restore the Stripe flow: startConnectOnboarding + refreshConnectStatus from
// src/lib/stripe/connect.ts, opened in a WebBrowser auth session that returns
// to an https redirect (accountLinks require http/https, not carapp://).

import React, { useCallback } from 'react';
import {
  VettingActionStep,
  type VettingActionResult,
} from '../../src/components/provider/VettingActionStep';
import { updateProviderVetting } from '../../src/lib/supabase/mutations';

export default function BankStep(): React.ReactElement {
  const onAction = useCallback(
    async (providerId: string): Promise<VettingActionResult> => {
      const result = await updateProviderVetting(providerId, {
        bank_status: 'approved',
      });
      if (result.error) {
        return { error: result.error.message };
      }
      return { status: 'approved' };
    },
    [],
  );

  return (
    <VettingActionStep
      statusField="bank_status"
      title="Bank account"
      description="Connect a bank account so you can receive payouts. (Prototype: payout setup is simulated for now — no real bank details are collected.)"
      actionLabel="Connect bank account"
      onAction={onAction}
    />
  );
}
