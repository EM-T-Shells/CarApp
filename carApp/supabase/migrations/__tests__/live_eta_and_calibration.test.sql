-- live_eta_and_calibration.test.sql
--
-- Verifies 20260823000000. Wraps in a transaction and ROLLBACKs.
--
-- The load-bearing assertions:
--   • a reported delay moves the ready-by time and NOT the committed slot
--   • starting the job clears the delay instead of counting it twice
--   • neither party can state a delay or an ETA notification by writing it
--   • the calibration report shows a provider their own numbers and nobody
--     else's, and shows an admin everyone's
--   • the timezone check still refuses what the catalog scan refused, fast
--
-- Run:
--   supabase db query --linked -f supabase/migrations/__tests__/live_eta_and_calibration.test.sql
-- Expect every row's pass = t.

BEGIN;

CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Fixtures ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES ('a5a50000-0000-4000-8000-000000000001', 'q5-customer@test.local'),
       ('a5a50000-0000-4000-8000-000000000002', 'q5-admin@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES ('a5a50000-0000-4000-8000-000000000001', 'q5-customer@test.local', 'Q5 Customer', 'customer'),
       ('a5a50000-0000-4000-8000-000000000002', 'q5-admin@test.local', 'Q5 Admin', 'customer')
ON CONFLICT (id) DO NOTHING;

UPDATE public.users SET is_admin = TRUE WHERE id = 'a5a50000-0000-4000-8000-000000000002';

-- Two existing providers are borrowed rather than inserted, as in
-- quote_flow_completion.test.sql: rows attached to them are rolled back.
SELECT set_config('t.prov',
  (SELECT id::TEXT FROM public.provider_profiles
    ORDER BY (verification_status = 'approved') DESC, id LIMIT 1), TRUE);
SELECT set_config('t.rival',
  (SELECT id::TEXT FROM public.provider_profiles
    WHERE id::TEXT <> current_setting('t.prov', TRUE)
    ORDER BY (verification_status = 'approved') DESC, id LIMIT 1), TRUE);
SELECT set_config('t.prov_user',
  (SELECT user_id::TEXT FROM public.provider_profiles
    WHERE id::TEXT = current_setting('t.prov', TRUE)), TRUE);

INSERT INTO public.vehicles (id, user_id, year, make, model)
VALUES ('c5c50000-0000-4000-8000-000000000001',
        'a5a50000-0000-4000-8000-000000000001', '2020', 'Honda', 'Pilot')
ON CONFLICT (id) DO NOTHING;

-- A confirmed job, 15:00 for two hours. Buffers are stated so the expected
-- occupied_range does not depend on the borrowed provider's defaults.
INSERT INTO public.bookings
  (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
   service_address, total_amount, deposit_amount, estimated_duration_mins,
   buffer_before_mins, buffer_after_mins)
VALUES
  ('e5e50000-0000-4000-8000-000000000001',
   'a5a50000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'c5c50000-0000-4000-8000-000000000001', '[]'::JSONB,
   'confirmed', TIMESTAMPTZ '2031-12-01 15:00:00+00', '1 Test St', 255.00, 38.25, 120,
   15, 30);

-- Completed jobs for the calibration report, in November 2031 so p_since can
-- isolate them from anything real.
--   C1: suggested 110, committed 120, took 150 (30 over); started 20 min late;
--       quoted $300 with a $30 surcharge on a $270 advertised price
--   C2: suggested 60, committed 60, took 60; on time; never quoted
--   R1: the rival's, which the provider must not see
INSERT INTO public.bookings
  (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
   started_at, completed_at, service_address, total_amount, deposit_amount,
   suggested_duration_mins, estimated_duration_mins, quoted_total_amount,
   quote_line_items)
VALUES
  ('e5e50000-0000-4000-8000-0000000000c1',
   'a5a50000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'c5c50000-0000-4000-8000-000000000001', '[]'::JSONB, 'completed',
   TIMESTAMPTZ '2031-11-01 14:00:00+00', TIMESTAMPTZ '2031-11-01 14:20:00+00',
   TIMESTAMPTZ '2031-11-01 16:50:00+00', '2 Test St', 300.00, 45.00,
   110, 120, 300.00, '[{"label":"SUV","amount_cents":3000}]'::JSONB),
  ('e5e50000-0000-4000-8000-0000000000c2',
   'a5a50000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'c5c50000-0000-4000-8000-000000000001', '[]'::JSONB, 'completed',
   TIMESTAMPTZ '2031-11-02 14:00:00+00', TIMESTAMPTZ '2031-11-02 14:00:00+00',
   TIMESTAMPTZ '2031-11-02 15:00:00+00', '3 Test St', 100.00, 15.00,
   60, 60, NULL, NULL),
  ('e5e50000-0000-4000-8000-0000000000f1',
   'a5a50000-0000-4000-8000-000000000001', current_setting('t.rival', TRUE)::UUID,
   'c5c50000-0000-4000-8000-000000000001', '[]'::JSONB, 'completed',
   TIMESTAMPTZ '2031-11-03 14:00:00+00', TIMESTAMPTZ '2031-11-03 14:00:00+00',
   TIMESTAMPTZ '2031-11-03 15:00:00+00', '4 Test St', 100.00, 15.00,
   60, 60, NULL, NULL);

-- ── 1. The delay moves the ready-by time, not the slot (as owner) ────────

SELECT set_config('t.default_delay',
  (SELECT running_late_mins::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);
SELECT set_config('t.range_before',
  (SELECT occupied_range::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);

UPDATE public.bookings SET running_late_mins = 30
 WHERE id = 'e5e50000-0000-4000-8000-000000000001';

SELECT set_config('t.etc_late',
  (SELECT estimated_completion_at::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);
SELECT set_config('t.range_after',
  (SELECT occupied_range::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);

DO $$
BEGIN
  UPDATE public.bookings SET running_late_mins = 721
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.too_late', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.too_late', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET running_late_mins = -15
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.negative_delay', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.negative_delay', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET eta_notified_at = now()
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.half_notified', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.half_notified', SQLSTATE, TRUE);
END $$;

-- ── 2. As the customer ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a5a50000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  UPDATE public.bookings SET running_late_mins = 0
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.customer_delay', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.customer_delay', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.customer_delay', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET eta_notified_at = now(), eta_notified_completion_at = now()
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.customer_notified', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.customer_notified', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.customer_notified', 'ERR:' || SQLSTATE, TRUE);
END $$;

SELECT set_config('t.customer_report',
  (SELECT count(*)::TEXT FROM public.get_duration_calibration(TIMESTAMPTZ '2031-01-01')), TRUE);

RESET ROLE;

-- ── 3. As the provider ───────────────────────────────────────────────────

SELECT set_config('t.claims',
  json_build_object('sub', current_setting('t.prov_user', TRUE), 'role', 'authenticated')::TEXT,
  TRUE);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('t.claims', TRUE), TRUE);

DO $$
BEGIN
  UPDATE public.bookings SET running_late_mins = 60
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.provider_delay', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.provider_delay', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.provider_delay', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Read before the job below starts, whose 30-minute late start would
-- otherwise join the late-start figures.
SELECT set_config('t.provider_report',
  (SELECT string_agg(
            format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
                   r.completed_jobs, r.timed_jobs, r.avg_overrun_mins,
                   r.within_estimate_jobs, r.over_estimate_jobs,
                   r.under_estimate_jobs, r.late_start_jobs,
                   r.avg_start_delay_mins, r.quoted_jobs, r.surcharged_jobs,
                   r.avg_quote_markup_pct, r.avg_suggested_mins),
            ';')
     FROM public.get_duration_calibration(TIMESTAMPTZ '2031-01-01') r), TRUE);
SELECT set_config('t.provider_report_rows',
  (SELECT count(*)::TEXT FROM public.get_duration_calibration(TIMESTAMPTZ '2031-01-01')), TRUE);

-- The ordinary job-day path: on the way, then started half an hour late,
-- through the same client transitions the active-job screen makes.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'en_route'
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  UPDATE public.bookings
     SET status = 'in_progress', started_at = TIMESTAMPTZ '2031-12-01 15:30:00+00'
   WHERE id = 'e5e50000-0000-4000-8000-000000000001';
  PERFORM set_config('t.started', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.started', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

RESET ROLE;

SELECT set_config('t.started_delay',
  (SELECT running_late_mins::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);
SELECT set_config('t.etc_started',
  (SELECT estimated_completion_at::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);

-- A delay reported after the start is about the finish, and stays.
UPDATE public.bookings SET running_late_mins = 15
 WHERE id = 'e5e50000-0000-4000-8000-000000000001';
SELECT set_config('t.etc_overrun',
  (SELECT estimated_completion_at::TEXT FROM public.bookings
    WHERE id = 'e5e50000-0000-4000-8000-000000000001'), TRUE);

-- ── 4. As an admin ───────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a5a50000-0000-4000-8000-000000000002","role":"authenticated"}';

-- Counted on the two fixture providers rather than in total: a real row with a
-- far-future date (there is a cancelled one in 2035) would join the total.
SELECT set_config('t.admin_report_rows',
  (SELECT count(*)::TEXT FROM public.get_duration_calibration(TIMESTAMPTZ '2031-01-01') r
    WHERE r.provider_id IN (current_setting('t.prov', TRUE)::UUID,
                            current_setting('t.rival', TRUE)::UUID)), TRUE);

RESET ROLE;

-- ── 5. Timezones (as owner) ──────────────────────────────────────────────

CREATE TEMP TABLE _tz (zone TEXT, outcome TEXT) ON COMMIT DROP;

DO $$
DECLARE
  zone    TEXT;
  started TIMESTAMPTZ;
BEGIN
  FOREACH zone IN ARRAY ARRAY['America/Chicago', 'UTC', 'America/Argentina/Buenos_Aires',
                              'Mars/Olympus', 'PDT', '+05', 'America/New_York; DROP']
  LOOP
    BEGIN
      started := clock_timestamp();
      UPDATE public.provider_profiles SET timezone = zone
       WHERE id = current_setting('t.prov', TRUE)::UUID;
      INSERT INTO _tz VALUES (zone, 'ALLOWED');
      -- How long the accepted ones take is the point of the change.
      IF clock_timestamp() - started > INTERVAL '1 second' THEN
        INSERT INTO _tz VALUES (zone || ' (slow)', 'SLOW');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _tz VALUES (zone, SQLSTATE);
    END;
  END LOOP;
END $$;

-- ── Assertions ───────────────────────────────────────────────────────────

INSERT INTO _results SELECT 'a new booking is on time',
  current_setting('t.default_delay', TRUE) = '0', current_setting('t.default_delay', TRUE);
-- 15:00 + 120 min + 30 min late.
INSERT INTO _results SELECT 'a delay moves the ready-by time',
  current_setting('t.etc_late', TRUE)::TIMESTAMPTZ = TIMESTAMPTZ '2031-12-01 17:30:00+00',
  current_setting('t.etc_late', TRUE);
INSERT INTO _results SELECT 'a delay does not move the committed slot',
  current_setting('t.range_after', TRUE) = current_setting('t.range_before', TRUE),
  current_setting('t.range_after', TRUE);
INSERT INTO _results SELECT 'a delay over twelve hours is refused',
  current_setting('t.too_late', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a negative delay is refused',
  current_setting('t.negative_delay', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an ETA notification needs both its time and its ETA',
  current_setting('t.half_notified', TRUE) = '23514', 'expect 23514';

INSERT INTO _results SELECT 'the customer cannot write a delay',
  current_setting('t.customer_delay', TRUE) = 'BLOCKED', current_setting('t.customer_delay', TRUE);
INSERT INTO _results SELECT 'the customer cannot write an ETA notification',
  current_setting('t.customer_notified', TRUE) = 'BLOCKED', current_setting('t.customer_notified', TRUE);
INSERT INTO _results SELECT 'the provider cannot write a delay directly',
  current_setting('t.provider_delay', TRUE) = 'BLOCKED', current_setting('t.provider_delay', TRUE);

INSERT INTO _results SELECT 'the provider can still go en route and start',
  current_setting('t.started', TRUE) = 'ALLOWED', current_setting('t.started', TRUE);
INSERT INTO _results SELECT 'starting the job clears the delay',
  current_setting('t.started_delay', TRUE) = '0', current_setting('t.started_delay', TRUE);
-- 15:30 real start + 120 min: the 30 minutes are counted once, not twice.
INSERT INTO _results SELECT 'a late start is counted once',
  current_setting('t.etc_started', TRUE)::TIMESTAMPTZ = TIMESTAMPTZ '2031-12-01 17:30:00+00',
  current_setting('t.etc_started', TRUE);
INSERT INTO _results SELECT 'a delay after the start moves the finish',
  current_setting('t.etc_overrun', TRUE)::TIMESTAMPTZ = TIMESTAMPTZ '2031-12-01 17:45:00+00',
  current_setting('t.etc_overrun', TRUE);

-- completed|timed|avg overrun|within|over|under|late starts|avg start delay|
-- quoted|surcharged|avg markup|avg suggested. C1 is 30 over and 20 late; C2
-- is exact. $30 on $270 is 11.1%.
INSERT INTO _results SELECT 'the provider sees only their own report',
  current_setting('t.provider_report_rows', TRUE) = '1',
  current_setting('t.provider_report_rows', TRUE);
INSERT INTO _results SELECT 'the report measures durations, starts and quotes',
  current_setting('t.provider_report', TRUE) = '2|2|15.0|1|1|0|1|10.0|1|1|11.1|85.0',
  current_setting('t.provider_report', TRUE);
INSERT INTO _results SELECT 'a customer sees no report',
  current_setting('t.customer_report', TRUE) = '0', current_setting('t.customer_report', TRUE);
-- A NULL rival (only one provider in the project) gives one row, which is
-- correctly not a pass.
INSERT INTO _results SELECT 'an admin sees every provider',
  current_setting('t.admin_report_rows', TRUE) = '2', current_setting('t.admin_report_rows', TRUE);
INSERT INTO _results SELECT 'anon cannot run the report',
  NOT has_function_privilege('anon', 'public.get_duration_calibration(timestamptz)', 'EXECUTE'),
  'expect no EXECUTE';

INSERT INTO _results SELECT 'IANA zones are accepted',
  (SELECT count(*) FROM _tz WHERE outcome = 'ALLOWED'
     AND zone IN ('America/Chicago', 'UTC', 'America/Argentina/Buenos_Aires')) = 3,
  (SELECT string_agg(zone || '=' || outcome, ', ') FROM _tz);
INSERT INTO _results SELECT 'unknown zones, abbreviations and offsets are refused',
  (SELECT count(*) FROM _tz WHERE outcome = '22023'
     AND zone IN ('Mars/Olympus', 'PDT', '+05', 'America/New_York; DROP')) = 4,
  (SELECT string_agg(zone || '=' || outcome, ', ') FROM _tz);
INSERT INTO _results SELECT 'the timezone check takes under a second',
  NOT EXISTS (SELECT 1 FROM _tz WHERE outcome = 'SLOW'),
  (SELECT string_agg(zone, ', ') FROM _tz WHERE outcome = 'SLOW');

INSERT INTO _results SELECT 'bookings is published to Realtime',
  EXISTS (SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime'
             AND schemaname = 'public' AND tablename = 'bookings'),
  'expect published';

-- The regression guard. GRANT is additive; none of these may ever appear.
INSERT INTO _results
SELECT 'no client grant exists on the delay or notification columns',
       NOT EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee IN ('anon', 'authenticated')
            AND privilege_type IN ('INSERT', 'UPDATE')
            AND column_name IN ('running_late_mins', 'eta_notified_at',
                                'eta_notified_completion_at')
       ),
       'expect none granted';

SELECT step, pass, note FROM _results ORDER BY step;

ROLLBACK;
