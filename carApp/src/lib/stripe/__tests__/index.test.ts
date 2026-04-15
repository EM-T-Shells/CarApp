import { createDepositPaymentIntent } from '../index';

// ── Mock supabase.functions.invoke ────────────────────────────────────

const mockInvoke = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

beforeEach(() => {
  mockInvoke.mockReset();
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
