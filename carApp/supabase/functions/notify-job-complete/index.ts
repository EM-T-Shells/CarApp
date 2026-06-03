// notify-job-complete Edge Function
//
// Sends the customer a "Rate your provider" push when the booking flips to
// `completed`. The push deep-links back to the booking detail screen with
// the rating sheet open (handled client-side by inspecting the route +
// type metadata).
//
// Request body: { booking_id: string }
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
      .select(
        'id, customer_id, provider_profiles!provider_id ( users!user_id ( full_name ) )',
      )
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!booking.customer_id) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no customer' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const providerName =
      // deno-lint-ignore no-explicit-any
      ((booking as any).provider_profiles?.users?.full_name as string) ??
      'your provider';

    const customer = await getUserPushTarget(booking.customer_id);
    const message = {
      title: 'How was the service?',
      body: `Leave a quick rating for ${providerName}.`,
      data: {
        type: 'rate_now',
        bookingId: booking.id,
      },
    };

    await sendFcm(customer ?? { fcm_token: null }, message);
    await recordNotification(
      booking.customer_id,
      'rate_now',
      message,
      { booking_id: booking.id },
    );

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
