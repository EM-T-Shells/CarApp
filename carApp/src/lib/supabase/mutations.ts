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
  UserInsert,
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

// Fire-and-forget invocation of a notify-* Edge Function. A push failure must
// never surface to the caller or roll back the underlying mutation, so errors
// are swallowed (the function also records an in-app notifications row, and
// pushes are best-effort by nature).
function fireNotify(fn: string, body: Record<string, unknown>): void {
  try {
    const pending = supabase.functions?.invoke(fn, { body })
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => {
        /* best-effort push — ignore */
      })
    }
  } catch {
    /* best-effort push — ignore */
  }
}

// ── Users ──────────────────────────────────────────────────────────────

export function insertUser(
  user: UserInsert,
): Promise<MutationResult<User>> {
  return runMutation<User>(
    supabase.from('users').insert(user).select().single(),
  )
}

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

// FCM push token write — Flow 2.9. Narrowed view of UserUpdate that only
// exposes the three FCM columns so the push.ts client can't accidentally
// overwrite unrelated user fields.
export interface PushTokenUpdate {
  fcm_token: string | null
  fcm_token_platform: 'ios' | 'android' | null
  fcm_token_updated_at: string
}

export function updateUserPushToken(
  userId: string,
  updates: PushTokenUpdate,
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

export async function updateBooking(
  bookingId: string,
  updates: BookingUpdate,
): Promise<MutationResult<Booking>> {
  const result = await runMutation<Booking>(
    supabase
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .select()
      .single(),
  )

  // Notify the customer when the provider goes en route. (booking_confirmed
  // and job_complete pushes fire server-side from stripe-webhook, where those
  // status transitions actually occur.)
  if (result.data && updates.status === 'en_route') {
    fireNotify('notify-provider-enroute', { booking_id: bookingId })
  }

  return result
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

export async function insertKudos(
  kudos: KudosInsert,
): Promise<MutationResult<Kudos>> {
  const result = await runMutation<Kudos>(
    supabase.from('kudos').insert(kudos).select().single(),
  )

  // Push the provider a "you received kudos" notification.
  if (result.data?.id) {
    fireNotify('notify-kudos-received', { kudos_id: result.data.id })
  }

  return result
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

// Error thrown back to the sender when a message contains contact info or an
// attempt to move off-platform. Carries a flag so callers can distinguish a
// moderation block from a transport error (Spec §7 / Non-Negotiable #4: block
// + warn the sender, never store the message).
export class FlaggedContentError extends Error {
  readonly flagged = true
  constructor(message = 'Message blocked: remove phone numbers, emails, or off-platform contact info and try again.') {
    super(message)
    this.name = 'FlaggedContentError'
  }
}

/** Type guard for distinguishing a moderation block from a transport error. */
export function isFlaggedContentError(
  err: Error | null,
): err is FlaggedContentError {
  return err instanceof FlaggedContentError || (err as { flagged?: boolean })?.flagged === true
}

export function insertMessage(
  message: MessageInsert,
): Promise<MutationResult<Message>> {
  const body = message.body ?? ''
  if (containsFlaggedContent(body)) {
    // Block the send entirely — do not store a sanitized copy. The sender is
    // warned inline and can edit and retry.
    return Promise.resolve({ data: null, error: new FlaggedContentError() })
  }

  return runMutation<Message>(
    supabase.from('messages').insert(message).select().single(),
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
