// notify-adjustment-approved Edge Function
//
// Tells the provider the customer approved their proposed change, so the job
// carries on at the new duration and total. Fired by stripe-webhook's
// respond_adjustment on approval. A decline cancels the booking and is
// reported through notify-booking-cancelled instead.
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
      .select('id, provider_id')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);
    if (!booking.provider_id) return notifyResponse({ error: 'Booking has no provider' }, 404);

    const providerUserId = await getProviderUserId(booking.provider_id);
    if (!providerUserId) return notifyResponse({ error: 'Provider not found' }, 404);

    await notifyUser(
      providerUserId,
      'adjustment_approved',
      {
        title: 'Change approved',
        body: 'The customer approved your change. The job is confirmed at the new total.',
        data: {
          type: 'adjustment_approved',
          bookingId: booking.id,
          route: `/(provider-tabs)/jobs/${booking.id}`,
        },
      },
      { booking_id: booking.id },
    );

    return notifyResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return notifyResponse({ error: message }, 500);
  }
});
