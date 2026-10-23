// notify-eta-changed Edge Function
//
// Tells the customer that their provider's arrival or ready-by time has moved
// (spec §2 "Overruns", §5). Fired by stripe-webhook's report_delay, which has
// already decided the change is material and outside the dedupe window
// (_shared/eta.ts), so this function only composes and sends. Customer only —
// the provider is the one who reported it.
//
// Request body: { booking_id: string, previous_eta?: string }
//   previous_eta — what the customer had before this change, so the message can
//   say "about 15 min later than before" rather than just the new time.
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  notifyResponse,
  notifyUser,
  serviceClient,
} from '../_shared/fcm.ts';
import { etaChangeMessage } from '../_shared/eta.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id, previous_eta } = (await req.json()) as {
      booking_id?: string;
      previous_eta?: string;
    };
    if (!booking_id) return notifyResponse({ error: 'booking_id required' }, 400);

    const supabase = serviceClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select(
        'id, customer_id, provider_id, status, scheduled_at, started_at, running_late_mins, estimated_completion_at',
      )
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);
    if (!booking.customer_id) return notifyResponse({ error: 'Recipient not found' }, 404);
    if (['completed', 'cancelled', 'no_show'].includes(booking.status)) {
      // Finished or called off by the time this ran. A late ETA would be noise.
      return notifyResponse({ ok: true, skipped: `booking is ${booking.status}` });
    }

    // The provider's name and zone: the name for the message, the zone because
    // this server runs in UTC and "2:30 PM" has to be on the job's own clock.
    const { data: profile } = booking.provider_id
      ? await supabase
          .from('provider_profiles')
          .select('timezone, users(full_name)')
          .eq('id', booking.provider_id)
          .maybeSingle()
      : { data: null };

    const owner = (profile as { users?: { full_name?: string | null } | null } | null)?.users;

    const message = etaChangeMessage({
      providerName: owner?.full_name ?? null,
      timeZone: (profile as { timezone?: string | null } | null)?.timezone ?? null,
      scheduledAt: booking.scheduled_at,
      startedAt: booking.started_at,
      runningLateMins: booking.running_late_mins ?? 0,
      etaAt: booking.estimated_completion_at,
      previousEtaAt: previous_eta ?? null,
    });

    await notifyUser(
      booking.customer_id,
      'eta_changed',
      {
        ...message,
        data: {
          type: 'eta_changed',
          bookingId: booking.id,
          route: `/bookings/${booking.id}`,
        },
      },
      {
        booking_id: booking.id,
        running_late_mins: booking.running_late_mins ?? 0,
        estimated_completion_at: booking.estimated_completion_at,
      },
    );

    return notifyResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return notifyResponse({ error: message }, 500);
  }
});
