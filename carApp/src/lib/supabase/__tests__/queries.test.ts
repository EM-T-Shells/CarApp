// ── Mocks ──────────────────────────────────────────────────────────────

type MockBuilder = {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  gte: jest.Mock
  lt: jest.Mock
  gt: jest.Mock
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
  builder.lt = jest.fn(() => builder)
  builder.gt = jest.fn(() => builder)
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
  getServiceDurationModifiers,
  getProviderDaySchedule,
  getProviderTimeOff,
  getUserById,
  getVehiclesByUser,
  getPrimaryVehicle,
  getProviderTypes,
  searchProviders,
  getProviderById,
  getProviderByUserId,
  getProvidersByService,
  getServiceCatalog,
  getServicePackagesByProvider,
  getBookingById,
  getProviderJobById,
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

describe('getProvidersByService', () => {
  it('returns approved providers with an active, approved package for the catalog id', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getProvidersByService('cat-1')

    expect(mockFrom).toHaveBeenCalledWith('provider_profiles')
    expect(builder.eq).toHaveBeenCalledWith('verification_status', 'approved')
    expect(builder.eq).toHaveBeenCalledWith('service_packages.catalog_id', 'cat-1')
    expect(builder.eq).toHaveBeenCalledWith('service_packages.is_active', true)
    expect(builder.eq).toHaveBeenCalledWith('service_packages.is_approved', true)
    expect(builder.order).toHaveBeenCalledWith('avg_gear_rating', {
      ascending: false,
    })
  })

  it('returns error when supabase returns an error', async () => {
    const dbError = new Error('DB down')
    const builder = makeBuilder({ data: null, error: dbError })
    mockFrom.mockReturnValue(builder)

    const result = await getProvidersByService('cat-1')

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
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

describe('getProviderJobById', () => {
  it('queries a single booking by id (provider job view)', async () => {
    const job = { id: 'b1', customer: { id: 'c1', full_name: 'Pat' } }
    const builder = makeBuilder({ data: job, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await getProviderJobById('b1')

    expect(result.data).toEqual(job)
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
      'pending_provider_approval',
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
      'no_show',
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

describe('getProviderDaySchedule', () => {
  const PROFILE = {
    timezone: 'America/Chicago',
    working_hours: { mon: [{ start: '09:00', end: '17:00' }] },
    max_jobs_per_day: 3,
    default_buffer_before_mins: 15,
    default_buffer_after_mins: 30,
  }

  // The profile is fetched first, then bookings and time off in parallel, so
  // the mock hands back a different builder per table.
  function mockTables(overrides: {
    profile?: { data: unknown; error: unknown }
    bookings?: { data: unknown; error: unknown }
    timeOff?: { data: unknown; error: unknown }
  } = {}) {
    const builders = {
      provider_profiles: makeBuilder(
        overrides.profile ?? { data: PROFILE, error: null },
      ),
      bookings: makeBuilder(overrides.bookings ?? { data: [], error: null }),
      provider_time_off: makeBuilder(
        overrides.timeOff ?? { data: [], error: null },
      ),
    }
    mockFrom.mockImplementation(
      (table: string) => builders[table as keyof typeof builders],
    )
    return builders
  }

  it('resolves the day window in the provider timezone, not the device one', async () => {
    const builders = mockTables()

    // 2026-03-10T02:00:00Z is 2026-03-09 20:00 in Chicago, so the local day is
    // the 9th. DST began on the 8th, so Chicago is CDT (UTC-5) and the day
    // starts at 05:00Z — neither midnight UTC nor the CST 06:00Z it would have
    // been a week earlier.
    const result = await getProviderDaySchedule(
      'p1',
      new Date('2026-03-10T02:00:00Z'),
    )

    expect(result.error).toBeNull()
    expect(result.data?.range.start).toBe('2026-03-09T05:00:00.000Z')
    expect(result.data?.range.end).toBe('2026-03-10T05:00:00.000Z')
    expect(builders.provider_profiles.eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('spans 23 hours across the spring-forward boundary', async () => {
    mockTables()

    // 2026-03-08 is the US DST transition: the local day loses an hour.
    const result = await getProviderDaySchedule(
      'p1',
      new Date('2026-03-08T18:00:00Z'),
    )

    const start = new Date(result.data!.range.start).getTime()
    const end = new Date(result.data!.range.end).getTime()
    expect((end - start) / 3_600_000).toBe(23)
  })

  it('pads the booking window by a day on each side but not the time-off one', async () => {
    const builders = mockTables()

    await getProviderDaySchedule('p1', new Date('2026-03-10T02:00:00Z'))

    // Bookings: padded, because a job's buffers reach across midnight.
    expect(builders.bookings.gte).toHaveBeenCalledWith(
      'scheduled_at',
      '2026-03-08T05:00:00.000Z',
    )
    expect(builders.bookings.lt).toHaveBeenCalledWith(
      'scheduled_at',
      '2026-03-11T05:00:00.000Z',
    )
    // Time off: exact bounds, because it is filtered on overlap already.
    expect(builders.provider_time_off.lt).toHaveBeenCalledWith(
      'starts_at',
      '2026-03-10T05:00:00.000Z',
    )
    expect(builders.provider_time_off.gt).toHaveBeenCalledWith(
      'ends_at',
      '2026-03-09T05:00:00.000Z',
    )
  })

  it('excludes cancelled and no_show, which release the slot', async () => {
    const builders = mockTables()

    await getProviderDaySchedule('p1', new Date('2026-03-10T02:00:00Z'))

    const statuses = builders.bookings.in.mock.calls[0][1] as string[]
    expect(statuses).not.toContain('cancelled')
    expect(statuses).not.toContain('no_show')
    expect(statuses).toContain('completed')
    expect(statuses).toContain('pending')
  })

  it('parses working hours and passes the buffer defaults through', async () => {
    mockTables()

    const result = await getProviderDaySchedule(
      'p1',
      new Date('2026-03-10T02:00:00Z'),
    )

    expect(result.data?.workingHours.mon).toEqual([
      { start: '09:00', end: '17:00' },
    ])
    expect(result.data?.maxJobsPerDay).toBe(3)
    expect(result.data?.defaultBufferBeforeMins).toBe(15)
    expect(result.data?.defaultBufferAfterMins).toBe(30)
  })

  it('falls back to the default zone rather than throwing on a blank timezone', async () => {
    mockTables({
      profile: { data: { ...PROFILE, timezone: '' }, error: null },
    })

    const result = await getProviderDaySchedule(
      'p1',
      new Date('2026-03-10T02:00:00Z'),
    )

    expect(result.error).toBeNull()
    expect(result.data?.timeZone).toBe('America/New_York')
  })

  it('surfaces a profile error without querying the day', async () => {
    const builders = mockTables({
      profile: { data: null, error: { message: 'nope' } },
    })

    const result = await getProviderDaySchedule('p1', new Date())

    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
    expect(builders.bookings.select).not.toHaveBeenCalled()
  })

  it('surfaces a time-off error even when the bookings query succeeded', async () => {
    mockTables({ timeOff: { data: null, error: { message: 'boom' } } })

    const result = await getProviderDaySchedule('p1', new Date())

    expect(result.data).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

describe('getProviderTimeOff', () => {
  it('filters on overlap so a block started earlier still matches', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getProviderTimeOff(
      'p1',
      new Date('2026-04-01T00:00:00Z'),
      new Date('2026-05-01T00:00:00Z'),
    )

    expect(mockFrom).toHaveBeenCalledWith('provider_time_off')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'p1')
    expect(builder.lt).toHaveBeenCalledWith(
      'starts_at',
      '2026-05-01T00:00:00.000Z',
    )
    expect(builder.gt).toHaveBeenCalledWith(
      'ends_at',
      '2026-04-01T00:00:00.000Z',
    )
  })
})

describe('getServiceDurationModifiers', () => {
  it('reads a provider modifiers ordered by factor', async () => {
    const builder = makeBuilder({ data: [], error: null })
    mockFrom.mockReturnValue(builder)

    await getServiceDurationModifiers('pp1')

    expect(mockFrom).toHaveBeenCalledWith('service_duration_modifiers')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'pp1')
    expect(builder.order).toHaveBeenCalledWith('factor_type', {
      ascending: true,
    })
  })
})
