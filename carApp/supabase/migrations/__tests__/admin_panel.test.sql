-- RLS / helper verification for migration 20260624120000_admin_panel.
--
-- Pure-SQL behavioral test for the admin panel (Blocker #9). Everything runs in
-- a transaction that ROLLBACKs, so it never mutates real data. It seeds three
-- users — an admin, a non-admin, and a provider-owner — plus one PENDING
-- provider owned by the third user, then checks:
--   * is_admin() returns the right answer for admin vs non-admin.
--   * An admin can read the foreign pending provider + its vetting row (the
--     "admin read all" policies).
--   * A non-admin (not owner, row not approved) can read NEITHER — proving the
--     admin policies are what grant the access, not a leak in the base policies.
--
-- RLS is exercised by SET LOCAL ROLE authenticated + a faked request.jwt.claims
-- (how Supabase passes auth.uid()). Counts are stashed in transaction-local GUCs
-- while in the authenticated role, then read back after RESET ROLE (the
-- authenticated role has no rights on the temp results table).
--
-- Run against the linked project (read-write path, no psql required):
--   supabase db query --linked -f supabase/migrations/__tests__/admin_panel.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed (as owner — RLS bypassed for setup) ────────────────────────────
INSERT INTO public.users (id, email, is_admin) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin-test@example.com',    TRUE),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'nonadmin-test@example.com', FALSE),
  ('cccccccc-0000-0000-0000-000000000003', 'owner-test@example.com',    FALSE);

INSERT INTO public.provider_profiles (id, user_id, verification_status)
  VALUES ('dddddddd-0000-0000-0000-000000000004',
          'cccccccc-0000-0000-0000-000000000003', 'pending');
-- provider_vetting row is auto-created by trg_create_provider_vetting.

-- ── 1. is_admin() helper (SECURITY DEFINER — role-independent) ───────────
INSERT INTO _results SELECT 'is_admin(admin)=true',
  public.is_admin('aaaaaaaa-0000-0000-0000-000000000001') IS TRUE,  'expect true';
INSERT INTO _results SELECT 'is_admin(nonadmin)=false',
  public.is_admin('bbbbbbbb-0000-0000-0000-000000000002') IS FALSE, 'expect false';
INSERT INTO _results SELECT 'is_admin(unknown)=false',
  public.is_admin('ffffffff-0000-0000-0000-00000000ffff') IS FALSE, 'expect false (no row)';

-- ── 2. RLS as the ADMIN: can read the foreign pending provider + vetting ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','aaaaaaaa-0000-0000-0000-000000000001','role','authenticated')::text, TRUE);
SELECT set_config('test.admin_pp',
  (SELECT count(*) FROM public.provider_profiles WHERE id='dddddddd-0000-0000-0000-000000000004')::text, TRUE);
SELECT set_config('test.admin_pv',
  (SELECT count(*) FROM public.provider_vetting WHERE provider_id='dddddddd-0000-0000-0000-000000000004')::text, TRUE);

-- ── 3. RLS as the NON-ADMIN: can read NEITHER (not owner, not approved) ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub','bbbbbbbb-0000-0000-0000-000000000002','role','authenticated')::text, TRUE);
SELECT set_config('test.nonadmin_pp',
  (SELECT count(*) FROM public.provider_profiles WHERE id='dddddddd-0000-0000-0000-000000000004')::text, TRUE);
SELECT set_config('test.nonadmin_pv',
  (SELECT count(*) FROM public.provider_vetting WHERE provider_id='dddddddd-0000-0000-0000-000000000004')::text, TRUE);
RESET ROLE;

INSERT INTO _results SELECT 'admin reads foreign pending provider',
  current_setting('test.admin_pp')::int = 1, 'expect 1';
INSERT INTO _results SELECT 'admin reads foreign vetting',
  current_setting('test.admin_pv')::int = 1, 'expect 1';
INSERT INTO _results SELECT 'non-admin cannot read foreign pending provider',
  current_setting('test.nonadmin_pp')::int = 0, 'expect 0';
INSERT INTO _results SELECT 'non-admin cannot read foreign vetting',
  current_setting('test.nonadmin_pv')::int = 0, 'expect 0';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
