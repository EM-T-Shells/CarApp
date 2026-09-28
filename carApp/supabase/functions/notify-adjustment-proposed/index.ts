// notify-adjustment-proposed Edge Function
//
// Tells the customer their provider has proposed changing a confirmed job — a
// longer duration and/or extra charges (§7 "vehicle worse than declared").
// Fired by stripe-webhook's adjust_job_duration once the booking is in
// pending_adjustment_approval. Nothing changes until the customer answers, and
// the provider may be standing at the car, so this is the time-sensitive one.
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

// bookings money columns are NUMERIC dollars. Formatted here because Deno
// cannot reach src/utils/money.ts.
function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { booking_id } = (await req.json()) as { booking_id?: string };
    if (!booking_id) return notifyResponse({ error: 'booking_id required' }, 400);

    const { data: booking, error } = await serviceClient()
      .from('bookings')
      .select('id, customer_id, total_amount, adjustment_total_amount')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) return notifyResponse({ error: 'Booking not found' }, 404);
    if (!booking.customer_id) return notifyResponse({ error: 'Booking has no customer' }, 404);

    const current = Number(booking.total_amount ?? 0);
    const proposed = Number(booking.adjustment_total_amount ?? 0);
    const body =
      Number.isFinite(proposed) && proposed > 0 && proposed !== current
        ? `Your provider proposed a new total of ${formatUsd(proposed)} (was ${formatUsd(current)}). Tap to review.`
        : 'Your provider proposed a change to your booking. Tap to review.';

    await notifyUser(
      booking.customer_id,
      'adjustment_proposed',
      {
        title: 'Change to your booking',
        body,
        data: {
          type: 'adjustment_proposed',
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
