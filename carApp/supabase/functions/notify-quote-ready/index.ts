// notify-quote-ready Edge Function
//
// Tells the customer their provider has priced the request and it is waiting
// for approval. Invoked by the submit_quote action in stripe-webhook once the
// booking reaches pending_customer_approval.
//
// Customer-only by design. The provider just sent the quote, so a push back to
// them would only confirm their own tap; notify-booking-confirmed is what tells
// them the job is real, once the customer approves and pays.
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

// bookings.quoted_total_amount is NUMERIC dollars, not the integer cents that
// quote_line_items holds. Formatted here rather than through src/utils/money.ts
// because that module is client-side and Deno cannot reach outside
// supabase/functions/. Kept to whole-dollar-plus-cents so it matches what the
// approval screen will render.
function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

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
      .select('id, customer_id, quoted_total_amount, scheduled_at')
      .eq('id', booking_id)
      .maybeSingle();

    if (error || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!booking.customer_id) {
      return new Response(JSON.stringify({ error: 'Booking has no customer' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quoted = Number(booking.quoted_total_amount ?? 0);

    // The price is the whole point of the notification, but a quote with no
    // total on it is a submit_quote bug rather than a free job — say a quote
    // arrived without inventing a number for it.
    const body =
      Number.isFinite(quoted) && quoted > 0
        ? `Your provider quoted ${formatUsd(quoted)}. Tap to review and approve.`
        : 'Your provider sent a quote. Tap to review and approve.';

    const message = {
      title: 'Your quote is ready',
      body,
      data: {
        type: 'quote_ready',
        bookingId: booking.id,
      },
    };

    const customer = await getUserPushTarget(booking.customer_id);
    await sendFcm(customer ?? { fcm_token: null }, message);
    await recordNotification(booking.customer_id, 'quote_ready', message, {
      booking_id: booking.id,
    });

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
