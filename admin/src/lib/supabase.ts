import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loud in dev — a misconfigured env is the #1 setup mistake.
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy admin/.env.example to admin/.env.local.',
  );
}

// Anon key only. RLS gates reads to admins (is_admin); privileged writes go
// through the admin-review-provider Edge Function. detectSessionInUrl handles
// the magic-link return.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
