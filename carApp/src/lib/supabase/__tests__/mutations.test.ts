// ── Mocks ──────────────────────────────────────────────────────────────

type MockBuilder = {
  insert: jest.Mock
  update: jest.Mock
  delete: jest.Mock
  select: jest.Mock
  eq: jest.Mock
  single: jest.Mock
  then: (
    onFulfilled?:
      | ((value: { data: unknown; error: unknown }) => unknown)
      | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>
}

function makeBuilder(
  resolveWith: { data: unknown; error: unknown },
): MockBuilder {
  const builder = {} as MockBuilder
  builder.insert = jest.fn(() => builder)
  builder.update = jest.fn(() => builder)
  builder.delete = jest.fn(() => builder)
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.single = jest.fn(() => builder)
  builder.then = (onFulfilled) => Promise.resolve(resolveWith).then(onFulfilled)
  return builder
}

const mockFrom = jest.fn()

jest.mock('../client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

jest.mock('../../../utils/validators', () => ({
  containsFlaggedContent: jest.fn(() => false),
}))

import { containsFlaggedContent } from '../../../utils/validators'
import {
  updateUser,
  insertVehicle,
  updateVehicle,
  deleteVehicle,
  insertProviderProfile,
  updateProviderProfile,
  updateProviderVetting,
  insertServicePackage,
  updateServicePackage,
  deleteServicePackage,
  insertBooking,
  updateBooking,
  insertBookingPhoto,
  insertRating,
  updateRating,
  insertKudos,
  insertMessageThread,
  insertMessage,
  markNotificationRead,
  markAllNotificationsRead,
  insertPromoRedemption,
} from '../mutations'

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Users ──────────────────────────────────────────────────────────────

describe('updateUser', () => {
  it('updates and returns the user row', async () => {
    const user = { id: 'u1', full_name: 'Updated' }
    const builder = makeBuilder({ data: user, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateUser('u1', { full_name: 'Updated' })

    expect(result.data).toEqual(user)
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(builder.update).toHaveBeenCalledWith({ full_name: 'Updated' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'u1')
    expect(builder.select).toHaveBeenCalled()
    expect(builder.single).toHaveBeenCalled()
  })

  it('returns error on failure', async () => {
    const dbError = new Error('DB error')
    const builder = makeBuilder({ data: null, error: dbError })
    mockFrom.mockReturnValue(builder)

    const result = await updateUser('u1', { full_name: 'X' })

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
  })
})

// ── Vehicles ───────────────────────────────────────────────────────────

describe('insertVehicle', () => {
  it('inserts and returns the new vehicle', async () => {
    const vehicle = { id: 'v1', user_id: 'u1', year: '2024', make: 'Tesla', model: 'Model 3' }
    const builder = makeBuilder({ data: vehicle, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertVehicle({
      user_id: 'u1',
      year: '2024',
      make: 'Tesla',
      model: 'Model 3',
    })

    expect(result.data).toEqual(vehicle)
    expect(result.error).toBeNull()
    expect(mockFrom).toHaveBeenCalledWith('vehicles')
    expect(builder.insert).toHaveBeenCalled()
  })
})

describe('updateVehicle', () => {
  it('updates and returns the vehicle', async () => {
    const vehicle = { id: 'v1', color: 'Red' }
    const builder = makeBuilder({ data: vehicle, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateVehicle('v1', { color: 'Red' })

    expect(result.data).toEqual(vehicle)
    expect(builder.eq).toHaveBeenCalledWith('id', 'v1')
  })
})

describe('deleteVehicle', () => {
  it('deletes without error', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await deleteVehicle('v1')

    expect(result.data).toBe(true)
    expect(result.error).toBeNull()
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'v1')
  })

  it('returns error on delete failure', async () => {
    const dbError = new Error('FK constraint')
    const builder = makeBuilder({ data: null, error: dbError })
    mockFrom.mockReturnValue(builder)

    const result = await deleteVehicle('v1')

    expect(result.data).toBeNull()
    expect(result.error).toBe(dbError)
  })
})

// ── Provider Profiles ──────────────────────────────────────────────────

describe('insertProviderProfile', () => {
  it('inserts and returns the profile', async () => {
    const profile = { id: 'pp1', user_id: 'u1' }
    const builder = makeBuilder({ data: profile, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertProviderProfile({ user_id: 'u1' })

    expect(result.data).toEqual(profile)
    expect(mockFrom).toHaveBeenCalledWith('provider_profiles')
  })
})

describe('updateProviderProfile', () => {
  it('updates and returns the profile', async () => {
    const profile = { id: 'pp1', bio: 'Updated bio' }
    const builder = makeBuilder({ data: profile, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateProviderProfile('pp1', { bio: 'Updated bio' })

    expect(result.data).toEqual(profile)
    expect(builder.eq).toHaveBeenCalledWith('id', 'pp1')
  })
})

// ── Provider Vetting ───────────────────────────────────────────────────

describe('updateProviderVetting', () => {
  it('updates vetting status', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateProviderVetting('pp1', {
      identity_status: 'approved',
    })

    expect(result.data).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('provider_vetting')
    expect(builder.eq).toHaveBeenCalledWith('provider_id', 'pp1')
  })
})

// ── Service Packages ───────────────────────────────────────────────────

describe('insertServicePackage', () => {
  it('inserts and returns the package', async () => {
    const pkg = { id: 'sp1', name: 'Full Detail' }
    const builder = makeBuilder({ data: pkg, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertServicePackage({
      provider_id: 'pp1',
      name: 'Full Detail',
      category: 'detailing',
    })

    expect(result.data).toEqual(pkg)
    expect(mockFrom).toHaveBeenCalledWith('service_packages')
  })
})

describe('deleteServicePackage', () => {
  it('deletes the package', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await deleteServicePackage('sp1')

    expect(result.data).toBe(true)
    expect(builder.delete).toHaveBeenCalled()
  })
})

// ── Bookings ───────────────────────────────────────────────────────────

describe('insertBooking', () => {
  it('inserts and returns the booking', async () => {
    const booking = { id: 'b1', status: 'pending' }
    const builder = makeBuilder({ data: booking, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertBooking({
      customer_id: 'u1',
      provider_id: 'pp1',
      scheduled_at: '2026-05-01T10:00:00Z',
    })

    expect(result.data).toEqual(booking)
    expect(mockFrom).toHaveBeenCalledWith('bookings')
  })
})

describe('updateBooking', () => {
  it('updates booking status', async () => {
    const booking = { id: 'b1', status: 'confirmed' }
    const builder = makeBuilder({ data: booking, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateBooking('b1', { status: 'confirmed' })

    expect(result.data).toEqual(booking)
    expect(builder.eq).toHaveBeenCalledWith('id', 'b1')
  })
})

// ── Booking Photos ─────────────────────────────────────────────────────

describe('insertBookingPhoto', () => {
  it('inserts and returns the photo record', async () => {
    const photo = { id: 'bp1', booking_id: 'b1' }
    const builder = makeBuilder({ data: photo, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertBookingPhoto({
      booking_id: 'b1',
      photo_type: 'before',
      storage_url: 'https://storage.example.com/photo.jpg',
    })

    expect(result.data).toEqual(photo)
    expect(mockFrom).toHaveBeenCalledWith('booking_photos')
  })
})

// ── Ratings ────────────────────────────────────────────────────────────

describe('insertRating', () => {
  it('inserts and returns the rating', async () => {
    const rating = { id: 'r1', overall_score: 4.5 }
    const builder = makeBuilder({ data: rating, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertRating({
      booking_id: 'b1',
      reviewer_id: 'u1',
      reviewee_id: 'u2',
      quality_score: 5,
      timeliness_score: 4,
      communication_score: 5,
      value_score: 4,
      overall_score: 4.5,
    })

    expect(result.data).toEqual(rating)
    expect(mockFrom).toHaveBeenCalledWith('ratings')
  })
})

describe('updateRating', () => {
  it('flags a rating', async () => {
    const rating = { id: 'r1', is_flagged: true }
    const builder = makeBuilder({ data: rating, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await updateRating('r1', { is_flagged: true })

    expect(result.data).toEqual(rating)
    expect(builder.eq).toHaveBeenCalledWith('id', 'r1')
  })
})

// ── Kudos ──────────────────────────────────────────────────────────────

describe('insertKudos', () => {
  it('inserts and returns a kudos badge', async () => {
    const kudos = { id: 'k1', badge: 'meticulous' }
    const builder = makeBuilder({ data: kudos, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertKudos({
      booking_id: 'b1',
      giver_id: 'u1',
      receiver_id: 'u2',
      badge: 'meticulous',
    })

    expect(result.data).toEqual(kudos)
    expect(mockFrom).toHaveBeenCalledWith('kudos')
  })
})

// ── Message Threads ────────────────────────────────────────────────────

describe('insertMessageThread', () => {
  it('inserts and returns the thread', async () => {
    const thread = { id: 't1', booking_id: 'b1' }
    const builder = makeBuilder({ data: thread, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertMessageThread({
      booking_id: 'b1',
      customer_id: 'u1',
      provider_id: 'pp1',
    })

    expect(result.data).toEqual(thread)
    expect(mockFrom).toHaveBeenCalledWith('message_threads')
  })
})

// ── Messages ───────────────────────────────────────────────────────────

describe('insertMessage', () => {
  it('inserts a clean message when not flagged', async () => {
    const msg = { id: 'm1', body: 'Hello!' }
    const builder = makeBuilder({ data: msg, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertMessage({
      thread_id: 't1',
      sender_id: 'u1',
      body: 'Hello!',
    })

    expect(result.data).toEqual(msg)
    expect(containsFlaggedContent).toHaveBeenCalledWith('Hello!')
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Hello!' }),
    )
  })

  it('replaces body and sets is_flagged when content is flagged', async () => {
    ;(containsFlaggedContent as jest.Mock).mockReturnValueOnce(true)
    const msg = { id: 'm2', body: '[Message flagged for review]', is_flagged: true }
    const builder = makeBuilder({ data: msg, error: null })
    mockFrom.mockReturnValue(builder)

    await insertMessage({
      thread_id: 't1',
      sender_id: 'u1',
      body: 'call me at 555-1234',
    })

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '[Message flagged for review]',
        is_flagged: true,
      }),
    )
  })
})

// ── Notifications ──────────────────────────────────────────────────────

describe('markNotificationRead', () => {
  it('marks a single notification as read', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await markNotificationRead('n1')

    expect(result.data).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('notifications')
    expect(builder.update).toHaveBeenCalledWith({ is_read: true })
    expect(builder.eq).toHaveBeenCalledWith('id', 'n1')
  })
})

describe('markAllNotificationsRead', () => {
  it('marks all unread notifications for a user as read', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await markAllNotificationsRead('u1')

    expect(result.data).toBe(true)
    expect(builder.update).toHaveBeenCalledWith({ is_read: true })
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(builder.eq).toHaveBeenCalledWith('is_read', false)
  })
})

// ── Promo Redemptions ──────────────────────────────────────────────────

describe('insertPromoRedemption', () => {
  it('inserts and returns the redemption', async () => {
    const redemption = { id: 'pr1', promo_id: 'p1' }
    const builder = makeBuilder({ data: redemption, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertPromoRedemption({
      promo_id: 'p1',
      user_id: 'u1',
      booking_id: 'b1',
      amount_applied: 10.0,
    })

    expect(result.data).toEqual(redemption)
    expect(mockFrom).toHaveBeenCalledWith('promo_redemptions')
  })
})

// ── Error handling ─────────────────────────────────────────────────────

describe('error handling', () => {
  it('catches rejected promises and wraps them', async () => {
    const builder = {} as MockBuilder
    builder.update = jest.fn(() => builder)
    builder.eq = jest.fn(() => builder)
    builder.select = jest.fn(() => builder)
    builder.single = jest.fn(() => builder)
    builder.then = (_onFulfilled, onRejected) =>
      Promise.reject(new Error('network failure')).catch(onRejected)
    mockFrom.mockReturnValue(builder)

    const result = await updateUser('u1', { full_name: 'X' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('network failure')
  })

  it('wraps non-Error thrown values', async () => {
    const builder = {} as MockBuilder
    builder.update = jest.fn(() => builder)
    builder.eq = jest.fn(() => builder)
    builder.select = jest.fn(() => builder)
    builder.single = jest.fn(() => builder)
    builder.then = (_onFulfilled, onRejected) =>
      Promise.reject('string error').catch(onRejected)
    mockFrom.mockReturnValue(builder)

    const result = await updateUser('u1', { full_name: 'X' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('string error')
  })

  it('returns "No data returned" for null data on insert', async () => {
    const builder = makeBuilder({ data: null, error: null })
    mockFrom.mockReturnValue(builder)

    const result = await insertVehicle({
      user_id: 'u1',
      year: '2024',
      make: 'BMW',
      model: 'M3',
    })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('No data returned')
  })
})
