// The Phase 4 reads: the booking Realtime subscription and the calibration
// report. Mocks the client, so this proves the channel, filter and RPC shape;
// that the report shows each party only what it should is proven against the
// live database by migrations/__tests__/live_eta_and_calibration.test.sql.

type Handler = () => void

const mockOn = jest.fn()
const mockSubscribe = jest.fn()
const mockChannel = jest.fn()
const mockRemoveChannel = jest.fn()
const mockRpc = jest.fn()

jest.mock('../client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import { getDurationCalibration, subscribeToBookingChanges } from '../queries'

beforeEach(() => {
  jest.clearAllMocks()
  const channel = { on: mockOn, subscribe: mockSubscribe }
  mockChannel.mockReturnValue(channel)
  mockOn.mockReturnValue(channel)
  mockSubscribe.mockReturnValue(channel)
})

describe('subscribeToBookingChanges', () => {
  it('listens to updates of this one booking on booking:{id}', () => {
    const onChange = jest.fn()
    subscribeToBookingChanges('b-1', onChange)

    expect(mockChannel).toHaveBeenCalledWith('booking:b-1')
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bookings', filter: 'id=eq.b-1' },
      expect.any(Function),
    )
    expect(mockSubscribe).toHaveBeenCalled()

    const handler = mockOn.mock.calls[0][2] as Handler
    handler()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('removes the channel on unsubscribe', () => {
    const unsubscribe = subscribeToBookingChanges('b-1', jest.fn())
    unsubscribe()
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel.mock.results[0].value)
  })
})

describe('getDurationCalibration', () => {
  it('calls the report with the start of the period', async () => {
    const rows = [{ provider_id: 'p-1', completed_jobs: 4 }]
    mockRpc.mockReturnValue(Promise.resolve({ data: rows, error: null }))

    const result = await getDurationCalibration(new Date('2026-07-01T00:00:00Z'))

    expect(mockRpc).toHaveBeenCalledWith('get_duration_calibration', {
      p_since: '2026-07-01T00:00:00.000Z',
    })
    expect(result).toEqual({ data: rows, error: null })
  })

  it('returns the error rather than throwing', async () => {
    const dbError = new Error('permission denied')
    mockRpc.mockReturnValue(Promise.resolve({ data: null, error: dbError }))

    const result = await getDurationCalibration(new Date())

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
  })
})
