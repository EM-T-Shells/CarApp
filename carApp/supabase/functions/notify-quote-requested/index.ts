// notify-quote-requested Edge Function
//
// Tells the provider an unpriced request is waiting for their quote. Fired by
// stripe-webhook in two places:
//   • confirm_setup_intent — the customer sent a new request and Stripe has
//     confirmed their card is saved, so it is a real request now
//   • provide_customer_info — the customer answered a request_more_photos
//     note and handed the request back ({ resubmitted: true })
//
// Provider only: the customer is the one who just acted.
//
// Request body: { booking_id: string, resubmitted?: boolean }
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
    const { booking_id, resubmitted } = (await req.json()) as {
      booking_id?: string;
      resubmitted?: boolean;
    };
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

    const message = resubmitted
      ? {
          title: 'Request updated',
          body: 'The customer sent what you asked for. Tap to review and quote.',
        }
      : {
          title: 'New quote request',
          body: 'A customer wants a price for their job. Tap to review and quote.',
        };

    await notifyUser(
      providerUserId,
      'quote_requested',
      {
        ...message,
        data: {
          type: 'quote_requested',
          bookingId: booking.id,
          route: `/(provider-tabs)/jobs/quote/${booking.id}`,
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
