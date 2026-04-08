import { Tables, TablesInsert, TablesUpdate } from './supabase';

// ── Users ──────────────────────────────────────────────────────────────
export type User = Tables<'users'>;
export type UserInsert = TablesInsert<'users'>;
export type UserUpdate = TablesUpdate<'users'>;

// ── Vehicles ───────────────────────────────────────────────────────────
export type Vehicle = Tables<'vehicles'>;
export type VehicleInsert = TablesInsert<'vehicles'>;
export type VehicleUpdate = TablesUpdate<'vehicles'>;

// ── Provider Profiles ──────────────────────────────────────────────────
export type ProviderProfile = Tables<'provider_profiles'>;
export type ProviderProfileInsert = TablesInsert<'provider_profiles'>;
export type ProviderProfileUpdate = TablesUpdate<'provider_profiles'>;

// ── Provider Types ─────────────────────────────────────────────────────
export type ProviderType = Tables<'provider_types'>;
export type ProviderTypeInsert = TablesInsert<'provider_types'>;
export type ProviderTypeUpdate = TablesUpdate<'provider_types'>;

// ── Provider Vetting ───────────────────────────────────────────────────
export type ProviderVetting = Tables<'provider_vetting'>;
export type ProviderVettingInsert = TablesInsert<'provider_vetting'>;
export type ProviderVettingUpdate = TablesUpdate<'provider_vetting'>;

// ── Provider Location Cache ────────────────────────────────────────────
export type ProviderLocationCache = Tables<'provider_location_cache'>;
export type ProviderLocationCacheInsert = TablesInsert<'provider_location_cache'>;
export type ProviderLocationCacheUpdate = TablesUpdate<'provider_location_cache'>;

// ── Service Catalog ────────────────────────────────────────────────────
export type ServiceCatalog = Tables<'service_catalog'>;
export type ServiceCatalogInsert = TablesInsert<'service_catalog'>;
export type ServiceCatalogUpdate = TablesUpdate<'service_catalog'>;

// ── Service Packages ───────────────────────────────────────────────────
export type ServicePackage = Tables<'service_packages'>;
export type ServicePackageInsert = TablesInsert<'service_packages'>;
export type ServicePackageUpdate = TablesUpdate<'service_packages'>;

// ── Bookings ───────────────────────────────────────────────────────────
export type Booking = Tables<'bookings'>;
export type BookingInsert = TablesInsert<'bookings'>;
export type BookingUpdate = TablesUpdate<'bookings'>;

// ── Booking Photos ─────────────────────────────────────────────────────
export type BookingPhoto = Tables<'booking_photos'>;
export type BookingPhotoInsert = TablesInsert<'booking_photos'>;
export type BookingPhotoUpdate = TablesUpdate<'booking_photos'>;

// ── Payments ───────────────────────────────────────────────────────────
export type Payment = Tables<'payments'>;
export type PaymentInsert = TablesInsert<'payments'>;
export type PaymentUpdate = TablesUpdate<'payments'>;

// ── Payouts ────────────────────────────────────────────────────────────
export type Payout = Tables<'payouts'>;
export type PayoutInsert = TablesInsert<'payouts'>;
export type PayoutUpdate = TablesUpdate<'payouts'>;

// ── Ratings ────────────────────────────────────────────────────────────
export type Rating = Tables<'ratings'>;
export type RatingInsert = TablesInsert<'ratings'>;
export type RatingUpdate = TablesUpdate<'ratings'>;

// ── Kudos ──────────────────────────────────────────────────────────────
export type Kudos = Tables<'kudos'>;
export type KudosInsert = TablesInsert<'kudos'>;
export type KudosUpdate = TablesUpdate<'kudos'>;

// ── Message Threads ────────────────────────────────────────────────────
export type MessageThread = Tables<'message_threads'>;
export type MessageThreadInsert = TablesInsert<'message_threads'>;
export type MessageThreadUpdate = TablesUpdate<'message_threads'>;

// ── Messages ───────────────────────────────────────────────────────────
export type Message = Tables<'messages'>;
export type MessageInsert = TablesInsert<'messages'>;
export type MessageUpdate = TablesUpdate<'messages'>;

// ── Notifications ──────────────────────────────────────────────────────
export type Notification = Tables<'notifications'>;
export type NotificationInsert = TablesInsert<'notifications'>;
export type NotificationUpdate = TablesUpdate<'notifications'>;

// ── Promotions ─────────────────────────────────────────────────────────
export type Promotion = Tables<'promotions'>;
export type PromotionInsert = TablesInsert<'promotions'>;
export type PromotionUpdate = TablesUpdate<'promotions'>;

// ── Promo Redemptions ──────────────────────────────────────────────────
export type PromoRedemption = Tables<'promo_redemptions'>;
export type PromoRedemptionInsert = TablesInsert<'promo_redemptions'>;
export type PromoRedemptionUpdate = TablesUpdate<'promo_redemptions'>;

// ── Subscriptions ──────────────────────────────────────────────────────
export type Subscription = Tables<'subscriptions'>;
export type SubscriptionInsert = TablesInsert<'subscriptions'>;
export type SubscriptionUpdate = TablesUpdate<'subscriptions'>;
