// notify-booking-declined Edge Function
//
// Sent when a booking awaiting provider approval is cancelled — either because
// the provider declined or because the 2-hour window elapsed and the
// auto-cancel sweep refunded it (Blocker #4 / Flow H1b). Primarily notifies the
// CUSTOMER (their deposit has been refunded); the provider gets a confirmation
// only on an explicit decline.
//
// Triggered by stripe-webhook (decline_booking / expire_pending_approvals).
//
// Request body: { booking_id: string, expired?: boolean }
//   expired=true → auto-cancelled on timeout; otherwise an explicit decline.
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
    const { booking_id, expired } = (await req.json()) as {
      booking_id?: string;
      expired?: boolean;
    };
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
      type: 'booking_declined',
      bookingId: booking.id,
    };

    // Customer side — deposit refunded, regardless of decline vs timeout.
    if (booking.customer_id) {
      const customer = await getUserPushTarget(booking.customer_id);
      const message = {
        title: 'Booking cancelled',
        body: expired
          ? "The provider didn't respond in time. Your deposit has been refunded — try another provider."
          : 'The provider is unavailable for this booking. Your deposit has been refunded in full.',
        data,
      };
      await sendFcm(customer ?? { fcm_token: null }, message);
      await recordNotification(
        booking.customer_id,
        'booking_declined',
        message,
        { booking_id: booking.id },
      );
    }

    // Provider side — only on an explicit decline (a timeout is the provider's
    // own inaction; no need to ping them).
    if (!expired && booking.provider_id) {
      const providerUserId = await getProviderUserId(booking.provider_id);
      if (providerUserId) {
        const provider = await getUserPushTarget(providerUserId);
        const message = {
          title: 'Booking declined',
          body: 'You declined this booking. The customer has been refunded.',
          data,
        };
        await sendFcm(provider ?? { fcm_token: null }, message);
        await recordNotification(
          providerUserId,
          'booking_declined',
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
