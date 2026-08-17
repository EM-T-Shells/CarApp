-- Privilege / trigger verification for migration
-- 20260817120000_bookings_update_column_guard.
--
-- Pure-SQL behavioral test for the booking UPDATE hole (§4 of the quote-first
-- booking spec). Everything runs in a transaction that ROLLBACKs, so it never
-- mutates real data. It seeds a customer, a provider-owner, an approved
-- provider profile, and two bookings, then checks both layers of the fix:
--
--   * Column privileges — a customer cannot write total_amount or
--     provider_payout, but can still reschedule.
--   * Status trigger — a customer cannot jump a confirmed booking to
--     'completed' or stamp started_at, but can abandon a pending one; the
--     provider can walk confirmed -> en_route -> in_progress.
--   * service_role bypasses both, since that is where every other transition
--     already lives.
--
-- Each write runs inside a DO block so a denial is caught (via an internal
-- savepoint) instead of aborting the whole transaction. The outcome is stashed
-- in a transaction-local GUC and read back after RESET ROLE.
--
-- Run against the linked project (read-write path, no psql required):
--   supabase db query --linked -f supabase/migrations/__tests__/bookings_update_column_guard.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed (as owner — RLS bypassed for setup) ────────────────────────────
INSERT INTO public.users (id, email) VALUES
  ('11111111-0000-0000-0000-000000000001', 'guard-customer@example.com'),
  ('22222222-0000-0000-0000-000000000002', 'guard-provider@example.com');

INSERT INTO public.provider_profiles (id, user_id, verification_status)
  VALUES ('33333333-0000-0000-0000-000000000003',
          '22222222-0000-0000-0000-000000000002', 'approved');

INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, total_amount, provider_payout)
VALUES
  ('44444444-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003',
   'pending',   now() + interval '2 days', 200.00, 170.00),
  ('55555555-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003',
   'confirmed', now() + interval '3 days', 200.00, 170.00);

-- ── 1. Column privileges, as the CUSTOMER ───────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','11111111-0000-0000-0000-000000000001','role','authenticated')::text, TRUE);

DO $$
BEGIN
  UPDATE public.bookings SET total_amount = 0.01
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.money', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.money', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.money', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET provider_payout = 9999
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.payout', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.payout', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.payout', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The allowlist must not over-reach: rescheduling still has to work.
DO $$
BEGIN
  UPDATE public.bookings SET scheduled_at = now() + interval '9 days'
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.reschedule', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.reschedule', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 2. Status trigger, as the CUSTOMER ──────────────────────────────────
-- The headline exploit: collect the service without the balance capture.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'completed'
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.self_complete', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.self_complete', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.self_complete', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET started_at = now()
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.cust_started', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.cust_started', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.cust_started', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Abandoning an unpaid request is the one transition the customer owns.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'cancelled'
    WHERE id = '44444444-0000-0000-0000-000000000004';
  PERFORM set_config('test.abandon', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.abandon', 'ERR:' || SQLSTATE, TRUE);
END $$;

RESET ROLE;

-- ── 3. Status trigger, as the PROVIDER ──────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','22222222-0000-0000-0000-000000000002','role','authenticated')::text, TRUE);

DO $$
BEGIN
  UPDATE public.bookings SET status = 'en_route'
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.enroute', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.enroute', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET status = 'in_progress', started_at = now()
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.in_progress', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.in_progress', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Completion charges the balance, so it belongs to the server even though the
-- provider legitimately owns the two transitions above.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'completed'
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.prov_complete', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.prov_complete', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.prov_complete', 'ERR:' || SQLSTATE, TRUE);
END $$;

SELECT set_config('test.status_after',
  (SELECT status FROM public.bookings WHERE id = '55555555-0000-0000-0000-000000000005'), TRUE);
SELECT set_config('test.total_after',
  (SELECT total_amount FROM public.bookings WHERE id = '55555555-0000-0000-0000-000000000005')::text, TRUE);

RESET ROLE;

-- ── 4. service_role bypasses both layers ────────────────────────────────
SET LOCAL ROLE service_role;
DO $$
BEGIN
  UPDATE public.bookings SET status = 'completed', total_amount = 250.00
    WHERE id = '55555555-0000-0000-0000-000000000005';
  PERFORM set_config('test.service_role', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.service_role', 'ERR:' || SQLSTATE, TRUE);
END $$;
RESET ROLE;

-- ── Assertions ──────────────────────────────────────────────────────────
INSERT INTO _results SELECT 'customer cannot write total_amount',
  current_setting('test.money', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'customer cannot write provider_payout',
  current_setting('test.payout', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'customer can still reschedule',
  current_setting('test.reschedule', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'customer cannot self-complete a booking',
  current_setting('test.self_complete', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'customer cannot stamp started_at',
  current_setting('test.cust_started', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'customer can abandon a pending request',
  current_setting('test.abandon', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'provider can go en_route',
  current_setting('test.enroute', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'provider can go in_progress with started_at',
  current_setting('test.in_progress', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'provider cannot self-complete a booking',
  current_setting('test.prov_complete', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'blocked writes left status at in_progress',
  current_setting('test.status_after', TRUE) = 'in_progress', 'expect in_progress';
INSERT INTO _results SELECT 'blocked writes left total_amount untouched',
  current_setting('test.total_after', TRUE)::numeric = 200.00, 'expect 200.00';
INSERT INTO _results SELECT 'service_role bypasses both layers',
  current_setting('test.service_role', TRUE) = 'ALLOWED', 'expect ALLOWED';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
