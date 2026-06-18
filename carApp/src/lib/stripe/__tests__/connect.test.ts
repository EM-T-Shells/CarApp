import { startConnectOnboarding, refreshConnectStatus } from '../connect';

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

describe('startConnectOnboarding', () => {
  it('returns the hosted onboarding URL on success', async () => {
    mockInvoke.mockResolvedValue({
      data: { configured: true, url: 'https://connect.stripe.com/setup/abc', account_id: 'acct_1' },
      error: null,
    });

    const result = await startConnectOnboarding('pp-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'connect_onboarding', provider_id: 'pp-1' },
    });
    expect(result.configured).toBe(true);
    expect(result.url).toBe('https://connect.stripe.com/setup/abc');
  });

  it('surfaces an edge function error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Connect disabled' } });

    const result = await startConnectOnboarding('pp-1');

    expect(result.configured).toBe(false);
    expect(result.error).toBe('Connect disabled');
    expect(result.url).toBeUndefined();
  });

  it('reports not configured when no url is returned', async () => {
    mockInvoke.mockResolvedValue({ data: { configured: false }, error: null });

    const result = await startConnectOnboarding('pp-1');

    expect(result.configured).toBe(false);
    expect(result.url).toBeUndefined();
  });
});

describe('refreshConnectStatus', () => {
  it.each([
    ['approved'],
    ['pending'],
    ['not_started'],
  ])('passes through the %s state', async (state) => {
    mockInvoke.mockResolvedValue({ data: { state }, error: null });

    const result = await refreshConnectStatus('pp-1');

    expect(mockInvoke).toHaveBeenCalledWith('stripe-webhook', {
      body: { action: 'connect_status', provider_id: 'pp-1' },
    });
    expect(result.state).toBe(state);
  });

  it('falls back to pending on error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await refreshConnectStatus('pp-1');

    expect(result.state).toBe('pending');
    expect(result.error).toBe('boom');
  });
});
