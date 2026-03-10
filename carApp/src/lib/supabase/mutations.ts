import { ServiceSnapshot } from '../../types/models'
import { supabase } from "./client";
import { containsFlaggedContent } from '../../utils/validators'

// ─── USER ────────────────────────────────────────────────────────────────────

export const createUser = (payload: {
  id: string; // must match Supabase auth.users id
  first_name: string;
  last_name: string;
  profile_pic?: string;
}) =>
  supabase.from('users').insert(payload);

export const upsertUserInformation = (userId: string, info: {
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
}) =>
  supabase
    .from('user_information')
    .upsert({ user_id: userId, ...info });

export const addVehicle = (userId: string, vehicle: {
  make: string;
  model: string;
  year: number;
  vin?: string;
}) =>
  supabase.from('user_car_information').insert({ user_id: userId, ...vehicle });

// ─── PROVIDER ────────────────────────────────────────────────────────────────

export const createProviderProfile = (payload: {
  user_id: string;
  provider_type_id: string;
  bio?: string;
  mile_radius?: number;
}) =>
  supabase.from('providers').insert({ ...payload, is_approved: false });

export const upsertProviderService = (service: {
  provider_id: string;
  catalog_id?: string;
  name: string;
  category?: string;
  description?: string;
  price: number;
  duration_mins?: number;
  is_custom?: boolean;
}) =>
  supabase.from('provider_services').upsert(service);

export const respondToAppointment = (
  appointmentId: string,
  status: 'confirmed' | 'declined'
) =>
  supabase
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────

export const createAppointment = (payload: {
  provider_id: string;
  user_id: string;
  car_id: string;
  services: ServiceSnapshot[];   // JSONB array — define shape in types/models.ts
  scheduled_at: string;
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  deposit_amount: number;
  total_estimate: number;
  stripe_payment_id: string;
  notes?: string;
}) =>
  supabase.from('appointments').insert({
    ...payload,
    status: 'pending',
  });

export const cancelAppointment = (appointmentId: string, depositForfeited: boolean) =>
  supabase
    .from('appointments')
    .update({
      status: depositForfeited ? 'cancelled_forfeited' : 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

export const updateServiceSnapshots = (
  appointmentId: string,
  services: ServiceSnapshot[] // updated JSONB array
) =>
  supabase
    .from('appointments')
    .update({ services, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

export const createReview = (payload: {
  provider_id: string;
  user_id: string;
  appointment_id: string;
  rating: number;
  title?: string;
  description?: string;
  images?: string[];
  kudos_points?: number;
}) =>
  supabase.from('reviews').insert(payload);

// ─── MESSAGES ────────────────────────────────────────────────────────────────

export const sendMessage = (payload: {
  thread_id: string;
  sender_id: string;
  body: string;
  image_url?: string;
}) => {
  const flagged = containsFlaggedContent(payload.body); 
  return supabase.from('messages').insert({
    ...payload,
    is_flagged: flagged,
    body: flagged ? '[Message flagged for review]' : payload.body,
  });
};

export const createThread = (payload: {
  appointment_id: string;
  customer_id: string;
  provider_id: string;
}) =>
  supabase.from('message_threads').insert(payload);

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export const markNotificationRead = (notificationId: string) =>
  supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

// ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────

export const createSubscription = (payload: {
  user_id: string;
  provider_id: string;
  frequency: string;
  services: ServiceSnapshot[];
  stripe_subscription_id: string;
  next_scheduled_at: string;
}) =>
  supabase.from('subscriptions').insert({ ...payload, status: 'active' });

export const cancelSubscription = (subscriptionId: string) =>
  supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('id', subscriptionId);
