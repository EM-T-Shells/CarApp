// tracking.test.ts — unit tests for the provider GPS sender (Flow 5.4).

const mockInvoke = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { sendProviderLocation } from '../tracking';

beforeEach(() => {
  mockInvoke.mockReset();
});

describe('sendProviderLocation', () => {
  const position = { latitude: 38.9, longitude: -77.3 };

  it('invokes update-provider-location with provider id and coords', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await sendProviderLocation('prov-1', position);

    expect(mockInvoke).toHaveBeenCalledWith('update-provider-location', {
      body: {
        provider_id: 'prov-1',
        latitude: 38.9,
        longitude: -77.3,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('returns an error when the edge function fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Not authorized' } });

    const result = await sendProviderLocation('prov-1', position);

    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error!.message).toBe('Not authorized');
  });

  it('wraps thrown exceptions', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'));

    const result = await sendProviderLocation('prov-1', position);

    expect(result.ok).toBe(false);
    expect(result.error!.message).toBe('offline');
  });
});
