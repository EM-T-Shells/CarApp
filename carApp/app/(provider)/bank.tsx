// (provider)/bank.tsx — vetting Bank step (Flow 4.6).
//
// Connects a Stripe Connect account for payouts. Stripe Connect is stubbed
// (src/lib/stripe/connect) pending the platform setup, so today this surfaces a
// "not set up yet" message; once configured it opens the hosted onboarding and,
// on completion, saves stripe_account_id and advances bank_status.

import React, { useCallback } from 'react';
import { Linking } from 'react-native';
import {
  VettingActionStep,
  type VettingActionResult,
} from '../../src/components/provider/VettingActionStep';
import { startConnectOnboarding } from '../../src/lib/stripe/connect';

export default function BankStep(): React.ReactElement {
  const onAction = useCallback(
    async (providerId: string): Promise<VettingActionResult> => {
      const result = await startConnectOnboarding(providerId);
      if (!result.configured || !result.url) {
        return { error: result.error ?? 'Bank payouts are not set up yet.' };
      }
      // Configured path: hand off to Stripe's hosted onboarding. bank_status
      // advances via the return deep link + stripe-webhook once that's wired.
      await Linking.openURL(result.url);
      return { status: 'submitted' };
    },
    [],
  );

  return (
    <VettingActionStep
      statusField="bank_status"
      title="Bank account"
      description="Connect a bank account through Stripe so you can receive payouts. Your details are handled securely by Stripe — CarApp never sees them."
      actionLabel="Connect with Stripe"
      onAction={onAction}
    />
  );
}
