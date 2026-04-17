import { createDepositPaymentIntent, confirmDepositPayment } from '../index';

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
