import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './client'
import {
  DEFAULT_TIMEZONE,
  localDayRange,
  workingHoursFromJson,
  type WorkingHours,
} from '../../utils/schedule'
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
  ProviderTimeOff,
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
  // Distance in miles from the customer's searched location to this provider's
  // base. Computed client-side (Haversine) in the search store — never returned
  // by Postgres. null when the origin or the provider's base coords are unknown.
  distance_miles?: number | null
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

// Provider-facing view of a booking — same as BookingSummary but also joins
// the customer's public profile (the provider needs the customer's name on
// the active-job screen). Used by getProviderJobById (Flows 5.4–5.6).
export type ProviderJobSummary = BookingSummary & {
  customer: ProviderSummary | null
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
  // 'distance' sorts by proximity to the searched location and is applied
  // client-side (see search store) since Postgres has no origin to sort by;
  // 'rating' / 'newest' are ordered in SQL.
  sortBy?: 'distance' | 'rating' | 'newest'
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
  users:users_public(id, full_name, avatar_url),
  provider_types(id, name, label)`

const PROVIDER_DETAIL_SELECT = `*,
  users:users_public(id, full_name, avatar_url),
  provider_types(id, name, label),
  service_packages(*)`

// Same shape as PROVIDER_SEARCH_SELECT but with an inner join on
// service_packages so a provider is only returned when it has at least one
// matching offering. The embedded rows are filtered (and thus the provider
// gated) by the eq() calls on service_packages.* in getProvidersByService.
const PROVIDERS_BY_SERVICE_SELECT = `*,
  users:users_public(id, full_name, avatar_url),
  provider_types(id, name, label),
  service_packages!inner(id, catalog_id, is_active, is_approved)`

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

  // 'distance' has no SQL ordering (Postgres has no customer origin here) —
  // fall back to rating as a stable pre-sort; the store re-orders by distance.
  const sortColumn =
    filters.sortBy === 'newest' ? 'created_at' : 'avg_gear_rating'
  const finalQuery = query
    .order(sortColumn, { ascending: false })
    .returns<ProviderSearchResult[]>()

  return runList<ProviderSearchResult>(finalQuery)
}

// Approved providers who offer a specific catalog service — i.e. that have an
// active, approved service_packages row referencing `catalogId`. Reuses the
// ProviderSearchResult shape so results render with the shared ProviderCard.
// Sorted highest-rated first (no customer origin here, so no distance sort).
export function getProvidersByService(
  catalogId: string,
): Promise<QueryResult<ProviderSearchResult[]>> {
  return runList<ProviderSearchResult>(
    supabase
      .from('provider_profiles')
      .select(PROVIDERS_BY_SERVICE_SELECT)
      .eq('verification_status', 'approved')
      .eq('service_packages.catalog_id', catalogId)
      .eq('service_packages.is_active', true)
      .eq('service_packages.is_approved', true)
      .order('avg_gear_rating', { ascending: false })
      .returns<ProviderSearchResult[]>(),
  )
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

// Owner-facing variant for the provider's own service-menu editor: returns all
// active packages regardless of approval so the provider can see/manage rows
// that are still pending admin approval (unlike the public-facing query above).
export function getProviderOwnServicePackages(
  providerId: string,
): Promise<QueryResult<ServicePackage[]>> {
  return runList<ServicePackage>(
    supabase
      .from('service_packages')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  )
}

// ── Bookings ───────────────────────────────────────────────────────────

const BOOKING_SUMMARY_SELECT = `*,
  provider_profiles(
    id, bio, avg_gear_rating,
    users:users_public(id, full_name, avatar_url)
  ),
  vehicles(id, year, make, model, color)`

const ACTIVE_BOOKING_STATUSES = [
  'pending',
  'pending_provider_approval',
  'confirmed',
  'en_route',
  'in_progress',
] as const

const HISTORY_BOOKING_STATUSES = ['completed', 'cancelled', 'no_show'] as const

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

// Provider job detail — joins the customer's public profile in addition to
// the provider + vehicle, so the active-job screen can show who the job is
// for. Reached from the provider dashboard Jobs tab (Flows 5.4–5.6).
const PROVIDER_JOB_SELECT = `*,
  provider_profiles(
    id, bio, avg_gear_rating,
    users:users_public(id, full_name, avatar_url)
  ),
  vehicles(id, year, make, model, color),
  customer:users_public!customer_id(id, full_name, avatar_url)`

export function getProviderJobById(
  bookingId: string,
): Promise<QueryResult<ProviderJobSummary>> {
  return runSingle<ProviderJobSummary>(
    supabase
      .from('bookings')
      .select(PROVIDER_JOB_SELECT)
      .eq('id', bookingId)
      .single()
      .returns<ProviderJobSummary>(),
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
    users:users_public(id, full_name, avatar_url)
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
      .select(`*, sender:users_public!sender_id(id, full_name, avatar_url)`)
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

// ── Provider Day Schedule ──────────────────────────────────────────────

/**
 * Everything needed to draw one provider day: the jobs on it, the time off
 * blocking it, and the working hours it should be measured against.
 *
 * Assembled here rather than in the screen because the three pieces are not
 * independent — the day's boundaries are local to the provider's timezone, and
 * the timezone is a column on the profile. Fetching bookings first would mean
 * guessing at the day boundaries before knowing which zone they are in.
 */
export interface ProviderDaySchedule {
  /** Local-day bounds actually queried, as UTC instants. */
  range: { start: string; end: string }
  timeZone: string
  workingHours: WorkingHours
  maxJobsPerDay: number | null
  defaultBufferBeforeMins: number
  defaultBufferAfterMins: number
  bookings: ProviderJobSummary[]
  timeOff: ProviderTimeOff[]
}

// Statuses that occupy a provider's calendar. Cancelled and no-show rows are
// excluded because they release the slot; completed rows are kept, since a
// finished job is still a thing that happened on that day and the provider
// looking at today should see it.
const SCHEDULE_BOOKING_STATUSES = [
  'pending',
  'pending_provider_approval',
  'confirmed',
  'en_route',
  'in_progress',
  'completed',
] as const

/**
 * Bookings are fetched over a window one day wider on each side than the day
 * being drawn, because occupancy is not the same thing as the start time: a job
 * starting at 23:00 yesterday with a two-hour duration still consumes this
 * morning, and one at 00:15 tomorrow with a 30-minute approach buffer already
 * consumes tonight. DayTimeline.placeJobs clamps what crosses the boundary and
 * drops what does not reach it, so over-fetching by a day is what makes the
 * clamping correct rather than merely possible.
 */
const SCHEDULE_WINDOW_PAD_MS = 24 * 60 * 60 * 1000

export async function getProviderDaySchedule(
  providerId: string,
  date: Date,
): Promise<QueryResult<ProviderDaySchedule>> {
  const profileResult = await runSingle<
    Pick<
      ProviderProfile,
      | 'timezone'
      | 'working_hours'
      | 'max_jobs_per_day'
      | 'default_buffer_before_mins'
      | 'default_buffer_after_mins'
    >
  >(
    supabase
      .from('provider_profiles')
      .select(
        'timezone, working_hours, max_jobs_per_day, default_buffer_before_mins, default_buffer_after_mins',
      )
      .eq('id', providerId)
      .single(),
  )
  if (profileResult.error) return { data: null, error: profileResult.error }

  const profile = profileResult.data
  // A profile row predating 20260819000000's NOT NULL default, or one read
  // through a stale client, still has to render a day rather than throw.
  const timeZone = profile.timezone || DEFAULT_TIMEZONE
  const workingHours = workingHoursFromJson(profile.working_hours)
  const { start, end } = localDayRange(date, timeZone)

  const padStart = new Date(start.getTime() - SCHEDULE_WINDOW_PAD_MS)
  const padEnd = new Date(end.getTime() + SCHEDULE_WINDOW_PAD_MS)

  const [bookingsResult, timeOffResult] = await Promise.all([
    // PROVIDER_JOB_SELECT, not BOOKING_SUMMARY_SELECT: a provider looking at
    // their own day needs the customer's name on the band, and only the
    // provider-facing select joins it.
    runList<ProviderJobSummary>(
      supabase
        .from('bookings')
        .select(PROVIDER_JOB_SELECT)
        .eq('provider_id', providerId)
        .in('status', [...SCHEDULE_BOOKING_STATUSES])
        .gte('scheduled_at', padStart.toISOString())
        .lt('scheduled_at', padEnd.toISOString())
        .order('scheduled_at', { ascending: true })
        .returns<ProviderJobSummary[]>(),
    ),
    // Time off is filtered on overlap, not on start: a week-long block started
    // last Monday must still blank out today.
    runList<ProviderTimeOff>(
      supabase
        .from('provider_time_off')
        .select('*')
        .eq('provider_id', providerId)
        .lt('starts_at', end.toISOString())
        .gt('ends_at', start.toISOString())
        .order('starts_at', { ascending: true }),
    ),
  ])

  if (bookingsResult.error) return { data: null, error: bookingsResult.error }
  if (timeOffResult.error) return { data: null, error: timeOffResult.error }

  return {
    data: {
      range: { start: start.toISOString(), end: end.toISOString() },
      timeZone,
      workingHours,
      maxJobsPerDay: profile.max_jobs_per_day,
      defaultBufferBeforeMins: profile.default_buffer_before_mins,
      defaultBufferAfterMins: profile.default_buffer_after_mins,
      bookings: bookingsResult.data,
      timeOff: timeOffResult.data,
    },
    error: null,
  }
}

/**
 * Time off overlapping an arbitrary range — the More → Manage list, which shows
 * upcoming blocks rather than one day's.
 */
export function getProviderTimeOff(
  providerId: string,
  fromInclusive: Date,
  toExclusive: Date,
): Promise<QueryResult<ProviderTimeOff[]>> {
  return runList<ProviderTimeOff>(
    supabase
      .from('provider_time_off')
      .select('*')
      .eq('provider_id', providerId)
      .lt('starts_at', toExclusive.toISOString())
      .gt('ends_at', fromInclusive.toISOString())
      .order('starts_at', { ascending: true }),
  )
}
