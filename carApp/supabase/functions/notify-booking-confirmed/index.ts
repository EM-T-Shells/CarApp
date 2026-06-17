// notify-booking-confirmed Edge Function
//
// Sends "Your booking is confirmed" push notifications to BOTH the customer
// and the provider as soon as the deposit payment lands. Triggered after
// stripe-webhook flips the booking status to `confirmed`, either by direct
// invocation or by a database webhook.
//
// Request body: { booking_id: string }
//
// Runs on Deno. Secrets accessed via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  corsHeaders,
  getProviderUserId,
  getUserPushTarget,
  recordNotification,
  sendFcm,
  serviceClient,
} from '../_shared/fcm.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id } = (await req.json()) as { booking_id?: string };
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = serviceClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, customer_id, provider_id, scheduled_at')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = {
      type: 'booking_confirmed',
      bookingId: booking.id,
    };

    // Customer side
    if (booking.customer_id) {
      const customer = await getUserPushTarget(booking.customer_id);
      const message = {
        title: 'Booking confirmed',
        body: 'Your deposit was received. We sent the details to your provider.',
        data,
      };
      await sendFcm(customer ?? { fcm_token: null }, message);
      await recordNotification(
        booking.customer_id,
        'booking_confirmed',
        message,
        { booking_id: booking.id },
      );
    }

    // Provider side
    if (booking.provider_id) {
      const providerUserId = await getProviderUserId(booking.provider_id);
      if (providerUserId) {
        const provider = await getUserPushTarget(providerUserId);
        const message = {
          title: 'New booking',
          body: 'A customer just booked you. Tap to see the details.',
          data,
        };
        await sendFcm(provider ?? { fcm_token: null }, message);
        await recordNotification(
          providerUserId,
          'booking_confirmed',
          message,
          { booking_id: booking.id },
        );
      }
    }

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
