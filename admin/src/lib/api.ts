import { supabase } from './supabase';
import type { ProviderDetail, QueueRow } from '../types';

export interface Result<T> {
  data: T | null;
  error: string | null;
}

/** Is the signed-in user an admin? Reads their own row (users: read own RLS). */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { is_admin: boolean | null }).is_admin === true;
}

/** Providers awaiting an admin decision (oldest first). Admin RLS returns all. */
export async function fetchPendingProviders(): Promise<Result<QueueRow[]>> {
  const { data, error } = await supabase
    .from('provider_profiles')
    .select('id, user_id, bio, created_at, verification_status, users(full_name, email)')
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as unknown as QueueRow[], error: null };
}

/** One provider with owner + vetting records, for the detail screen. */
export async function fetchProvider(id: string): Promise<Result<ProviderDetail>> {
  const { data, error } = await supabase
    .from('provider_profiles')
    .select(
      'id, user_id, bio, mile_radius, created_at, verification_status, users(full_name, email, phone, created_at), provider_vetting(*)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: 'Provider not found' };
  return { data: data as unknown as ProviderDetail, error: null };
}

export interface ReviewResponse {
  ok: boolean;
  action: 'approve' | 'reject';
  verification_status: 'approved' | 'rejected';
  email: { ok: boolean; id?: string; error?: string };
}

/**
 * Approve or reject a provider via the admin-review-provider Edge Function.
 * The function re-verifies the caller is an admin, applies the decision with
 * the service role, and sends the provider email. Never writes the status from
 * the client directly.
 */
export async function reviewProvider(
  providerId: string,
  action: 'approve' | 'reject',
  reason?: string,
): Promise<Result<ReviewResponse>> {
  const { data, error } = await supabase.functions.invoke<ReviewResponse>(
    'admin-review-provider',
    { body: { action, provider_id: providerId, reason } },
  );
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}
