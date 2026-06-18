// (provider)/bank.tsx — vetting Bank step (Flow 4.6).
//
// Connects a Stripe Connect (Express) account for payouts. Tapping the action
// opens Stripe's hosted onboarding in an in-app auth session (the same
// mechanism the OAuth sign-in flow uses, see src/lib/supabase/auth.ts). Stripe
// returns the provider to carapp://provider/bank, which the auth session
// intercepts; we then re-check the account and advance bank_status to approved
// once payouts are enabled (or keep it in-progress while Stripe is reviewing).

import React, { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import {
  VettingActionStep,
  type VettingActionResult,
} from '../../src/components/provider/VettingActionStep';
import {
  startConnectOnboarding,
  refreshConnectStatus,
} from '../../src/lib/stripe/connect';

// Must match the return_url the stripe-webhook Edge Function passes to
// accountLinks.create (CONNECT_RETURN_URL). The app scheme is "carapp".
const CONNECT_RETURN_URL = 'carapp://provider/bank';

export default function BankStep(): React.ReactElement {
  const onAction = useCallback(
    async (providerId: string): Promise<VettingActionResult> => {
      const result = await startConnectOnboarding(providerId);
      if (!result.configured || !result.url) {
        return { error: result.error ?? 'Bank payouts are not set up yet.' };
      }

      // Open Stripe's hosted onboarding and wait for the return deep link. The
      // in-app session reliably intercepts carapp:// on iOS and Android.
      const session = await WebBrowser.openAuthSessionAsync(
        result.url,
        CONNECT_RETURN_URL,
      );

      // Dismissed/cancelled before finishing — leave the step as submitted so
      // they can resume; the account already exists server-side.
      if (session.type !== 'success') {
        return { status: 'submitted' };
      }

      // Returned from Stripe — verify whether payouts are actually enabled.
      const status = await refreshConnectStatus(providerId);
      if (status.error) {
        return { error: status.error };
      }
      if (status.state === 'approved') return { status: 'approved' };
      // pending (still under review) or not_started → keep it in progress.
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
      submittedMessage="Still processing — Stripe is reviewing your account. We'll update this step once payouts are enabled."
    />
  );
}
