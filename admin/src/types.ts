// Single source of truth: reuse the mobile app's generated Supabase types.
// Type-only import — erased at build, so there is no runtime coupling to the
// React Native app. Regenerate carApp/src/types/supabase.ts after migrations
// and these stay in sync automatically.
import type { Database } from '@carapp-types';

export type ProviderProfileRow = Database['public']['Tables']['provider_profiles']['Row'];
export type ProviderVettingRow = Database['public']['Tables']['provider_vetting']['Row'];
export type UserRow = Database['public']['Tables']['users']['Row'];

// verification_status gained 'rejected' in migration 20260624120000_admin_panel;
// until carApp types are regenerated against that migration, widen locally.
export type VerificationStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export interface QueueRow {
  id: string;
  user_id: string;
  bio: string | null;
  created_at: string | null;
  verification_status: VerificationStatus;
  users: { full_name: string | null; email: string | null } | null;
}

export interface ProviderDetail extends QueueRow {
  mile_radius: number | null;
  users: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    created_at: string | null;
  } | null;
  provider_vetting: ProviderVettingRow[] | null;
}
