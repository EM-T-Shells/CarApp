-- Blocker #9: admin panel — provider vetting (approve/reject) MVP slice.
--
-- Before: there was no admin identity in the schema (users.role is only
-- customer/provider/both) and no way for ops to read every provider's vetting
-- record. Every provider was stuck at verification_status = 'pending' forever
-- because nothing could approve them.
--
-- Now:
--   * users.is_admin marks the (few) ops accounts. Seeded per-account by data
--     migration / SQL — see Blueprint/external_setup.md.
--   * is_admin(uid) is a SECURITY DEFINER helper so RLS policies can check
--     admin-ness without recursively evaluating users' own RLS.
--   * Admins get read-all RLS on provider_profiles, provider_vetting and users
--     so the web vetting queue can list every pending provider. WRITES are NOT
--     granted via RLS — the approve/reject decision goes through the
--     admin-review-provider Edge Function (service role), which re-verifies the
--     caller is an admin. That keeps the privileged decision server-side and is
--     the seed for the later refund/dispute tools.
--   * verification_status gains 'rejected' (was pending/approved/suspended) so a
--     rejected provider is distinguishable from a suspended one.
--
-- Idempotent — safe to re-run. Apply with: supabase db push  (or SQL editor).

-- ── Admin identity ──────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- SECURITY DEFINER so it reads users as the table owner, bypassing users' RLS.
-- This avoids the recursion you'd get from an RLS policy on users that queried
-- users. STABLE: result is constant within a statement.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM public.users u WHERE u.id = uid), FALSE);
$$;

-- ── verification_status: add 'rejected' ─────────────────────────────────
ALTER TABLE public.provider_profiles
  DROP CONSTRAINT IF EXISTS provider_profiles_verification_status_check;
ALTER TABLE public.provider_profiles
  ADD CONSTRAINT provider_profiles_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'suspended', 'rejected'));

-- ── Admin read-all RLS (additive; combines with existing policies via OR) ─
DROP POLICY IF EXISTS "provider_profiles: admin read all" ON public.provider_profiles;
CREATE POLICY "provider_profiles: admin read all" ON public.provider_profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "provider_vetting: admin read all" ON public.provider_vetting;
CREATE POLICY "provider_vetting: admin read all" ON public.provider_vetting
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "users: admin read all" ON public.users;
CREATE POLICY "users: admin read all" ON public.users
  FOR SELECT USING (public.is_admin(auth.uid()));
