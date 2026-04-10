// ── Mocks ──────────────────────────────────────────────────────────────

type MockBuilder = {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  gte: jest.Mock
  order: jest.Mock
  limit: jest.Mock
  single: jest.Mock
  maybeSingle: jest.Mock
  returns: jest.Mock
  then: (
    onFulfilled?:
      | ((value: { data: unknown; error: unknown; count?: number }) => unknown)
      | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

function makeBuilder(
  resolveWith: { data: unknown; error: unknown; count?: number },
): MockBuilder {
  const builder = {} as MockBuilder
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.in = jest.fn(() => builder)
  builder.gte = jest.fn(() => builder)
  builder.order = jest.fn(() => builder)
  builder.limit = jest.fn(() => builder)
  builder.single = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(() => builder)
  builder.returns = jest.fn(() => builder)
  builder.then = (onFulfilled) => Promise.resolve(resolveWith).then(onFulfilled)
  return builder
}

const mockFrom = jest.fn()

jest.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

import {
  getUserById,
  getVehiclesByUser,
  getPrimaryVehicle,
  getProviderTypes,
  searchProviders,
  getProviderById,
  getProviderByUserId,
  getServiceCatalog,
  getServicePackagesByProvider,
  getBookingById,
  getUpcomingBookingsForCustomer,
  getPastBookingsForCustomer,
  getActiveBookingForCustomer,
  getBookingPhotos,
  getPaymentsByBooking,
  getPayoutsByProvider,
  getRatingByBooking,
  getRatingsForProviderUser,
  getKudosForProviderUser,
  getThreadsForCustomer,
  getThreadById,
  getMessages,
  getNotifications,
  getUnreadNotificationCount,
  getPromotionByCode,
  getProviderLocation,
} from '../queries'

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Users ──────────────────────────────────────────────────────────────

describe('getUserById', () => {
  it('returns user on success', async () => {
    const user = { id: 'u1', full_name: 'Jane' }
    const builder = makeBuilder({ data: user, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getUserById('u1')

    expect(result.data).toEqual(user)
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.eq).toHaveBeenCalledWith('id', 'u1')
    expect(builder.single).toHaveBeenCalled()
  })

  it('returns error when supabase returns an error', async () => {
    const dbError = new Error('DB down')
    const builder = makeBuilder({ data: null, error: dbError })
    mockFrom.mockReturnValue(builder)

    const result = await getUserById('u1')

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
  })

  it('returns "Not found" when single returns null data with no error', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getUserById('u1')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Not found')
  })

  it('catches rejected promises from the query builder', async () => {
    const builder = {} as MockBuilder
    builder.select = jest.fn(() => builder)
    builder.eq = jest.fn(() => builder)
    builder.single = jest.fn(() => builder)
    builder.then = (_onFulfilled, onRejected) =>
      Promise.reject(new Error('boom')).catch(onRejected)
    mockFrom.mockReturnValue(builder)

    const result = await getUserById('u1')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('boom')
  })
})

// ── Vehicles ───────────────────────────────────────────────────────────

describe('getVehiclesByUser', () => {
  it('returns vehicle list ordered by primary then created_at', async () => {
    const vehicles = [{ id: 'v1' }, { id: 'v2' }]
    const builder = makeBuilder({ data: vehicles, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getVehiclesByUser('u1')

    expect(result.data).toEqual(vehicles)
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('vehicles')
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(builder.order).toHaveBeenNthCalledWith(1, 'is_primary', {
      ascending: false,
    })
    expect(builder.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
    })
  })

  it('returns empty array when data is null', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getVehiclesByUser('u1')

    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
  })
})

describe('getPrimaryVehicle', () => {
  it('returns null (no error) when maybeSingle finds nothing', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getPrimaryVehicle('u1')

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
    expect(builder.eq).toHaveBeenCalledWith('is_primary', true)
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})

// ── Provider Types ─────────────────────────────────────────────────────

describe('getProviderTypes', () => {
  it('queries active provider types ordered by label', async () => {
    const builder = makeBuilder({ data: [{ id: 't1' }], error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getProviderTypes()

    expect(result.data).toEqual([{ id: 't1' }])
    expect(mockFrom).toHaveBeenCalledWith('provider_types')
    expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    expect(builder.order).toHaveBeenCalledWith('label', { ascending: true })
  })
})

// ── Provider Profiles ──────────────────────────────────────────────────

describe('searchProviders', () => {
  it('filters by verification_status=approved and sorts by rating by default', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await searchProviders()

    expect(mockFrom).toHaveBeenCalledWith('provider_profiles')
    expect(builder.eq).toHaveBeenCalledWith('verification_status', 'approved')
    expect(builder.order).toHaveBeenCalledWith('avg_gear_rating', {
      ascending: false,
    })
    expect(builder.gte).not.toHaveBeenCalled()
  })

  it('applies minRating and providerTypeName filters', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await searchProviders({ minRating: 4, providerTypeName: 'DETAILER' })

    expect(builder.gte).toHaveBeenCalledWith('avg_gear_rating', 4)
    expect(builder.eq).toHaveBeenCalledWith('provider_types.name', 'DETAILER')
  })

  it('sorts by created_at when sortBy=newest', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await searchProviders({ sortBy: 'newest' })

    expect(builder.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    })
  })
})

describe('getProviderById', () => {
  it('fetches provider by id with joined relations', async () => {
    const provider = { id: 'p1' }
    const builder = makeBuilder({ data: provider, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getProviderById('p1')

    expect(result.data).toEqual(provider)
    expect(builder.eq).toHaveBeenCalledWith('id', 'p1')
    expect(builder.single).toHaveBeenCalled()
  })
})

describe('getProviderByUserId', () => {
  it('uses maybeSingle to return null when user has no provider profile', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getProviderByUserId('u1')

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})

// ── Service Catalog & Packages ─────────────────────────────────────────

describe('getServiceCatalog', () => {
  it('filters active=true and does not filter by type when omitted', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getServiceCatalog()

    expect(mockFrom).toHaveBeenCalledWith('service_catalog')
    expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    expect(builder.eq).not.toHaveBeenCalledWith(
      'provider_type_id',
      expect.anything(),
    )
  })

  it('filters by provider_type_id when supplied', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getServiceCatalog('type-1')

    expect(builder.eq).toHaveBeenCalledWith('provider_type_id', 'type-1')
  })
})

describe('getServicePackagesByProvider', () => {
  it('filters by provider id and only active + approved packages', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getServicePackagesByProvider('p1')

    expect(mockFrom).toHaveBeenCalledWith('service_packages')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'p1')
    expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    expect(builder.eq).toHaveBeenCalledWith('is_approved', true)
    expect(builder.order).toHaveBeenCalledWith('sort_order', {
      ascending: true,
    })
  })
})

// ── Bookings ───────────────────────────────────────────────────────────

describe('getBookingById', () => {
  it('queries a single booking by id', async () => {
    const booking = { id: 'b1' }
    const builder = makeBuilder({ data: booking, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getBookingById('b1')

    expect(result.data).toEqual(booking)
    expect(mockFrom).toHaveBeenCalledWith('bookings')
    expect(builder.eq).toHaveBeenCalledWith('id', 'b1')
  })
})

describe('getUpcomingBookingsForCustomer', () => {
  it('filters by customer_id and upcoming statuses, ordered ascending', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getUpcomingBookingsForCustomer('u1')

    expect(builder.eq).toHaveBeenCalledWith('customer_id', 'u1')
    expect(builder.in).toHaveBeenCalledWith('status', [
      'pending',
      'confirmed',
      'en_route',
      'in_progress',
    ])
    expect(builder.order).toHaveBeenCalledWith('scheduled_at', {
      ascending: true,
    })
  })
})

describe('getPastBookingsForCustomer', () => {
  it('filters by completed/cancelled and orders descending', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getPastBookingsForCustomer('u1')

    expect(builder.in).toHaveBeenCalledWith('status', [
      'completed',
      'cancelled',
    ])
    expect(builder.order).toHaveBeenCalledWith('scheduled_at', {
      ascending: false,
    })
  })
})

describe('getActiveBookingForCustomer', () => {
  it('filters by en_route/in_progress statuses via maybeSingle', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getActiveBookingForCustomer('u1')

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
    expect(builder.in).toHaveBeenCalledWith('status', [
      'en_route',
      'in_progress',
    ])
    expect(builder.limit).toHaveBeenCalledWith(1)
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})

// ── Photos / Payments / Payouts ────────────────────────────────────────

describe('getBookingPhotos', () => {
  it('queries booking_photos by booking_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getBookingPhotos('b1')

    expect(mockFrom).toHaveBeenCalledWith('booking_photos')
    expect(builder.eq).toHaveBeenCalledWith('booking_id', 'b1')
  })
})

describe('getPaymentsByBooking', () => {
  it('queries payments by booking_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getPaymentsByBooking('b1')

    expect(mockFrom).toHaveBeenCalledWith('payments')
    expect(builder.eq).toHaveBeenCalledWith('booking_id', 'b1')
  })
})

describe('getPayoutsByProvider', () => {
  it('orders by paid_at descending with nullsFirst false', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getPayoutsByProvider('p1')

    expect(mockFrom).toHaveBeenCalledWith('payouts')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'p1')
    expect(builder.order).toHaveBeenCalledWith('paid_at', {
      ascending: false,
      nullsFirst: false,
    })
  })
})

// ── Ratings & Kudos ────────────────────────────────────────────────────

describe('getRatingByBooking', () => {
  it('returns null with no error when rating does not exist', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getRatingByBooking('b1')

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})

describe('getRatingsForProviderUser', () => {
  it('filters by reviewee_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getRatingsForProviderUser('u1')

    expect(mockFrom).toHaveBeenCalledWith('ratings')
    expect(builder.eq).toHaveBeenCalledWith('reviewee_id', 'u1')
  })
})

describe('getKudosForProviderUser', () => {
  it('filters by receiver_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getKudosForProviderUser('u1')

    expect(mockFrom).toHaveBeenCalledWith('kudos')
    expect(builder.eq).toHaveBeenCalledWith('receiver_id', 'u1')
  })
})

// ── Threads & Messages ─────────────────────────────────────────────────

describe('getThreadsForCustomer', () => {
  it('queries threads by customer_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getThreadsForCustomer('u1')

    expect(mockFrom).toHaveBeenCalledWith('message_threads')
    expect(builder.eq).toHaveBeenCalledWith('customer_id', 'u1')
  })
})

describe('getThreadById', () => {
  it('queries single thread by id', async () => {
    const thread = { id: 't1' }
    const builder = makeBuilder({ data: thread, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getThreadById('t1')

    expect(result.data).toEqual(thread)
    expect(builder.eq).toHaveBeenCalledWith('id', 't1')
    expect(builder.single).toHaveBeenCalled()
  })
})

describe('getMessages', () => {
  it('queries messages by thread_id ordered by sent_at ascending', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getMessages('t1')

    expect(mockFrom).toHaveBeenCalledWith('messages')
    expect(builder.eq).toHaveBeenCalledWith('thread_id', 't1')
    expect(builder.order).toHaveBeenCalledWith('sent_at', { ascending: true })
  })
})

// ── Notifications ──────────────────────────────────────────────────────

describe('getNotifications', () => {
  it('queries notifications by user_id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getNotifications('u1')

    expect(mockFrom).toHaveBeenCalledWith('notifications')
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1')
  })
})

describe('getUnreadNotificationCount', () => {
  it('returns the unread count', async () => {
    const builder = makeBuilder({ data: null, error: null, count: 7 })
    mockFrom.mockReturnValue(builder)

    const result = await getUnreadNotificationCount('u1')

    expect(result.data).toBe(7)
    expect(result.error).toBeNull()
    expect(builder.select).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    })
    expect(builder.eq).toHaveBeenCalledWith('is_read', false)
  })

  it('returns 0 when count is null', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getUnreadNotificationCount('u1')

    expect(result.data).toBe(0)
  })

  it('returns error when query fails', async () => {
    const dbError = new Error('query failed')
    const builder = makeBuilder({ data: null, error: dbError })
    mockFrom.mockReturnValue(builder)

    const result = await getUnreadNotificationCount('u1')

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
  })
})

// ── Promotions ─────────────────────────────────────────────────────────

describe('getPromotionByCode', () => {
  it('queries promotion by code via maybeSingle', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getPromotionByCode('WELCOME10')

    expect(result.data).toBeNull()
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('promotions')
    expect(builder.eq).toHaveBeenCalledWith('code', 'WELCOME10')
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})

// ── Provider Location Cache ────────────────────────────────────────────

describe('getProviderLocation', () => {
  it('returns cached location for provider', async () => {
    const location = { provider_id: 'p1', latitude: 38.9, longitude: -77.0 }
    const builder = makeBuilder({ data: location, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getProviderLocation('p1')

    expect(result.data).toEqual(location)
    expect(mockFrom).toHaveBeenCalledWith('provider_location_cache')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'p1')
    expect(builder.maybeSingle).toHaveBeenCalled()
  })
})
