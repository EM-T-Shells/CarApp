// notify-reschedule-resolved Edge Function
//
// Tells whoever proposed a new time whether the other party accepted it. Fired
// by stripe-webhook's respond_reschedule. The proposal columns are already
// cleared by then, so the caller passes who to tell and what happened rather
// than this function reading it back.
//
// Request body:
//   { booking_id: string,
//     notify_party: 'customer' | 'provider',
//     accepted: boolean }
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
    const { booking_id, notify_party, accepted } = (await req.json()) as {
      booking_id?: string;
      notify_party?: 'customer' | 'provider';
      accepted?: boolean;
    };
    if (!booking_id || (notify_party !== 'customer' && notify_party !== 'provider')) {
      return notifyResponse({ error: 'booking_id and notify_party required' }, 400);
    }

    const { data: booking, error } = await serviceClient()
      .from('bookings')
      .select('id, customer_id, provider_id')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);

    const toProvider = notify_party === 'provider';
    const recipient = toProvider
      ? booking.provider_id
        ? await getProviderUserId(booking.provider_id)
        : null
      : booking.customer_id;
    if (!recipient) return notifyResponse({ error: 'Recipient not found' }, 404);

    await notifyUser(
      recipient,
      'reschedule_resolved',
      {
        title: accepted ? 'New time confirmed' : 'New time declined',
        body: accepted
          ? 'Your proposed time was accepted. The booking has moved.'
          : 'Your proposed time was declined. The booking stays at its original time.',
        data: {
          type: 'reschedule_resolved',
          bookingId: booking.id,
          route: toProvider
            ? `/(provider-tabs)/jobs/${booking.id}`
            : `/bookings/${booking.id}`,
        },
      },
      { booking_id: booking.id, accepted: Boolean(accepted) },
    );

    return notifyResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return notifyResponse({ error: message }, 500);
  }
});
