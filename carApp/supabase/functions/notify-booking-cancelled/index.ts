// notify-booking-cancelled Edge Function
//
// Sent when an already-active booking is cancelled under the cancellation
// policy (Blocker #5). Covers three cases, keyed by cancelled_by:
//   • 'customer' → notify the PROVIDER that the customer cancelled; note the
//     refund the customer received (full, or less the $15 late fee).
//   • 'provider' → notify the CUSTOMER that the provider cancelled and that
//     their deposit has been refunded in full (+ re-booking assistance).
//   • 'no_show'  → notify the CUSTOMER that they were marked a no-show and
//     forfeited the booking amount.
//
// Triggered by stripe-webhook (cancel_booking / provider_cancel_booking /
// mark_no_show). This is distinct from notify-booking-declined, which only
// covers the provider-approval window (decline / 2h timeout).
//
// Request body:
//   { booking_id: string,
//     cancelled_by: 'customer' | 'provider' | 'no_show',
//     fee_cents?: number,      // customer late-cancel fee retained
//     refund_cents?: number,   // amount refunded to the customer
//     penalty_cents?: number } // provider penalty recorded
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

function dollars(cents?: number): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id, cancelled_by, fee_cents, refund_cents } =
      (await req.json()) as {
        booking_id?: string;
        cancelled_by?: 'customer' | 'provider' | 'no_show';
        fee_cents?: number;
        refund_cents?: number;
        penalty_cents?: number;
      };

    if (!booking_id || !cancelled_by) {
      return new Response(
        JSON.stringify({ error: 'booking_id and cancelled_by required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = serviceClient();
    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, customer_id, provider_id')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = { type: 'booking_cancelled', bookingId: booking.id };

    if (cancelled_by === 'customer' && booking.provider_id) {
      // Notify the provider their customer cancelled.
      const providerUserId = await getProviderUserId(booking.provider_id);
      if (providerUserId) {
        const provider = await getUserPushTarget(providerUserId);
        const message = {
          title: 'Booking cancelled',
          body:
            fee_cents && fee_cents > 0
              ? `The customer cancelled within 24 hours. A ${dollars(fee_cents)} fee was retained.`
              : 'The customer cancelled this booking.',
          data,
        };
        await sendFcm(provider ?? { fcm_token: null }, message);
        await recordNotification(providerUserId, 'booking_cancelled', message, {
          booking_id: booking.id,
        });
      }
    } else if (cancelled_by === 'provider' && booking.customer_id) {
      // Notify the customer the provider cancelled; their deposit was refunded.
      const customer = await getUserPushTarget(booking.customer_id);
      const message = {
        title: 'Booking cancelled',
        body: 'The provider had to cancel. Your deposit has been refunded in full — we can help you re-book.',
        data,
      };
      await sendFcm(customer ?? { fcm_token: null }, message);
      await recordNotification(booking.customer_id, 'booking_cancelled', message, {
        booking_id: booking.id,
      });
    } else if (cancelled_by === 'no_show' && booking.customer_id) {
      // Notify the customer they were marked a no-show.
      const customer = await getUserPushTarget(booking.customer_id);
      const message = {
        title: 'Marked as no-show',
        body: 'You were marked as a no-show for your appointment. Per the cancellation policy, the booking amount was forfeited.',
        data,
      };
      await sendFcm(customer ?? { fcm_token: null }, message);
      await recordNotification(booking.customer_id, 'booking_no_show', message, {
        booking_id: booking.id,
      });
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
