import {
  createDepositPaymentIntent,
  presentDepositPaymentSheet,
  captureBalance,
  acceptBooking,
  declineBooking,
  cancelBooking,
  providerCancelBooking,
  markNoShow,
  submitQuote,
} from '../index';

// ── Mock supabase.functions.invoke ────────────────────────────────────

const mockInvoke = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// ── Mock @stripe/stripe-react-native ──────────────────────────────────

const mockInitPaymentSheet = jest.fn();
const mockPresentPaymentSheet = jest.fn();

jest.mock('@stripe/stripe-react-native', () => ({
  initPaymentSheet: (...args: unknown[]) => mockInitPaymentSheet(...args),
  presentPaymentSheet: (...args: unknown[]) => mockPresentPaymentSheet(...args),
  PaymentSheetError: { Canceled: 'Canceled', Failed: 'Failed' },
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockInitPaymentSheet.mockReset();
  mockPresentPaymentSheet.mockReset();
});

describe('createDepositPaymentIntent', () => {
  it('returns clientSecret and paymentIntentId on success', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        clientSecret: 'pi_secret_abc',
        paymentIntentId: 'pi_abc',
      },
      error: null,
    });

    const result = await createDepositPaymentIntent('booking-1', 1500);

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'create_deposit_intent',
        booking_id: 'booking-1',
        amount: 1500,
      },
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      clientSecret: 'pi_secret_abc',
      paymentIntentId: 'pi_abc',
    });
  });

  it('passes through the customer id and ephemeral key for PaymentSheet', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        clientSecret: 'pi_secret_abc',
        paymentIntentId: 'pi_abc',
        customerId: 'cus_123',
        ephemeralKeySecret: 'ek_secret_123',
      },
      error: null,
    });

    const result = await createDepositPaymentIntent('booking-1', 1500);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      clientSecret: 'pi_secret_abc',
      paymentIntentId: 'pi_abc',
      customerId: 'cus_123',
      ephemeralKeySecret: 'ek_secret_123',
    });
  });

  it('returns error when edge function returns error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Stripe error' },
    });

    const result = await createDepositPaymentIntent('booking-1', 1500);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Stripe error');
  });

  it('returns error when response has no clientSecret', async () => {
    mockInvoke.mockResolvedValue({
      data: { paymentIntentId: 'pi_abc' },
      error: null,
    });

    const result = await createDepositPaymentIntent('booking-1', 1500);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('Invalid response');
  });

  it('handles thrown exceptions', async () => {
    mockInvoke.mockRejectedValue(new Error('Network failure'));

    const result = await createDepositPaymentIntent('booking-1', 1500);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Network failure');
  });
});

describe('presentDepositPaymentSheet', () => {
  const intent = {
    clientSecret: 'pi_secret_abc',
    paymentIntentId: 'pi_abc',
  };

  const intentWithCustomer = {
    ...intent,
    customerId: 'cus_123',
    ephemeralKeySecret: 'ek_secret_123',
  };

  it('initialises the sheet with the client secret and confirms on success', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({ error: null });

    const result = await presentDepositPaymentSheet(intent);

    expect(mockInitPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantDisplayName: 'CarApp',
        paymentIntentClientSecret: 'pi_secret_abc',
        allowsDelayedPaymentMethods: false,
        returnURL: 'carapp://stripe-redirect',
      }),
    );
    expect(mockPresentPaymentSheet).toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ canceled: false });
  });

  it('passes customer and ephemeral key through when the server supplies both', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({ error: null });

    await presentDepositPaymentSheet(intentWithCustomer);

    expect(mockInitPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_123',
        customerEphemeralKeySecret: 'ek_secret_123',
      }),
    );
  });

  it('omits the customer pair when the server sends only one half', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({ error: null });

    await presentDepositPaymentSheet({ ...intent, customerId: 'cus_123' });

    const params = mockInitPaymentSheet.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('customerId');
    expect(params).not.toHaveProperty('customerEphemeralKeySecret');
  });

  it('reports cancellation as a non-error outcome', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({
      error: { code: 'Canceled', message: 'The payment flow was canceled' },
    });

    const result = await presentDepositPaymentSheet(intent);

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ canceled: true });
  });

  it('returns an error when the sheet fails to initialise', async () => {
    mockInitPaymentSheet.mockResolvedValue({
      error: { message: 'No publishable key set' },
    });

    const result = await presentDepositPaymentSheet(intent);

    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('No publishable key set');
  });

  it('returns an error when the card is declined', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({
      error: { code: 'Failed', message: 'Your card was declined.' },
    });

    const result = await presentDepositPaymentSheet(intent);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Your card was declined.');
  });

  it('returns a generic error when the SDK error has no message', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: null });
    mockPresentPaymentSheet.mockResolvedValue({ error: { code: 'Failed' } });

    const result = await presentDepositPaymentSheet(intent);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Payment confirmation failed');
  });

  it('handles exceptions thrown by the Stripe SDK', async () => {
    mockInitPaymentSheet.mockRejectedValue(new Error('SDK not initialised'));

    const result = await presentDepositPaymentSheet(intent);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('SDK not initialised');
  });

  it('wraps non-Error exceptions in an Error object', async () => {
    mockInitPaymentSheet.mockRejectedValue('unexpected string throw');

    const result = await presentDepositPaymentSheet(intent);

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('unexpected string throw');
  });
});

describe('captureBalance', () => {
  it('invokes the capture_balance action and returns the response', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, payment_intent_id: 'pi_bal', status: 'succeeded' },
      error: null,
    });

    const result = await captureBalance('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'capture_balance', booking_id: 'booking-1' },
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      ok: true,
      payment_intent_id: 'pi_bal',
      status: 'succeeded',
    });
  });

  it('returns error when the edge function returns an error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'card_declined' },
    });

    const result = await captureBalance('booking-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('card_declined');
  });

  it('returns error when response is not ok', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await captureBalance('booking-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('did not complete');
  });

  it('handles thrown exceptions', async () => {
    mockInvoke.mockRejectedValue(new Error('Network failure'));

    const result = await captureBalance('booking-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Network failure');
  });
});

describe('acceptBooking', () => {
  it('invokes the accept_booking action and returns the response', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'confirmed' },
      error: null,
    });

    const result = await acceptBooking('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'accept_booking', booking_id: 'booking-1' },
    });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ ok: true, status: 'confirmed' });
  });

  it('errors when the approval window already closed (not ok)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await acceptBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toContain('no longer awaiting approval');
  });

  it('surfaces an edge-function error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await acceptBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toBe('boom');
  });

  // The provider loses the race for a slot: another job on their calendar now
  // overlaps this one, so bookings_no_provider_overlap refuses the transition
  // and the Edge Function answers 409 with an explanation. invoke() reports
  // only "non-2xx", so the explanation has to come off the response body or
  // the provider is told nothing actionable.
  it('reads the slot-conflict message out of a 409 body', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({
            error:
              'That time overlaps a job you have already confirmed. Decline this request or reschedule the other job.',
            code: 'slot_conflict',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    });

    const result = await acceptBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('overlaps a job you have already confirmed');
  });

  it('falls back to the invoke message when the body is not JSON', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response('<html>502</html>', { status: 502 }),
      },
    });

    const result = await acceptBooking('booking-1');

    expect(result.error!.message).toBe('Edge Function returned a non-2xx status code');
  });
});

describe('declineBooking', () => {
  it('invokes decline_booking with the reason', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'cancelled', refund: { ok: true } },
      error: null,
    });

    const result = await declineBooking('booking-1', 'Out of my area');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'decline_booking',
        booking_id: 'booking-1',
        reason: 'Out of my area',
      },
    });
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('cancelled');
  });

  it('omits the reason when not provided', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'cancelled' },
      error: null,
    });

    await declineBooking('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'decline_booking',
        booking_id: 'booking-1',
        reason: undefined,
      },
    });
  });

  it('errors when the approval window already closed (not ok)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await declineBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('no longer awaiting approval');
  });
});

// ── Cancellation policy (Blocker #5) ──────────────────────────────────

describe('cancelBooking', () => {
  it('invokes cancel_booking and returns the server policy outcome', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'cancelled', late: true, fee_cents: 1500 },
      error: null,
    });

    const result = await cancelBooking('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'cancel_booking', booking_id: 'booking-1' },
    });
    expect(result.error).toBeNull();
    expect(result.data?.late).toBe(true);
    expect(result.data?.fee_cents).toBe(1500);
  });

  it('errors when the booking is no longer cancellable', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await cancelBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('no longer cancellable');
  });

  it('surfaces an edge error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    const result = await cancelBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toBe('boom');
  });
});

describe('providerCancelBooking', () => {
  it('invokes provider_cancel_booking with the reason and returns the penalty', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'cancelled', late: true, penalty_cents: 2500 },
      error: null,
    });

    const result = await providerCancelBooking('booking-1', 'Vehicle broke down');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'provider_cancel_booking',
        booking_id: 'booking-1',
        reason: 'Vehicle broke down',
      },
    });
    expect(result.error).toBeNull();
    expect(result.data?.penalty_cents).toBe(2500);
  });

  it('errors when no longer cancellable', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await providerCancelBooking('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('no longer cancellable');
  });
});

describe('markNoShow', () => {
  it('invokes mark_no_show and returns the no_show status', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'no_show' },
      error: null,
    });

    const result = await markNoShow('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'mark_no_show', booking_id: 'booking-1' },
    });
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('no_show');
  });

  it('errors when the booking cannot be marked a no-show', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await markNoShow('booking-1');

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('cannot be marked as a no-show');
  });
});

describe('submitQuote', () => {
  const input = {
    bookingId: 'booking-1',
    scheduledAt: '2026-08-20T14:00:00.000Z',
    estimatedDurationMins: 150,
    lineItems: [{ label: 'SUV', amount_cents: 3000 }],
  };

  it('invokes submit_quote and returns the server-computed quote', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        status: 'pending_customer_approval',
        scheduled_at: '2026-08-20T14:00:00.000Z',
        estimated_duration_mins: 150,
        quoted_total_cents: 23400,
        quote_line_items: [{ label: 'SUV', amount_cents: 3000 }],
      },
      error: null,
    });

    const result = await submitQuote(input);

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'submit_quote',
        booking_id: 'booking-1',
        scheduled_at: '2026-08-20T14:00:00.000Z',
        estimated_duration_mins: 150,
        quote_line_items: [{ label: 'SUV', amount_cents: 3000 }],
      },
    });
    expect(result.error).toBeNull();
    expect(result.data?.status).toBe('pending_customer_approval');
    // The total is the server's. Nothing here recomputes it.
    expect(result.data?.quoted_total_cents).toBe(23400);
  });

  it('sends an empty itemisation when the provider added no surcharges', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    await submitQuote({
      bookingId: 'booking-1',
      scheduledAt: '2026-08-20T14:00:00.000Z',
      estimatedDurationMins: 90,
    });

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'submit_quote',
        booking_id: 'booking-1',
        scheduled_at: '2026-08-20T14:00:00.000Z',
        estimated_duration_mins: 90,
        quote_line_items: [],
      },
    });
  });

  it('errors when the request is no longer awaiting a quote (not ok)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });

    const result = await submitQuote(input);

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('no longer awaiting a quote');
  });

  // A start outside the window, a duration out of range and an already-resolved
  // request are three different fixes for the provider, and invoke() flattens
  // all of them to "non-2xx status code". The real message is on the body.
  it('reads a 400 validation message out of the response body', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({
            error:
              'The start time is outside the arrival window the customer asked for. Propose a reschedule instead.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    });

    const result = await submitQuote(input);

    expect(result.data).toBeNull();
    expect(result.error!.message).toContain('outside the arrival window');
  });

  it('reads a 403 out of the response body when the caller is not the provider', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({ error: 'Not authorized to quote this booking' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    });

    const result = await submitQuote(input);

    expect(result.error!.message).toBe('Not authorized to quote this booking');
  });

  it('falls back to a readable message when there is no body to read', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: {} });

    const result = await submitQuote(input);

    expect(result.error!.message).toBe('Could not send the quote');
  });

  it('handles thrown exceptions', async () => {
    mockInvoke.mockRejectedValue(new Error('Network failure'));

    const result = await submitQuote(input);

    expect(result.data).toBeNull();
    expect(result.error!.message).toBe('Network failure');
  });
});
