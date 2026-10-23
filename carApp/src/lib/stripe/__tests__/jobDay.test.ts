// Client wrappers on the Phase 4 job-day path: reportDelay, and the older
// actions whose server errors now reach the provider instead of invoke()'s
// generic non-2xx string. Mocks supabase.functions.invoke, so this proves
// payload shape and error handling; the server half is
// supabase/functions/_shared/__tests__/eta.test.ts and the verifiers.

import { acceptBooking, captureBalance, markNoShow, reportDelay } from '../index';

const mockInvoke = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

jest.mock('@stripe/stripe-react-native', () => ({
  initPaymentSheet: jest.fn(),
  presentPaymentSheet: jest.fn(),
  PaymentSheetError: { Canceled: 'Canceled', Failed: 'Failed' },
}));

beforeEach(() => {
  mockInvoke.mockReset();
});

/** A FunctionsHttpError-shaped rejection carrying the Edge Function's body. */
function functionError(status: number, body: Record<string, unknown>) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status }),
  };
}

describe('reportDelay', () => {
  it('sends the delay as an absolute figure and returns the knock-on', async () => {
    const affected = [
      {
        booking_id: 'b-2',
        customer_name: 'Jane',
        scheduled_at: '2031-12-01T18:00:00.000Z',
        projected_start_at: '2031-12-01T18:30:00.000Z',
        required_delay_mins: 30,
        current_delay_mins: 0,
      },
    ];
    mockInvoke.mockResolvedValue({
      data: {
        ok: true,
        running_late_mins: 45,
        estimated_completion_at: '2031-12-01T17:45:00.000Z',
        notified: true,
        affected,
      },
      error: null,
    });

    const result = await reportDelay('b-1', 45);

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'report_delay', booking_id: 'b-1', delay_mins: 45 },
    });
    expect(result.error).toBeNull();
    expect(result.data?.notified).toBe(true);
    expect(result.data?.affected).toEqual(affected);
  });

  it('surfaces the server’s reason, not a status code', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(409, {
        error: 'This job is more than a day away. Propose a new time instead.',
      }),
    });

    const result = await reportDelay('b-1', 15);

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(
      'This job is more than a day away. Propose a new time instead.',
    );
  });
});

describe('older actions now report the server’s reason', () => {
  it('captureBalance', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(409, {
        error: 'A booking in status confirmed has not started, so it cannot be completed',
      }),
    });
    const result = await captureBalance('b-1');
    expect(result.error?.message).toBe(
      'A booking in status confirmed has not started, so it cannot be completed',
    );
  });

  it('markNoShow', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(403, { error: 'Not authorized to act on this booking' }),
    });
    const result = await markNoShow('b-1');
    expect(result.error?.message).toBe('Not authorized to act on this booking');
  });

  it('acceptBooking', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: functionError(403, { error: 'Not authorized to act on this booking' }),
    });
    const result = await acceptBooking('b-1');
    expect(result.error?.message).toBe('Not authorized to act on this booking');
  });
});
