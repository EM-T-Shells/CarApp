import {
  createDepositPaymentIntent,
  confirmDepositPayment,
  captureBalance,
  acceptBooking,
  declineBooking,
  cancelBooking,
  providerCancelBooking,
  markNoShow,
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

const mockConfirmPayment = jest.fn();

jest.mock('@stripe/stripe-react-native', () => ({
  confirmPayment: (...args: unknown[]) => mockConfirmPayment(...args),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  mockConfirmPayment.mockReset();
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

describe('confirmDepositPayment', () => {
  it('returns true on successful payment confirmation', async () => {
    mockConfirmPayment.mockResolvedValue({ error: null });

    const result = await confirmDepositPayment('pi_secret_abc');

    expect(mockConfirmPayment).toHaveBeenCalledWith('pi_secret_abc', {
      paymentMethodType: 'Card',
    });
    expect(result.error).toBeNull();
    expect(result.data).toBe(true);
  });

  it('returns error when Stripe SDK returns a payment error', async () => {
    mockConfirmPayment.mockResolvedValue({
      error: { message: 'Your card was declined.' },
    });

    const result = await confirmDepositPayment('pi_secret_abc');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Your card was declined.');
  });

  it('returns a generic error when SDK error has no message', async () => {
    mockConfirmPayment.mockResolvedValue({ error: {} });

    const result = await confirmDepositPayment('pi_secret_abc');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Payment confirmation failed');
  });

  it('handles exceptions thrown by the Stripe SDK', async () => {
    mockConfirmPayment.mockRejectedValue(new Error('SDK not initialised'));

    const result = await confirmDepositPayment('pi_secret_abc');

    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('SDK not initialised');
  });

  it('wraps non-Error exceptions in an Error object', async () => {
    mockConfirmPayment.mockRejectedValue('unexpected string throw');

    const result = await confirmDepositPayment('pi_secret_abc');

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
