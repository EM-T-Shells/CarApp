import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './client'
import type {
  Booking,
  BookingPhoto,
  Kudos,
  Message,
  MessageThread,
  Notification,
  Payment,
  Payout,
  Promotion,
  ProviderLocationCache,
  ProviderProfile,
  ProviderType,
  ProviderVetting,
  Rating,
  ServiceCatalog,
  ServicePackage,
  User,
  Vehicle,
} from '../../types/models'

// ── Result Types ───────────────────────────────────────────────────────

export type QueryResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error }

type DbResponse<T> = { data: T | null; error: PostgrestError | null }
type ListDbResponse<T> = { data: T[] | null; error: PostgrestError | null }

// ── Joined Row Types ───────────────────────────────────────────────────

export type ProviderSummary = Pick<User, 'id' | 'full_name' | 'avatar_url'>

export type ProviderSearchResult = ProviderProfile & {
  users: ProviderSummary | null
  provider_types: Pick<ProviderType, 'id' | 'name' | 'label'> | null
}

export type ProviderDetail = ProviderProfile & {
  users: ProviderSummary | null
  provider_types: Pick<ProviderType, 'id' | 'name' | 'label'> | null
  service_packages: ServicePackage[]
}

export type BookingSummary = Booking & {
  provider_profiles:
    | (Pick<ProviderProfile, 'id' | 'bio' | 'avg_gear_rating'> & {
        users: ProviderSummary | null
      })
    | null
  vehicles: Pick<Vehicle, 'id' | 'year' | 'make' | 'model' | 'color'> | null
}

export type MessageThreadSummary = MessageThread & {
  bookings: Pick<Booking, 'id' | 'status' | 'scheduled_at'> | null
  provider_profiles:
    | (Pick<ProviderProfile, 'id'> & { users: ProviderSummary | null })
    | null
}

export type MessageWithSender = Message & {
  sender: ProviderSummary | null
}

export type ProviderSearchFilters = {
  providerTypeName?: string
  minRating?: number
  sortBy?: 'rating' | 'newest'
}

// ── Helpers ────────────────────────────────────────────────────────────

function unknownError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

async function runSingle<T>(
  builder: PromiseLike<DbResponse<T>>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await builder
    if (error) return { data: null, error }
    if (data === null) return { data: null, error: new Error('Not found') }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

async function runMaybe<T>(
  builder: PromiseLike<DbResponse<T>>,
): Promise<QueryResult<T | null>> {
  try {
    const { data, error } = await builder
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

async function runList<T>(
  builder: PromiseLike<ListDbResponse<T>>,
): Promise<QueryResult<T[]>> {
  try {
    const { data, error } = await builder
    if (error) return { data: null, error }
    return { data: data ?? [], error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

// ── Users ──────────────────────────────────────────────────────────────

export function getUserById(userId: string): Promise<QueryResult<User>> {
  return runSingle<User>(
    supabase.from('users').select('*').eq('id', userId).single(),
  )
}

// ── Vehicles ───────────────────────────────────────────────────────────

export function getVehiclesByUser(
  userId: string,
): Promise<QueryResult<Vehicle[]>> {
  return runList<Vehicle>(
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false }),
  )
}

export function getPrimaryVehicle(
  userId: string,
): Promise<QueryResult<Vehicle | null>> {
  return runMaybe<Vehicle>(
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .eq('is_primary', true)
      .maybeSingle(),
  )
}

export function getVehicleById(
  vehicleId: string,
): Promise<QueryResult<Vehicle>> {
  return runSingle<Vehicle>(
    supabase.from('vehicles').select('*').eq('id', vehicleId).single(),
  )
}

// ── Provider Types ─────────────────────────────────────────────────────

export function getProviderTypes(): Promise<QueryResult<ProviderType[]>> {
  return runList<ProviderType>(
    supabase
      .from('provider_types')
      .select('*')
      .eq('is_active', true)
      .order('label', { ascending: true }),
  )
}

// ── Provider Profiles ──────────────────────────────────────────────────

const PROVIDER_SEARCH_SELECT = `*,
  users(id, full_name, avatar_url),
  provider_types(id, name, label)`

const PROVIDER_DETAIL_SELECT = `*,
  users(id, full_name, avatar_url),
  provider_types(id, name, label),
  service_packages(*)`

export function searchProviders(
  filters: ProviderSearchFilters = {},
): Promise<QueryResult<ProviderSearchResult[]>> {
  let query = supabase
    .from('provider_profiles')
    .select(PROVIDER_SEARCH_SELECT)
    .eq('verification_status', 'approved')

  if (filters.minRating !== undefined) {
    query = query.gte('avg_gear_rating', filters.minRating)
  }
  if (filters.providerTypeName) {
    query = query.eq('provider_types.name', filters.providerTypeName)
  }

  const sortColumn =
    filters.sortBy === 'newest' ? 'created_at' : 'avg_gear_rating'
  const finalQuery = query
    .order(sortColumn, { ascending: false })
    .returns<ProviderSearchResult[]>()

  return runList<ProviderSearchResult>(finalQuery)
}

export function getProviderById(
  providerId: string,
): Promise<QueryResult<ProviderDetail>> {
  return runSingle<ProviderDetail>(
    supabase
      .from('provider_profiles')
      .select(PROVIDER_DETAIL_SELECT)
      .eq('id', providerId)
      .single()
      .returns<ProviderDetail>(),
  )
}

export function getProviderByUserId(
  userId: string,
): Promise<QueryResult<ProviderProfile | null>> {
  return runMaybe<ProviderProfile>(
    supabase
      .from('provider_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  )
}

// ── Provider Vetting ───────────────────────────────────────────────────

export function getProviderVetting(
  providerId: string,
): Promise<QueryResult<ProviderVetting | null>> {
  return runMaybe<ProviderVetting>(
    supabase
      .from('provider_vetting')
      .select('*')
      .eq('provider_id', providerId)
      .maybeSingle(),
  )
}

// ── Service Catalog ────────────────────────────────────────────────────

export function getServiceCatalog(
  providerTypeId?: string,
): Promise<QueryResult<ServiceCatalog[]>> {
  let query = supabase
    .from('service_catalog')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })

  if (providerTypeId) {
    query = query.eq('provider_type_id', providerTypeId)
  }

  return runList<ServiceCatalog>(query)
}

// ── Service Packages ───────────────────────────────────────────────────

export function getServicePackagesByProvider(
  providerId: string,
): Promise<QueryResult<ServicePackage[]>> {
  return runList<ServicePackage>(
    supabase
      .from('service_packages')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .eq('is_approved', true)
      .order('sort_order', { ascending: true }),
  )
}

// ── Bookings ───────────────────────────────────────────────────────────

const BOOKING_SUMMARY_SELECT = `*,
  provider_profiles(
    id, bio, avg_gear_rating,
    users(id, full_name, avatar_url)
  ),
  vehicles(id, year, make, model, color)`

const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'en_route',
  'in_progress',
] as const

const HISTORY_BOOKING_STATUSES = ['completed', 'cancelled'] as const

export function getBookingById(
  bookingId: string,
): Promise<QueryResult<BookingSummary>> {
  return runSingle<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('id', bookingId)
      .single()
      .returns<BookingSummary>(),
  )
}

export function getUpcomingBookingsForCustomer(
  customerId: string,
): Promise<QueryResult<BookingSummary[]>> {
  return runList<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('customer_id', customerId)
      .in('status', [...ACTIVE_BOOKING_STATUSES])
      .order('scheduled_at', { ascending: true })
      .returns<BookingSummary[]>(),
  )
}

export function getPastBookingsForCustomer(
  customerId: string,
): Promise<QueryResult<BookingSummary[]>> {
  return runList<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('customer_id', customerId)
      .in('status', [...HISTORY_BOOKING_STATUSES])
      .order('scheduled_at', { ascending: false })
      .returns<BookingSummary[]>(),
  )
}

export function getUpcomingBookingsForProvider(
  providerId: string,
): Promise<QueryResult<BookingSummary[]>> {
  return runList<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('provider_id', providerId)
      .in('status', [...ACTIVE_BOOKING_STATUSES])
      .order('scheduled_at', { ascending: true })
      .returns<BookingSummary[]>(),
  )
}

export function getPastBookingsForProvider(
  providerId: string,
): Promise<QueryResult<BookingSummary[]>> {
  return runList<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('provider_id', providerId)
      .in('status', [...HISTORY_BOOKING_STATUSES])
      .order('scheduled_at', { ascending: false })
      .returns<BookingSummary[]>(),
  )
}

export function getActiveBookingForCustomer(
  customerId: string,
): Promise<QueryResult<BookingSummary | null>> {
  return runMaybe<BookingSummary>(
    supabase
      .from('bookings')
      .select(BOOKING_SUMMARY_SELECT)
      .eq('customer_id', customerId)
      .in('status', ['en_route', 'in_progress'])
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .returns<BookingSummary>(),
  )
}

// ── Booking Photos ─────────────────────────────────────────────────────

export function getBookingPhotos(
  bookingId: string,
): Promise<QueryResult<BookingPhoto[]>> {
  return runList<BookingPhoto>(
    supabase
      .from('booking_photos')
      .select('*')
      .eq('booking_id', bookingId)
      .order('uploaded_at', { ascending: true }),
  )
}

// ── Payments ───────────────────────────────────────────────────────────

export function getPaymentsByBooking(
  bookingId: string,
): Promise<QueryResult<Payment[]>> {
  return runList<Payment>(
    supabase
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('processed_at', { ascending: false }),
  )
}

export function getPaymentsByUser(
  userId: string,
): Promise<QueryResult<Payment[]>> {
  return runList<Payment>(
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('processed_at', { ascending: false }),
  )
}

// ── Payouts ────────────────────────────────────────────────────────────

export function getPayoutsByProvider(
  providerId: string,
): Promise<QueryResult<Payout[]>> {
  return runList<Payout>(
    supabase
      .from('payouts')
      .select('*')
      .eq('provider_id', providerId)
      .order('paid_at', { ascending: false, nullsFirst: false }),
  )
}

// ── Ratings ────────────────────────────────────────────────────────────

export function getRatingByBooking(
  bookingId: string,
): Promise<QueryResult<Rating | null>> {
  return runMaybe<Rating>(
    supabase
      .from('ratings')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle(),
  )
}

export function getRatingsForProviderUser(
  providerUserId: string,
): Promise<QueryResult<Rating[]>> {
  return runList<Rating>(
    supabase
      .from('ratings')
      .select('*')
      .eq('reviewee_id', providerUserId)
      .order('created_at', { ascending: false }),
  )
}

// ── Kudos ──────────────────────────────────────────────────────────────

export function getKudosForProviderUser(
  providerUserId: string,
): Promise<QueryResult<Kudos[]>> {
  return runList<Kudos>(
    supabase
      .from('kudos')
      .select('*')
      .eq('receiver_id', providerUserId)
      .order('created_at', { ascending: false }),
  )
}

export function getKudosByBooking(
  bookingId: string,
): Promise<QueryResult<Kudos[]>> {
  return runList<Kudos>(
    supabase.from('kudos').select('*').eq('booking_id', bookingId),
  )
}

// ── Message Threads ────────────────────────────────────────────────────

const THREAD_SUMMARY_SELECT = `*,
  bookings(id, status, scheduled_at),
  provider_profiles(
    id,
    users(id, full_name, avatar_url)
  )`

export function getThreadsForCustomer(
  customerId: string,
): Promise<QueryResult<MessageThreadSummary[]>> {
  return runList<MessageThreadSummary>(
    supabase
      .from('message_threads')
      .select(THREAD_SUMMARY_SELECT)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .returns<MessageThreadSummary[]>(),
  )
}

export function getThreadsForProvider(
  providerId: string,
): Promise<QueryResult<MessageThreadSummary[]>> {
  return runList<MessageThreadSummary>(
    supabase
      .from('message_threads')
      .select(THREAD_SUMMARY_SELECT)
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false })
      .returns<MessageThreadSummary[]>(),
  )
}

export function getThreadById(
  threadId: string,
): Promise<QueryResult<MessageThreadSummary>> {
  return runSingle<MessageThreadSummary>(
    supabase
      .from('message_threads')
      .select(THREAD_SUMMARY_SELECT)
      .eq('id', threadId)
      .single()
      .returns<MessageThreadSummary>(),
  )
}

export function getThreadByBooking(
  bookingId: string,
): Promise<QueryResult<MessageThread | null>> {
  return runMaybe<MessageThread>(
    supabase
      .from('message_threads')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle(),
  )
}

// ── Messages ───────────────────────────────────────────────────────────

export function getMessages(
  threadId: string,
): Promise<QueryResult<MessageWithSender[]>> {
  return runList<MessageWithSender>(
    supabase
      .from('messages')
      .select(`*, sender:users!sender_id(id, full_name, avatar_url)`)
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: true })
      .returns<MessageWithSender[]>(),
  )
}

// ── Notifications ──────────────────────────────────────────────────────

export function getNotifications(
  userId: string,
): Promise<QueryResult<Notification[]>> {
  return runList<Notification>(
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  )
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<QueryResult<number>> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) return { data: null, error }
    return { data: count ?? 0, error: null }
  } catch (err) {
    return { data: null, error: unknownError(err) }
  }
}

// ── Promotions ─────────────────────────────────────────────────────────

export function getPromotionByCode(
  code: string,
): Promise<QueryResult<Promotion | null>> {
  return runMaybe<Promotion>(
    supabase.from('promotions').select('*').eq('code', code).maybeSingle(),
  )
}

// ── Provider Location Cache ────────────────────────────────────────────

export function getProviderLocation(
  providerId: string,
): Promise<QueryResult<ProviderLocationCache | null>> {
  return runMaybe<ProviderLocationCache>(
    supabase
      .from('provider_location_cache')
      .select('*')
      .eq('provider_id', providerId)
      .maybeSingle(),
  )
}
