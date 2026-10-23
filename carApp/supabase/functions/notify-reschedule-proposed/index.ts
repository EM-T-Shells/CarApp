// notify-reschedule-proposed Edge Function
//
// Tells the other party that a new start time has been proposed for a
// confirmed booking. Fired by stripe-webhook's propose_reschedule. The
// recipient is whoever did NOT propose it, read from reschedule_proposed_by.
//
// Request body: { booking_id: string }
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  getProviderUserId,
  notifyResponse,
  notifyUser,
  serviceClient,
} from '../_shared/fcm.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id } = (await req.json()) as { booking_id?: string };
    if (!booking_id) return notifyResponse({ error: 'booking_id required' }, 400);

    const { data: booking, error } = await serviceClient()
      .from('bookings')
      .select('id, customer_id, provider_id, proposed_scheduled_at, reschedule_proposed_by')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);
    if (!booking.proposed_scheduled_at) {
      // Already answered or withdrawn by the time this ran. Nothing to ask.
      return notifyResponse({ ok: true, skipped: 'no open proposal' });
    }

    const toProvider = booking.reschedule_proposed_by === 'customer';
    const recipient = toProvider
      ? booking.provider_id
        ? await getProviderUserId(booking.provider_id)
        : null
      : booking.customer_id;
    if (!recipient) return notifyResponse({ error: 'Recipient not found' }, 404);

    await notifyUser(
      recipient,
      'reschedule_proposed',
      {
        title: 'New time proposed',
        body: toProvider
          ? 'Your customer asked to move their booking. Tap to accept or decline.'
          : 'Your provider asked to move your booking. Tap to accept or decline.',
        data: {
          type: 'reschedule_proposed',
          bookingId: booking.id,
          route: toProvider
            ? `/(provider-tabs)/jobs/${booking.id}`
            : `/bookings/${booking.id}`,
        },
      },
      { booking_id: booking.id, proposed_scheduled_at: booking.proposed_scheduled_at },
    );

    return notifyResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return notifyResponse({ error: message }, 500);
  }
});
