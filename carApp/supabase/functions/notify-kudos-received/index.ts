// notify-kudos-received Edge Function (Flow 5.8)
//
// Sends a provider a push when a customer awards them a kudos badge. Invoke on
// kudos insert:
//   supabase.functions.invoke('notify-kudos-received', { body: { kudos_id } })
//
// The push deep-links to the provider dashboard (More → Provider) per the
// CLAUDE.md route map.
//
// Request body: { kudos_id: string }
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

// Storage enum → friendly label (mirrors KudosBadge labels on the client).
const BADGE_LABELS: Record<string, string> = {
  meticulous: 'Meticulous',
  reliable: 'Reliable',
  magic_hands: 'Magic Hands',
  great_value: 'Great Value',
  fast_worker: 'Fast Worker',
  communicator: 'Communicator',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { kudos_id } = (await req.json()) as { kudos_id?: string };
    if (!kudos_id) {
      return new Response(JSON.stringify({ error: 'kudos_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = serviceClient();
    const { data: kudos, error } = await supabase
      .from('kudos')
      .select('id, badge, receiver_id')
      .eq('id', kudos_id)
      .maybeSingle();

    if (error || !kudos) {
      return new Response(JSON.stringify({ error: 'Kudos not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!kudos.receiver_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no receiver' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const label = BADGE_LABELS[kudos.badge] ?? 'a kudos';
    const provider = await getUserPushTarget(kudos.receiver_id);
    const message = {
      title: 'You earned a kudos! 🏅',
      body: `A customer praised your work: "${label}".`,
      data: {
        type: 'kudos_received',
        kudosId: kudos.id,
        badge: kudos.badge,
      },
    };

    await sendFcm(provider ?? { fcm_token: null }, message);
    await recordNotification(kudos.receiver_id, 'kudos_received', message, {
      kudos_id: kudos.id,
      badge: kudos.badge,
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
