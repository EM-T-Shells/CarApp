// notify-photos-requested Edge Function
//
// Tells the customer their provider sent the request back and what they asked
// for (§7 "photos unusable"). Fired by stripe-webhook's request_more_photos
// once the booking is in awaiting_customer_info. The note is included because
// it is the whole point: "photo of the back seats" is actionable, "the
// provider needs more information" is not.
//
// Request body: { booking_id: string }
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  notifyResponse,
  notifyUser,
  serviceClient,
} from '../_shared/fcm.ts';

// A push body is a preview, not the message. The full note is on the booking.
const PREVIEW_LENGTH = 120;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id } = (await req.json()) as { booking_id?: string };
    if (!booking_id) return notifyResponse({ error: 'booking_id required' }, 400);

    const { data: booking, error } = await serviceClient()
      .from('bookings')
      .select('id, customer_id, info_request_note')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);
    if (!booking.customer_id) return notifyResponse({ error: 'Booking has no customer' }, 404);

    const note = (booking.info_request_note ?? '').trim();
    const body = note
      ? `Your provider asked: "${note.length > PREVIEW_LENGTH ? `${note.slice(0, PREVIEW_LENGTH)}…` : note}"`
      : 'Your provider needs a little more before they can price your job.';

    await notifyUser(
      booking.customer_id,
      'photos_requested',
      {
        title: 'Your provider needs more info',
        body,
        data: {
          type: 'photos_requested',
          bookingId: booking.id,
          route: `/bookings/${booking.id}`,
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
