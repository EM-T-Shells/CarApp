// ─── AUTH ────────────────────────────────────────────────────────────────────

import { supabase } from "./client";

export const getCurrentUser = () =>
  supabase.auth.getUser();

// ─── USER PROFILE ────────────────────────────────────────────────────────────

export const getUserProfile = (userId: string) =>
  supabase
    .from('users')
    .select(`
      *,
      user_information(*),
      user_car_information(*)
    `)
    .eq('id', userId)
    .single();

// ─── PROVIDERS ───────────────────────────────────────────────────────────────

export const searchProviders = (filters: {
  providerTypeName?: 'DETAILER' | 'MECHANIC';
  minRating?: number;
  sortBy?: 'rating' | 'created_at';
}) =>
  supabase
    .from('providers')
    .select(`
      id, bio, rating, mile_radius,
      users(first_name, last_name, profile_pic),
      provider_types(name, label),
      provider_services(id, name, category, price, duration_mins)
    `)
    .eq('is_approved', true)
    .gte('rating', filters.minRating ?? 0)
    .order(filters.sortBy ?? 'rating', { ascending: false });

export const getProviderById = (providerId: string) =>
  supabase
    .from('providers')
    .select(`
      *,
      users(first_name, last_name, profile_pic),
      provider_types(name, label),
      provider_services(*),
      reviews(*, users(first_name, last_name, profile_pic))
    `)
    .eq('id', providerId)
    .single();

// ─── SERVICE CATALOG ─────────────────────────────────────────────────────────

export const getServiceCatalog = (providerTypeName?: 'DETAILER' | 'MECHANIC') =>
  supabase
    .from('service_catalog')
    .select(`*, provider_types(name, label)`)
    .eq('is_active', true)
    .order('category');
    // filter by provider type in-app using provider_types.name if needed

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────

export const getUpcomingAppointments = (userId: string) =>
  supabase
    .from('appointments')
    .select(`
      *,
      providers(
        id, bio, rating,
        users(first_name, last_name, profile_pic)
      ),
      user_car_information(make, model, year)
    `)
    .eq('user_id', userId)
    .in('status', ['pending', 'confirmed'])
    .order('scheduled_at', { ascending: true });

export const getPastAppointments = (userId: string) =>
  supabase
    .from('appointments')
    .select(`
      *,
      providers(
        id,
        users(first_name, last_name, profile_pic)
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('scheduled_at', { ascending: false });

export const getAppointmentById = (appointmentId: string) =>
  supabase
    .from('appointments')
    .select(`
      *,
      providers(*, users(first_name, last_name, profile_pic)),
      user_car_information(*)
    `)
    .eq('id', appointmentId)
    .single();

// ─── INBOX ───────────────────────────────────────────────────────────────────

export const getThreads = (userId: string) =>
  supabase
    .from('message_threads')
    .select(`
      *,
      appointments(scheduled_at, status, services),
      messages(body, created_at, order: created_at.desc, limit: 1)
    `)
    .or(`customer_id.eq.${userId},provider_id.eq.${userId}`)
    .order('created_at', { ascending: false });

export const getMessages = (threadId: string) =>
  supabase
    .from('messages')
    .select(`*, sender:users(first_name, last_name, profile_pic)`)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

// ─── REVIEWS ─────────────────────────────────────────────────────────────────

export const getReviewsByProvider = (providerId: string) =>
  supabase
    .from('reviews')
    .select(`*, users(first_name, last_name, profile_pic)`)
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

export const getNotifications = (userId: string) =>
  supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

// ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────

export const getSubscriptions = (userId: string) =>
  supabase
    .from('subscriptions')
    .select(`
      *,
      providers(id, users(first_name, last_name, profile_pic))
    `)
    .eq('user_id', userId)
    .eq('status', 'active');
