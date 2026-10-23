// Client wrappers for the Phase 3 actions added after submit_quote /
// accept_quote. Like index.test.ts these mock supabase.functions.invoke, so
// they prove payload shape and error handling — not that the Edge Function
// behaves. The server half is covered by supabase/functions/_shared/__tests__
// and the SQL suites.

import {
  adjustJobDuration,
  confirmSetupIntent,
  createSetupIntent,
  presentCardSetupSheet,
  proposeReschedule,
  provideCustomerInfo,
  requestMorePhotos,
  respondAdjustment,
  respondReschedule,
  withdrawAdjustment,
} from '../index';

const mockInvoke = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

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

/** A FunctionsHttpError-shaped rejection carrying the Edge Function's body. */
function functionError(status: number, body: Record<string, unknown>) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status }),
  };
}

describe('createSetupIntent', () => {
  it('invokes create_setup_intent and returns the sheet parameters', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        clientSecret: 'seti_secret',
        setupIntentId: 'seti_1',
        customerId: 'cus_1',
        ephemeralKeySecret: 'ek_1',
      },
      error: null,
    });

    const result = await createSetupIntent('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'create_setup_intent', booking_id: 'booking-1' },
    });
    expect(result.data?.clientSecret).toBe('seti_secret');
  });

  it('refuses a response with no client secret', async () => {
    mockInvoke.mockResolvedValue({ data: { setupIntentId: 'seti_1' }, error: null });
    const result = await createSetupIntent('booking-1');
    expect(result.error?.message).toMatch(/invalid response/i);
  });

  it('surfaces the server message rather than the generic invoke one', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(409, { error: 'A booking in status cancelled cannot save a card' }),
    });
    const result = await createSetupIntent('booking-1');
    expect(result.error?.message).toBe('A booking in status cancelled cannot save a card');
  });
});

describe('presentCardSetupSheet', () => {
  const INTENT = {
    clientSecret: 'seti_secret',
    setupIntentId: 'seti_1',
    customerId: 'cus_1',
    ephemeralKeySecret: 'ek_1',
  };

  it('opens PaymentSheet in setup mode, not payment mode', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: undefined });
    mockPresentPaymentSheet.mockResolvedValue({ error: undefined });

    const result = await presentCardSetupSheet(INTENT);

    const config = mockInitPaymentSheet.mock.calls[0][0];
    expect(config.setupIntentClientSecret).toBe('seti_secret');
    expect(config.paymentIntentClientSecret).toBeUndefined();
    expect(config.customerId).toBe('cus_1');
    expect(config.customerEphemeralKeySecret).toBe('ek_1');
    expect(result).toEqual({ data: { canceled: false }, error: null });
  });

  it('omits a half-configured customer', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: undefined });
    mockPresentPaymentSheet.mockResolvedValue({ error: undefined });

    await presentCardSetupSheet({ clientSecret: 'seti_secret', setupIntentId: 'seti_1', customerId: 'cus_1' });

    const config = mockInitPaymentSheet.mock.calls[0][0];
    expect(config.customerId).toBeUndefined();
  });

  it('treats a dismissed sheet as an outcome, not an error', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: undefined });
    mockPresentPaymentSheet.mockResolvedValue({ error: { code: 'Canceled', message: 'x' } });

    const result = await presentCardSetupSheet(INTENT);
    expect(result).toEqual({ data: { canceled: true }, error: null });
  });

  it('reports a failed sheet as an error', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: undefined });
    mockPresentPaymentSheet.mockResolvedValue({ error: { code: 'Failed', message: 'Card declined' } });

    const result = await presentCardSetupSheet(INTENT);
    expect(result.error?.message).toBe('Card declined');
  });

  it('reports an init failure without presenting', async () => {
    mockInitPaymentSheet.mockResolvedValue({ error: { message: 'bad key' } });

    const result = await presentCardSetupSheet(INTENT);
    expect(result.error?.message).toBe('bad key');
    expect(mockPresentPaymentSheet).not.toHaveBeenCalled();
  });
});

describe('confirmSetupIntent', () => {
  it('asks the server whether the card was saved', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, card_saved: true }, error: null });

    const result = await confirmSetupIntent('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'confirm_setup_intent', booking_id: 'booking-1' },
    });
    expect(result.data?.card_saved).toBe(true);
  });

  it('reports a card Stripe has not confirmed as an error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(409, { error: 'The card has not been saved yet', card_saved: false }),
    });
    const result = await confirmSetupIntent('booking-1');
    expect(result.error?.message).toBe('The card has not been saved yet');
  });
});

describe('requestMorePhotos / provideCustomerInfo', () => {
  it('sends the provider note', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, status: 'awaiting_customer_info' }, error: null });

    const result = await requestMorePhotos('booking-1', 'Photo of the back seats');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'request_more_photos', booking_id: 'booking-1', note: 'Photo of the back seats' },
    });
    expect(result.data?.status).toBe('awaiting_customer_info');
  });

  it('hands the request back', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, status: 'pending_provider_quote' }, error: null });

    const result = await provideCustomerInfo('booking-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'provide_customer_info', booking_id: 'booking-1' },
    });
    expect(result.data?.status).toBe('pending_provider_quote');
  });

  it('treats ok: false as a failure', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: false }, error: null });
    const result = await provideCustomerInfo('booking-1');
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('adjustJobDuration', () => {
  it('states duration, extra charges and reason — never a total', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, status: 'pending_adjustment_approval', adjustment_total_cents: 28500 },
      error: null,
    });

    const result = await adjustJobDuration({
      bookingId: 'booking-1',
      estimatedDurationMins: 180,
      lineItems: [{ label: 'Heavy mud', amount_cents: 3000 }],
      reason: 'Mud throughout',
    });

    const body = mockInvoke.mock.calls[0][1].body;
    expect(body).toEqual({
      action: 'adjust_job_duration',
      booking_id: 'booking-1',
      estimated_duration_mins: 180,
      adjustment_line_items: [{ label: 'Heavy mud', amount_cents: 3000 }],
      reason: 'Mud throughout',
    });
    expect(body).not.toHaveProperty('adjustment_total_amount');
    expect(result.data?.adjustment_total_cents).toBe(28500);
  });

  it('withdraws a pending change', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, status: 'confirmed' }, error: null });
    await withdrawAdjustment('booking-1');
    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'withdraw_adjustment', booking_id: 'booking-1' },
    });
  });
});

describe('respondAdjustment', () => {
  it('approves', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, status: 'confirmed' }, error: null });
    await respondAdjustment('booking-1', true);
    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'respond_adjustment', booking_id: 'booking-1', approve: true },
    });
  });

  it('declines, which the server turns into a refunded cancellation', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, status: 'cancelled' }, error: null });
    const result = await respondAdjustment('booking-1', false);
    expect(mockInvoke.mock.calls[0][1].body.approve).toBe(false);
    expect(result.data?.status).toBe('cancelled');
  });

  it('surfaces the slot conflict message', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(409, {
        error: 'The longer job would overlap another booking',
        code: 'slot_conflict',
      }),
    });
    const result = await respondAdjustment('booking-1', true);
    expect(result.error?.message).toMatch(/overlap/);
  });
});

describe('proposeReschedule / respondReschedule', () => {
  it('proposes a new start', async () => {
    mockInvoke.mockResolvedValue({
      data: { ok: true, proposed_scheduled_at: '2026-10-02T15:00:00.000Z', proposed_by: 'customer' },
      error: null,
    });

    const result = await proposeReschedule('booking-1', '2026-10-02T15:00:00.000Z');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: {
        action: 'propose_reschedule',
        booking_id: 'booking-1',
        scheduled_at: '2026-10-02T15:00:00.000Z',
      },
    });
    expect(result.data?.proposed_by).toBe('customer');
  });

  it('answers a proposal', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, outcome: 'accept' }, error: null });
    const result = await respondReschedule('booking-1', true);
    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'respond_reschedule', booking_id: 'booking-1', accept: true },
    });
    expect(result.data?.outcome).toBe('accept');
  });

  it('surfaces a refusal to accept your own proposal', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(403, { error: 'You cannot accept your own proposal' }),
    });
    const result = await respondReschedule('booking-1', true);
    expect(result.error?.message).toBe('You cannot accept your own proposal');
  });

  it('turns a thrown invoke into an error result', async () => {
    mockInvoke.mockRejectedValue(new Error('network down'));
    const result = await respondReschedule('booking-1', false);
    expect(result.error?.message).toBe('network down');
  });
});
