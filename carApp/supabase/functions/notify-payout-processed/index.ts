// notify-payout-processed Edge Function (Flow 5.7)
//
// Sends a provider a "You've been paid" push when one of their payouts is
// marked `paid`. Invoke when a payout transitions to paid:
//   supabase.functions.invoke('notify-payout-processed', { body: { payout_id } })
//
// The push deep-links to the provider dashboard (More → Provider) where the
// earnings view lives.
//
// Request body: { payout_id: string }
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  getUserPushTarget,
  recordNotification,
  sendFcm,
  serviceClient,
} from '../_shared/fcm.ts';

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { payout_id } = (await req.json()) as { payout_id?: string };
    if (!payout_id) {
      return new Response(JSON.stringify({ error: 'payout_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = serviceClient();
    const { data: payout, error } = await supabase
      .from('payouts')
      .select(
        'id, amount, status, provider_id, provider_profiles!provider_id ( user_id )',
      )
      .eq('id', payout_id)
      .maybeSingle();

    if (error || !payout) {
      return new Response(JSON.stringify({ error: 'Payout not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // deno-lint-ignore no-explicit-any
    const providerUserId = (payout as any).provider_profiles?.user_id as
      | string
      | null;

    if (!providerUserId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no provider user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amount = Number(payout.amount ?? 0);
    const provider = await getUserPushTarget(providerUserId);
    const message = {
      title: 'Payout sent 💸',
      body: `${formatUsd(amount)} is on its way to your bank account.`,
      data: {
        type: 'payout_processed',
        payoutId: payout.id,
      },
    };

    await sendFcm(provider ?? { fcm_token: null }, message);
    await recordNotification(providerUserId, 'payout_processed', message, {
      payout_id: payout.id,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
