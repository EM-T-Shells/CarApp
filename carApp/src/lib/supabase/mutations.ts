import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './client'
import { containsFlaggedContent } from '../../utils/validators'
import type {
  Booking,
  BookingInsert,
  BookingPhoto,
  BookingPhotoInsert,
  BookingUpdate,
  Kudos,
  KudosInsert,
  Message,
  MessageInsert,
  MessageThread,
  MessageThreadInsert,
  Notification,
  PromoRedemption,
  PromoRedemptionInsert,
  ProviderProfile,
  ProviderProfileInsert,
  ProviderProfileUpdate,
  ProviderVettingUpdate,
  Rating,
  RatingInsert,
  RatingUpdate,
  ServicePackage,
  ServicePackageInsert,
  ServicePackageUpdate,
  User,
  UserUpdate,
  Vehicle,
  VehicleInsert,
  VehicleUpdate,
} from '../../types/models'

// ── Result Types ───────────────────────────────────────────────────────

export type MutationResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error }

type DbResponse<T> = { data: T | null; error: PostgrestError | null }

// ── Helpers ────────────────────────────────────────────────────────────

function unknownError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

async function runMutation<T>(
  builder: PromiseLike<DbResponse<T>>,
): Promise<MutationResult<T>> {
  try {
    const { data, error } = await builder
    if (error) return { data: null, error }
    if (data === null) return { data: null, error: new Error('No data returned') }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

async function runVoid(
  builder: PromiseLike<{ error: PostgrestError | null }>,
): Promise<MutationResult<true>> {
  try {
    const { error } = await builder
    if (error) return { data: null, error }
    return { data: true, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

// ── Users ──────────────────────────────────────────────────────────────

export function updateUser(
  userId: string,
  updates: UserUpdate,
): Promise<MutationResult<User>> {
  return runMutation<User>(
    supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single(),
  )
}

// ── Vehicles ───────────────────────────────────────────────────────────

export function insertVehicle(
  vehicle: VehicleInsert,
): Promise<MutationResult<Vehicle>> {
  return runMutation<Vehicle>(
    supabase.from('vehicles').insert(vehicle).select().single(),
  )
}

export function updateVehicle(
  vehicleId: string,
  updates: VehicleUpdate,
): Promise<MutationResult<Vehicle>> {
  return runMutation<Vehicle>(
    supabase
      .from('vehicles')
      .update(updates)
      .eq('id', vehicleId)
      .select()
      .single(),
  )
}

export function deleteVehicle(
  vehicleId: string,
): Promise<MutationResult<true>> {
  return runVoid(
    supabase.from('vehicles').delete().eq('id', vehicleId),
  )
}

// ── Provider Profiles ──────────────────────────────────────────────────

export function insertProviderProfile(
  profile: ProviderProfileInsert,
): Promise<MutationResult<ProviderProfile>> {
  return runMutation<ProviderProfile>(
    supabase.from('provider_profiles').insert(profile).select().single(),
  )
}

export function updateProviderProfile(
  providerId: string,
  updates: ProviderProfileUpdate,
): Promise<MutationResult<ProviderProfile>> {
  return runMutation<ProviderProfile>(
    supabase
      .from('provider_profiles')
      .update(updates)
      .eq('id', providerId)
      .select()
      .single(),
  )
}

// ── Provider Vetting ───────────────────────────────────────────────────

export function updateProviderVetting(
  providerId: string,
  updates: ProviderVettingUpdate,
): Promise<MutationResult<true>> {
  return runVoid(
    supabase
      .from('provider_vetting')
      .update(updates)
      .eq('provider_id', providerId),
  )
}

// ── Service Packages ───────────────────────────────────────────────────

export function insertServicePackage(
  pkg: ServicePackageInsert,
): Promise<MutationResult<ServicePackage>> {
  return runMutation<ServicePackage>(
    supabase.from('service_packages').insert(pkg).select().single(),
  )
}

export function updateServicePackage(
  packageId: string,
  updates: ServicePackageUpdate,
): Promise<MutationResult<ServicePackage>> {
  return runMutation<ServicePackage>(
    supabase
      .from('service_packages')
      .update(updates)
      .eq('id', packageId)
      .select()
      .single(),
  )
}

export function deleteServicePackage(
  packageId: string,
): Promise<MutationResult<true>> {
  return runVoid(
    supabase.from('service_packages').delete().eq('id', packageId),
  )
}

// ── Bookings ───────────────────────────────────────────────────────────

export function insertBooking(
  booking: BookingInsert,
): Promise<MutationResult<Booking>> {
  return runMutation<Booking>(
    supabase.from('bookings').insert(booking).select().single(),
  )
}

export function updateBooking(
  bookingId: string,
  updates: BookingUpdate,
): Promise<MutationResult<Booking>> {
  return runMutation<Booking>(
    supabase
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .select()
      .single(),
  )
}

// ── Booking Photos ─────────────────────────────────────────────────────

export function insertBookingPhoto(
  photo: BookingPhotoInsert,
): Promise<MutationResult<BookingPhoto>> {
  return runMutation<BookingPhoto>(
    supabase.from('booking_photos').insert(photo).select().single(),
  )
}

// ── Ratings ────────────────────────────────────────────────────────────

export function insertRating(
  rating: RatingInsert,
): Promise<MutationResult<Rating>> {
  return runMutation<Rating>(
    supabase.from('ratings').insert(rating).select().single(),
  )
}

export function updateRating(
  ratingId: string,
  updates: RatingUpdate,
): Promise<MutationResult<Rating>> {
  return runMutation<Rating>(
    supabase
      .from('ratings')
      .update(updates)
      .eq('id', ratingId)
      .select()
      .single(),
  )
}

// ── Kudos ──────────────────────────────────────────────────────────────

export function insertKudos(
  kudos: KudosInsert,
): Promise<MutationResult<Kudos>> {
  return runMutation<Kudos>(
    supabase.from('kudos').insert(kudos).select().single(),
  )
}

// ── Message Threads ────────────────────────────────────────────────────

export function insertMessageThread(
  thread: MessageThreadInsert,
): Promise<MutationResult<MessageThread>> {
  return runMutation<MessageThread>(
    supabase.from('message_threads').insert(thread).select().single(),
  )
}

// ── Messages ───────────────────────────────────────────────────────────

export function insertMessage(
  message: MessageInsert,
): Promise<MutationResult<Message>> {
  const body = message.body ?? ''
  const sanitizedMessage: MessageInsert = containsFlaggedContent(body)
    ? { ...message, body: '[Message flagged for review]', is_flagged: true }
    : message

  return runMutation<Message>(
    supabase.from('messages').insert(sanitizedMessage).select().single(),
  )
}

// ── Notifications ──────────────────────────────────────────────────────

export function markNotificationRead(
  notificationId: string,
): Promise<MutationResult<true>> {
  return runVoid(
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId),
  )
}

export function markAllNotificationsRead(
  userId: string,
): Promise<MutationResult<true>> {
  return runVoid(
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false),
  )
}

// ── Promo Redemptions ──────────────────────────────────────────────────

export function insertPromoRedemption(
  redemption: PromoRedemptionInsert,
): Promise<MutationResult<PromoRedemption>> {
  return runMutation<PromoRedemption>(
    supabase.from('promo_redemptions').insert(redemption).select().single(),
  )
}
