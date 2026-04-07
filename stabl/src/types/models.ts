import { Json } from './supabase'

// ─── SERVICE SNAPSHOT (shape of JSONB in appointments & subscriptions) ───────
export type ServiceSnapshot = {
  provider_service_id: string
  name: string
  price: number
  duration_mins: number
  category: string
}

// ─── USER ────────────────────────────────────────────────────────────────────
export type User = {
  id: string
  first_name: string | null
  last_name: string | null
  profile_pic: string | null
  is_provider: boolean
  stripe_customer_id: string | null
  created_at: string
}

// ─── USER INFORMATION ────────────────────────────────────────────────────────
export type UserInformation = {
  id: string
  user_id: string
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  latitude: number | null
  longitude: number | null
}

// ─── USER CAR ────────────────────────────────────────────────────────────────
export type UserCar = {
  id: string
  user_id: string
  make: string
  model: string
  year: number
  vin: string | null
}

// ─── PROVIDER TYPE ───────────────────────────────────────────────────────────
export type ProviderType = {
  id: string
  name: 'DETAILER' | 'MECHANIC'
  label: string
  is_active: boolean
}

// ─── PROVIDER ────────────────────────────────────────────────────────────────
export type Provider = {
  id: string
  user_id: string
  provider_type_id: string | null
  rating: number
  mile_radius: number | null
  bio: string | null
  is_approved: boolean
  created_at: string
}

// ─── PROVIDER (with joined user + type — for display) ────────────────────────
export type ProviderWithDetails = Provider & {
  user: User
  provider_type: ProviderType | null
  services: ProviderService[]
}

// ─── SERVICE CATALOG ─────────────────────────────────────────────────────────
export type ServiceCatalogItem = {
  id: string
  provider_type_id: string | null
  name: string
  category: string
  is_active: boolean
}

// ─── PROVIDER SERVICE ────────────────────────────────────────────────────────
export type ProviderService = {
  id: string
  provider_id: string
  catalog_id: string | null
  name: string
  category: string | null
  description: string | null
  price: number | null
  duration_mins: number | null
  is_active: boolean
  is_custom: boolean
  is_approved: boolean
  sort_order: number
}

// ─── APPOINTMENT ─────────────────────────────────────────────────────────────
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type Appointment = {
  id: string
  provider_id: string
  user_id: string
  car_id: string | null
  services: ServiceSnapshot[]
  status: AppointmentStatus
  scheduled_at: string
  location_address: string | null
  location_lat: number | null
  location_lng: number | null
  deposit_amount: number | null
  total_estimate: number | null
  stripe_payment_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deposit_forfeited: boolean
}

// ─── REVIEW ──────────────────────────────────────────────────────────────────
export type Review = {
  id: string
  provider_id: string
  user_id: string
  appointment_id: string
  rating: number
  title: string | null
  description: string | null
  images: string[] | null
  kudos_points: number
  created_at: string
}

// ─── MESSAGE THREAD ──────────────────────────────────────────────────────────
export type MessageThread = {
  id: string
  appointment_id: string
  customer_id: string
  provider_id: string
  created_at: string
}

// ─── MESSAGE ─────────────────────────────────────────────────────────────────
export type Message = {
  id: string
  thread_id: string
  sender_id: string
  body: string | null
  image_url: string | null
  is_flagged: boolean
  created_at: string
}

// ─── NOTIFICATION ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'appointment_reminder'
  | 'review_request'
  | 'message_received'
  | 'promo'

export type Notification = {
  id: string
  user_id: string
  type: NotificationType
  title: string | null
  body: string | null
  is_read: boolean
  metadata: Json | null
  created_at: string
}

// ─── SUBSCRIPTION ────────────────────────────────────────────────────────────
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'
export type SubscriptionFrequency = 'weekly' | 'biweekly' | 'monthly'

export type Subscription = {
  id: string
  user_id: string
  provider_id: string
  status: SubscriptionStatus
  frequency: SubscriptionFrequency | null
  services: ServiceSnapshot[]
  stripe_subscription_id: string | null
  next_scheduled_at: string | null
  created_at: string
}