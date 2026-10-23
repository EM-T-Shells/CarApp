-- Privilege verification for migration 20260818120000_provider_profiles_column_guard.
--
-- The exploit under test was confirmed live before the fix: a provider holding
-- nothing but the anon key that ships in the mobile binary could write
--   update provider_profiles set platform_fee_rate = 0 where user_id = auth.uid()
-- and the platform's cut would silently go to zero. verification_status sat in
-- the same policy, so a pending provider could also self-approve past all six
-- vetting steps.
--
-- Checks both directions, because an allowlist that is too tight is its own
-- outage: every column the app actually writes must still be writable, and the
-- service role must keep the access admin-review-provider and the Connect
-- onboarding function depend on.
--
-- Everything runs in a transaction that ROLLBACKs. Each write that is expected
-- to fail runs inside a DO block so the denial lands on an internal savepoint
-- instead of aborting the transaction; the outcome is stashed in a
-- transaction-local GUC and read back after RESET ROLE.
--
-- Run against the linked project:
--   supabase db query --linked -f supabase/migrations/__tests__/provider_profiles_column_guard.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed (as owner — RLS bypassed for setup) ────────────────────────────
INSERT INTO public.users (id, email) VALUES
  ('eeee0000-0000-4000-8000-000000000001', 'guard-provider-owner@example.com'),
  ('eeee0000-0000-4000-8000-000000000002', 'guard-other-user@example.com');

INSERT INTO public.provider_profiles (id, user_id, verification_status)
  VALUES ('ffff0000-0000-4000-8000-000000000001',
          'eeee0000-0000-4000-8000-000000000001', 'pending');

-- The Founding Provider trigger (20260622140000) rewrites platform_fee_rate to
-- 0% for the first 100 approved providers, so it has to be set AFTER insert or
-- every fee assertion below passes trivially against zero. Same trap the
-- pricing fixture hit.
UPDATE public.provider_profiles
   SET platform_fee_rate = 0.030
 WHERE id = 'ffff0000-0000-4000-8000-000000000001';

-- ── As the OWNING provider ──────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','eeee0000-0000-4000-8000-000000000001','role','authenticated')::text, TRUE);

-- The headline: the platform's cut, self-assigned.
DO $$
BEGIN
  UPDATE public.provider_profiles SET platform_fee_rate = 0
    WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.fee_rate', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.fee_rate', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.fee_rate', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Self-approval past all six vetting steps.
DO $$
BEGIN
  UPDATE public.provider_profiles SET verification_status = 'approved'
    WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.self_approve', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.self_approve', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.self_approve', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles
     SET is_founding_provider = TRUE,
         founding_provider_expires_at = now() + interval '90 days'
   WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.founding', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.founding', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.founding', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Payout routing.
DO $$
BEGIN
  UPDATE public.provider_profiles SET stripe_account_id = 'acct_attacker'
    WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.stripe_acct', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.stripe_acct', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.stripe_acct', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Search ranking.
DO $$
BEGIN
  UPDATE public.provider_profiles SET avg_gear_rating = 5.00, total_jobs = 9999
    WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.reputation', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.reputation', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.reputation', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Orphaning a provider's own job history.
DO $$
BEGIN
  DELETE FROM public.provider_profiles
   WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.self_delete', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.self_delete', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.self_delete', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── The edits the app performs must still work ──────────────────────────
-- app/(provider)/profile.tsx and (provider-tabs)/more/manage.tsx.
DO $$
BEGIN
  UPDATE public.provider_profiles
     SET bio = 'Fifteen years detailing in NoVA.',
         coverage_area = 'McLean, VA',
         mile_radius = 25,
         base_lat = 38.934,
         base_lng = -77.177,
         availability = '{"mon": true, "tue": true}'::JSONB
   WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.profile_edit', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.profile_edit', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The buffers from 20260818000000. Their UI is unbuilt, so this is the only
-- thing standing between the grant list and a provider who cannot set them.
DO $$
BEGIN
  UPDATE public.provider_profiles
     SET default_buffer_before_mins = 10, default_buffer_after_mins = 45
   WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.buffer_edit', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.buffer_edit', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Opt-in: (tabs)/more/provider.tsx, (provider)/vetting.tsx, signUpSubmit.ts.
DO $$
BEGIN
  INSERT INTO public.provider_profiles (user_id)
  VALUES ('eeee0000-0000-4000-8000-000000000001');
  PERFORM set_config('test.opt_in', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.opt_in', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- A new profile must not arrive pre-approved or fee-free either.
DO $$
BEGIN
  INSERT INTO public.provider_profiles (user_id, verification_status, platform_fee_rate)
  VALUES ('eeee0000-0000-4000-8000-000000000001', 'approved', 0);
  PERFORM set_config('test.insert_approved', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.insert_approved', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.insert_approved', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The row predicate was never the problem, but assert it still holds: the
-- policy must keep this scoped to the caller's own row.
DO $$
BEGIN
  INSERT INTO public.provider_profiles (user_id)
  VALUES ('eeee0000-0000-4000-8000-000000000002');
  PERFORM set_config('test.other_user', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.other_user', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.other_user', 'ERR:' || SQLSTATE, TRUE);
END $$;

SELECT set_config('test.fee_after',
  (SELECT platform_fee_rate FROM public.provider_profiles
    WHERE id = 'ffff0000-0000-4000-8000-000000000001')::text, TRUE);
SELECT set_config('test.status_after',
  (SELECT verification_status FROM public.provider_profiles
    WHERE id = 'ffff0000-0000-4000-8000-000000000001'), TRUE);
SELECT set_config('test.bio_after',
  (SELECT bio FROM public.provider_profiles
    WHERE id = 'ffff0000-0000-4000-8000-000000000001'), TRUE);

RESET ROLE;

-- ── service_role keeps everything ───────────────────────────────────────
-- admin-review-provider approves, the Connect function writes
-- stripe_account_id, and the founding sweep rewrites the fee rate. All three
-- run with the service role and must be unaffected.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  UPDATE public.provider_profiles
     SET verification_status = 'approved',
         approved_at = now(),
         platform_fee_rate = 0.030,
         stripe_account_id = 'acct_legit'
   WHERE id = 'ffff0000-0000-4000-8000-000000000001';
  PERFORM set_config('test.service_role', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.service_role', 'ERR:' || SQLSTATE, TRUE);
END $$;
RESET ROLE;

-- ── Assertions ──────────────────────────────────────────────────────────
INSERT INTO _results SELECT 'provider cannot zero their own platform_fee_rate',
  current_setting('test.fee_rate', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider cannot self-approve past vetting',
  current_setting('test.self_approve', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider cannot self-assign founding status',
  current_setting('test.founding', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider cannot repoint their Stripe account',
  current_setting('test.stripe_acct', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider cannot inflate their own reputation',
  current_setting('test.reputation', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider cannot delete their own profile row',
  current_setting('test.self_delete', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'provider can still edit bio/coverage/radius/availability',
  current_setting('test.profile_edit', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'provider can still set their scheduling buffers',
  current_setting('test.buffer_edit', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'provider opt-in insert still works',
  current_setting('test.opt_in', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'a profile cannot be inserted pre-approved',
  current_setting('test.insert_approved', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a profile cannot be inserted for another user',
  current_setting('test.other_user', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'blocked writes left platform_fee_rate at 3%',
  current_setting('test.fee_after', TRUE)::numeric = 0.030, 'expect 0.030';
INSERT INTO _results SELECT 'blocked writes left verification_status at pending',
  current_setting('test.status_after', TRUE) = 'pending', 'expect pending';
INSERT INTO _results SELECT 'the allowed edit actually landed',
  current_setting('test.bio_after', TRUE) LIKE 'Fifteen years%', 'expect the new bio';
INSERT INTO _results SELECT 'service_role keeps full access',
  current_setting('test.service_role', TRUE) = 'ALLOWED', 'expect ALLOWED';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
