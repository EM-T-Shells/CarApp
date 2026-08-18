-- Behavioral test for migration 20260819000000_provider_working_hours_and_time_off.
--
-- Three things to prove, and one to prove did NOT happen:
--
--   * The timezone and working_hours validation trigger rejects every malformed
--     shape, so readers can trust the stored value without re-checking it.
--   * provider_time_off enforces its own integrity (ordered range, no
--     overlapping blocks) and is scoped to the owning provider by both RLS and
--     column privileges.
--   * The new provider_profiles columns are writable by the owner...
--   * ...without reopening what 20260818120000 closed. GRANT is additive, so
--     the risk is real: a careless re-grant would hand back platform_fee_rate.
--
-- Everything runs in a transaction that ROLLBACKs. Writes expected to fail run
-- inside DO blocks so the error lands on an internal savepoint rather than
-- aborting the transaction; outcomes are stashed in transaction-local GUCs.
--
-- Run against the linked project:
--   supabase db query --linked -f supabase/migrations/__tests__/provider_working_hours_and_time_off.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed ─────────────────────────────────────────────────────────────────
INSERT INTO public.users (id, email) VALUES
  ('a1a10000-0000-4000-8000-000000000001', 'sched-provider@example.com'),
  ('a1a10000-0000-4000-8000-000000000002', 'sched-other@example.com');

INSERT INTO public.provider_profiles (id, user_id, verification_status)
VALUES
  ('b1b10000-0000-4000-8000-000000000001',
   'a1a10000-0000-4000-8000-000000000001', 'pending'),
  ('b1b10000-0000-4000-8000-000000000002',
   'a1a10000-0000-4000-8000-000000000002', 'pending');

-- Set the fee AFTER insert: the Founding Provider trigger (20260622140000)
-- rewrites it to 0% on approval, so a seeded value would not survive.
UPDATE public.provider_profiles
   SET platform_fee_rate = 0.030
 WHERE id = 'b1b10000-0000-4000-8000-000000000001';

-- ── 1. Defaults ──────────────────────────────────────────────────────────
INSERT INTO _results
SELECT 'a new profile gets the launch-market timezone',
       timezone = 'America/New_York', format('got %s', timezone)
  FROM public.provider_profiles WHERE id = 'b1b10000-0000-4000-8000-000000000001';

INSERT INTO _results
SELECT 'max_jobs_per_day defaults to no limit',
       max_jobs_per_day IS NULL, 'expect NULL'
  FROM public.provider_profiles WHERE id = 'b1b10000-0000-4000-8000-000000000001';

-- ── 2. The backfill expression ───────────────────────────────────────────
-- The migration's backfill already ran, so re-run the same statement against a
-- fresh row to check the mapping itself. The point is the NULL case: a provider
-- who never touched the picker must come out weekdays-open, matching
-- availabilityFromJson()'s DEFAULT_AVAILABILITY — not closed all week.
UPDATE public.provider_profiles
   SET availability = '{"mon": true, "sat": true, "tue": false}'::JSONB,
       working_hours = NULL
 WHERE id = 'b1b10000-0000-4000-8000-000000000001';

UPDATE public.provider_profiles p
   SET working_hours = (
     SELECT jsonb_object_agg(
              d.key,
              CASE
                WHEN COALESCE((p.availability ->> d.key)::BOOLEAN, d.default_open)
                THEN jsonb_build_array(jsonb_build_object('start', '08:00', 'end', '18:00'))
                ELSE '[]'::JSONB
              END)
       FROM (VALUES ('mon', TRUE), ('tue', TRUE), ('wed', TRUE), ('thu', TRUE),
                    ('fri', TRUE), ('sat', FALSE), ('sun', FALSE)) AS d(key, default_open)
   )
 WHERE p.working_hours IS NULL;

INSERT INTO _results
SELECT 'backfill: an explicit true day becomes an 08:00-18:00 window',
       working_hours -> 'mon' = '[{"start":"08:00","end":"18:00"}]'::JSONB,
       format('%s', working_hours -> 'mon')
  FROM public.provider_profiles WHERE id = 'b1b10000-0000-4000-8000-000000000001';

INSERT INTO _results
SELECT 'backfill: an explicit false day becomes closed',
       working_hours -> 'tue' = '[]'::JSONB, format('%s', working_hours -> 'tue')
  FROM public.provider_profiles WHERE id = 'b1b10000-0000-4000-8000-000000000001';

INSERT INTO _results
SELECT 'backfill: a day absent from availability falls back to the picker default',
       working_hours -> 'wed' = '[{"start":"08:00","end":"18:00"}]'::JSONB
       AND working_hours -> 'sun' = '[]'::JSONB,
       'wed defaults open, sun defaults closed';

-- ── 3. Validation ────────────────────────────────────────────────────────
DO $$
BEGIN
  UPDATE public.provider_profiles SET timezone = 'Mars/Olympus_Mons'
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.bad_tz', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.bad_tz', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles SET timezone = 'America/Chicago'
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.good_tz', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.good_tz', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles
     SET working_hours = '{"funday": [{"start":"08:00","end":"18:00"}]}'::JSONB
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.bad_day', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.bad_day', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles SET working_hours = '{"mon": true}'::JSONB
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.legacy_shape', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.legacy_shape', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles
     SET working_hours = '{"mon": [{"start":"8am","end":"6pm"}]}'::JSONB
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.bad_time', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.bad_time', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.provider_profiles
     SET working_hours = '{"mon": [{"start":"18:00","end":"08:00"}]}'::JSONB
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.inverted', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.inverted', SQLSTATE, TRUE);
END $$;

-- A split day is the reason windows are an array rather than one pair.
DO $$
BEGIN
  UPDATE public.provider_profiles
     SET working_hours = '{"mon": [{"start":"08:00","end":"12:00"},
                                   {"start":"13:00","end":"18:00"}],
                           "sun": []}'::JSONB
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.split_day', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.split_day', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 4. provider_time_off, as the OWNING provider ─────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a1a10000-0000-4000-8000-000000000001','role','authenticated')::text, TRUE);

DO $$
BEGIN
  INSERT INTO public.provider_time_off (id, provider_id, starts_at, ends_at, reason)
  VALUES ('c1c10000-0000-4000-8000-000000000001',
          'b1b10000-0000-4000-8000-000000000001',
          TIMESTAMPTZ '2026-09-20 00:00:00+00',
          TIMESTAMPTZ '2026-09-25 00:00:00+00',
          'Vacation');
  PERFORM set_config('test.book_off', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.book_off', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.provider_time_off (provider_id, starts_at, ends_at)
  VALUES ('b1b10000-0000-4000-8000-000000000001',
          TIMESTAMPTZ '2026-09-22 00:00:00+00',
          TIMESTAMPTZ '2026-09-23 00:00:00+00');
  PERFORM set_config('test.overlap_off', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.overlap_off', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.overlap_off', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.provider_time_off (provider_id, starts_at, ends_at)
  VALUES ('b1b10000-0000-4000-8000-000000000001',
          TIMESTAMPTZ '2026-10-05 00:00:00+00',
          TIMESTAMPTZ '2026-10-01 00:00:00+00');
  PERFORM set_config('test.inverted_off', 'ALLOWED', TRUE);
EXCEPTION
  WHEN check_violation THEN PERFORM set_config('test.inverted_off', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.inverted_off', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Another provider's calendar. RLS should refuse before privileges matter.
DO $$
BEGIN
  INSERT INTO public.provider_time_off (provider_id, starts_at, ends_at)
  VALUES ('b1b10000-0000-4000-8000-000000000002',
          TIMESTAMPTZ '2026-11-01 00:00:00+00',
          TIMESTAMPTZ '2026-11-02 00:00:00+00');
  PERFORM set_config('test.other_cal', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.other_cal', 'BLOCKED', TRUE);
END $$;

-- created_at is outside the INSERT allowlist: the server stamps it.
DO $$
BEGIN
  INSERT INTO public.provider_time_off (provider_id, starts_at, ends_at, created_at)
  VALUES ('b1b10000-0000-4000-8000-000000000001',
          TIMESTAMPTZ '2026-12-01 00:00:00+00',
          TIMESTAMPTZ '2026-12-02 00:00:00+00',
          TIMESTAMPTZ '2020-01-01 00:00:00+00');
  PERFORM set_config('test.forged_created', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.forged_created', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.forged_created', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Re-pointing a block at another provider must fail at the privilege layer, not
-- only at the policy, so it stays blocked if the policy is ever rewritten.
DO $$
BEGIN
  UPDATE public.provider_time_off
     SET provider_id = 'b1b10000-0000-4000-8000-000000000002'
   WHERE id = 'c1c10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.repoint', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.repoint', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.repoint', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Cancelling time off is a normal provider action.
DO $$
BEGIN
  DELETE FROM public.provider_time_off
   WHERE id = 'c1c10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.cancel_off', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.cancel_off', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 5. The new profile columns are writable — and only those ─────────────
DO $$
BEGIN
  UPDATE public.provider_profiles
     SET timezone = 'America/Denver',
         working_hours = '{"fri": [{"start":"09:00","end":"17:00"}]}'::JSONB,
         max_jobs_per_day = 3
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.own_schedule', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.own_schedule', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The regression this migration could plausibly cause: GRANT is additive, so a
-- careless re-grant would hand back what 20260818120000 revoked.
DO $$
BEGIN
  UPDATE public.provider_profiles SET platform_fee_rate = 0
   WHERE id = 'b1b10000-0000-4000-8000-000000000001';
  PERFORM set_config('test.fee_still_blocked', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.fee_still_blocked', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.fee_still_blocked', 'ERR:' || SQLSTATE, TRUE);
END $$;

RESET ROLE;

-- ── Assertions ───────────────────────────────────────────────────────────
INSERT INTO _results SELECT 'an unknown timezone is refused',
  current_setting('test.bad_tz', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a real IANA timezone is accepted',
  current_setting('test.good_tz', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'an unknown day key is refused',
  current_setting('test.bad_day', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'the legacy boolean shape is refused in working_hours',
  current_setting('test.legacy_shape', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a non HH:MM time is refused',
  current_setting('test.bad_time', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a window ending before it starts is refused',
  current_setting('test.inverted', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a split day with two windows is accepted',
  current_setting('test.split_day', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'a provider can block time off',
  current_setting('test.book_off', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'overlapping time off is refused',
  current_setting('test.overlap_off', TRUE) = 'BLOCKED', 'expect BLOCKED (23P01)';
INSERT INTO _results SELECT 'time off ending before it starts is refused',
  current_setting('test.inverted_off', TRUE) = 'BLOCKED', 'expect BLOCKED (23514)';
INSERT INTO _results SELECT 'a provider cannot block another provider''s calendar',
  current_setting('test.other_cal', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'created_at cannot be forged',
  current_setting('test.forged_created', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'time off cannot be re-pointed at another provider',
  current_setting('test.repoint', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a provider can cancel their own time off',
  current_setting('test.cancel_off', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'a provider can set timezone, hours and daily cap',
  current_setting('test.own_schedule', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'the new grants did not reopen platform_fee_rate',
  current_setting('test.fee_still_blocked', TRUE) = 'BLOCKED', 'expect BLOCKED';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
