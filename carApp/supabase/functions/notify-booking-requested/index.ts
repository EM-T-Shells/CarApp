// notify-booking-requested Edge Function
//
// Sent when a customer's deposit lands and the booking enters
// pending_provider_approval (Blocker #4 / Flow H1). Notifies BOTH parties:
//   • Provider — "New booking request — respond within 2 hours" (the actionable
//     side; this is the alert that drives the accept/decline decision).
//   • Customer — "Request sent — waiting for the provider to confirm."
//
// Triggered by stripe-webhook on the pending → pending_provider_approval
// transition, by direct invocation.
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
      type: 'booking_requested',
      bookingId: booking.id,
    };

    // Provider side — the actionable alert.
    if (booking.provider_id) {
      const providerUserId = await getProviderUserId(booking.provider_id);
      if (providerUserId) {
        const provider = await getUserPushTarget(providerUserId);
        const message = {
          title: 'New booking request',
          body: 'A customer just booked you. Accept or decline within 2 hours.',
          data,
        };
        await sendFcm(provider ?? { fcm_token: null }, message);
        await recordNotification(
          providerUserId,
          'booking_requested',
          message,
          { booking_id: booking.id },
        );
      }
    }

    // Customer side — reassurance that the request is in flight.
    if (booking.customer_id) {
      const customer = await getUserPushTarget(booking.customer_id);
      const message = {
        title: 'Request sent',
        body: "We sent your booking to the provider. We'll let you know as soon as they confirm.",
        data,
      };
      await sendFcm(customer ?? { fcm_token: null }, message);
      await recordNotification(
        booking.customer_id,
        'booking_requested',
        message,
        { booking_id: booking.id },
      );
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
