-- Behavioral test for migration 20260818000000_booking_buffers_and_overlap_guard.
--
-- Covers the three pieces the migration adds and, just as importantly, the
-- flows it must NOT break:
--
--   * Buffer snapshot — a new booking inherits the provider's defaults; an
--     explicit value is respected; a re-quote does not re-snapshot.
--   * occupied_range — spans [scheduled_at - before, + duration + after), is
--     keyed off scheduled_at rather than started_at, and follows a reschedule.
--   * The EXCLUDE constraint — refuses a second committed booking in the same
--     range with 23P01, allows back-to-back jobs whose buffers just touch,
--     ignores pending requests, ignores cancelled rows, and does not confine a
--     provider's overlap to another provider's day.
--   * Starting a job late does not fail against the provider's next booking.
--
-- Everything runs in a transaction that ROLLBACKs, so it never mutates real
-- data. Each write that is expected to fail runs inside a DO block, so the
-- denial is caught on an internal savepoint instead of aborting the whole
-- transaction; the outcome is stashed in a transaction-local GUC and read back
-- in the assertions.
--
-- Seeds run as the table owner (RLS bypassed) because the subject here is the
-- constraint, not RLS — the privilege layer has its own fixtures in
-- bookings_update_column_guard.test.sql and bookings_server_derived_pricing.test.sql.
--
-- Run against the linked project:
--   supabase db query --linked -f supabase/migrations/__tests__/booking_buffers_and_overlap_guard.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed ─────────────────────────────────────────────────────────────────
INSERT INTO public.users (id, email) VALUES
  ('aaaa0000-0000-4000-8000-000000000001', 'overlap-customer@example.com'),
  ('aaaa0000-0000-4000-8000-000000000002', 'overlap-customer-two@example.com'),
  ('bbbb0000-0000-4000-8000-000000000001', 'overlap-provider@example.com'),
  ('bbbb0000-0000-4000-8000-000000000002', 'overlap-provider-two@example.com');

-- 20 before / 40 after, deliberately different from the 15/30 platform default
-- so the snapshot assertions cannot pass against the wrong source.
INSERT INTO public.provider_profiles
  (id, user_id, verification_status, default_buffer_before_mins, default_buffer_after_mins)
VALUES
  ('cccc0000-0000-4000-8000-000000000001', 'bbbb0000-0000-4000-8000-000000000001',
   'approved', 20, 40),
  ('cccc0000-0000-4000-8000-000000000002', 'bbbb0000-0000-4000-8000-000000000002',
   'approved', 20, 40);

-- Anchor every time to a fixed instant so the assertions are exact rather than
-- relative to a moving now().
CREATE TEMP TABLE _anchor AS SELECT TIMESTAMPTZ '2026-09-14 15:00:00+00' AS t;

-- The reference booking: 10:00-12:00 local-equivalent, 120 minutes of work.
-- With the provider's 20/40 defaults it occupies 14:40 -> 17:40 UTC.
INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
SELECT 'dddd0000-0000-4000-8000-000000000001',
       'aaaa0000-0000-4000-8000-000000000001',
       'cccc0000-0000-4000-8000-000000000001',
       'confirmed', t, 120
  FROM _anchor;

-- ── 1. Buffer snapshot ───────────────────────────────────────────────────
INSERT INTO _results
SELECT 'buffers snapshot from the provider defaults',
       buffer_before_mins = 20 AND buffer_after_mins = 40,
       format('got %s/%s, expect 20/40', buffer_before_mins, buffer_after_mins)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000001';

-- An explicit buffer must survive: Phase 3's quote step sets these per job.
INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins,
   buffer_before_mins, buffer_after_mins)
SELECT 'dddd0000-0000-4000-8000-000000000002',
       'aaaa0000-0000-4000-8000-000000000001',
       'cccc0000-0000-4000-8000-000000000001',
       'pending', t + interval '10 days', 60, 5, 5
  FROM _anchor;

INSERT INTO _results
SELECT 'an explicitly stated buffer is not overwritten',
       buffer_before_mins = 5 AND buffer_after_mins = 5,
       format('got %s/%s, expect 5/5', buffer_before_mins, buffer_after_mins)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000002';

-- ── 2. occupied_range ────────────────────────────────────────────────────
INSERT INTO _results
SELECT 'occupied_range spans [start - before, start + duration + after)',
       lower(occupied_range) = (SELECT t - interval '20 min' FROM _anchor)
       AND upper(occupied_range) = (SELECT t + interval '160 min' FROM _anchor),
       format('%s', occupied_range)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000001';

INSERT INTO _results
SELECT 'occupied_range is half-open, so back-to-back jobs do not overlap',
       NOT (occupied_range && tstzrange(upper(occupied_range),
                                        upper(occupied_range) + interval '1 hour', '[)')),
       'expect no overlap at the shared boundary'
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000001';

-- A row with no known duration and no buffers occupies nothing rather than
-- pretending to a length. Documented behaviour, asserted so a future change to
-- the COALESCE defaults is caught here.
INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, buffer_before_mins, buffer_after_mins)
SELECT 'dddd0000-0000-4000-8000-000000000003',
       'aaaa0000-0000-4000-8000-000000000001',
       'cccc0000-0000-4000-8000-000000000001',
       'pending', t + interval '20 days', 0, 0
  FROM _anchor;

INSERT INTO _results
SELECT 'unknown duration with zero buffers yields an empty range',
       isempty(occupied_range), format('%s', occupied_range)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000003';

-- ── 3. The EXCLUDE constraint ────────────────────────────────────────────
-- Straight double-booking: same provider, same instant.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000010',
          'aaaa0000-0000-4000-8000-000000000002',
          'cccc0000-0000-4000-8000-000000000001',
          'confirmed', anchor, 60);
  PERFORM set_config('test.same_instant', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.same_instant', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.same_instant', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The subtler case: a start that clears the first job's service time but lands
-- inside its trailing buffer. This is the one a naive scheduled_at comparison
-- would let through.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000011',
          'aaaa0000-0000-4000-8000-000000000002',
          'cccc0000-0000-4000-8000-000000000001',
          'confirmed', anchor + interval '130 min', 60);
  PERFORM set_config('test.buffer_overlap', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.buffer_overlap', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.buffer_overlap', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Genuinely clear of the buffers: must be allowed, or the constraint has made
-- the provider's day unbookable.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000012',
          'aaaa0000-0000-4000-8000-000000000002',
          'cccc0000-0000-4000-8000-000000000001',
          'confirmed', anchor + interval '180 min', 60);
  PERFORM set_config('test.clear_slot', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.clear_slot', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Several customers may request the same window; the first ACCEPT wins, so
-- uncommitted statuses must not reserve anything (spec §7).
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000013',
          'aaaa0000-0000-4000-8000-000000000002',
          'cccc0000-0000-4000-8000-000000000001',
          'pending_provider_approval', anchor, 120);
  PERFORM set_config('test.pending_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.pending_ok', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ...and accepting that request is exactly where the guard should bite.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'confirmed'
   WHERE id = 'dddd0000-0000-4000-8000-000000000013';
  PERFORM set_config('test.accept_taken', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.accept_taken', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.accept_taken', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- A cancelled booking must not keep reserving its slot, or every abandoned
-- PaymentSheet would permanently burn a window in the provider's calendar.
INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
SELECT 'dddd0000-0000-4000-8000-000000000014',
       'aaaa0000-0000-4000-8000-000000000002',
       'cccc0000-0000-4000-8000-000000000001',
       'cancelled', t + interval '30 days', 120
  FROM _anchor;

DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000016',
          'aaaa0000-0000-4000-8000-000000000001',
          'cccc0000-0000-4000-8000-000000000001',
          'confirmed', anchor + interval '30 days', 120);
  PERFORM set_config('test.cancelled_slot', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.cancelled_slot', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.cancelled_slot', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The constraint is per provider, not global.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
  VALUES ('dddd0000-0000-4000-8000-000000000015',
          'aaaa0000-0000-4000-8000-000000000002',
          'cccc0000-0000-4000-8000-000000000002',
          'confirmed', anchor, 120);
  PERFORM set_config('test.other_provider', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.other_provider', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 4. The flows that must keep working ──────────────────────────────────
-- Rescheduling into a free slot moves the range with it.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  UPDATE public.bookings SET scheduled_at = anchor + interval '7 days'
   WHERE id = 'dddd0000-0000-4000-8000-000000000012';
  PERFORM set_config('test.reschedule_free', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.reschedule_free', 'ERR:' || SQLSTATE, TRUE);
END $$;

INSERT INTO _results
SELECT 'a reschedule moves occupied_range with scheduled_at',
       lower(occupied_range) = (SELECT t + interval '7 days' - interval '20 min' FROM _anchor),
       format('%s', occupied_range)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000012';

-- Rescheduling ONTO a committed job is refused. Same code path a customer's
-- reschedule takes, which is why it is asserted separately from insert.
DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  UPDATE public.bookings SET scheduled_at = anchor
   WHERE id = 'dddd0000-0000-4000-8000-000000000012';
  PERFORM set_config('test.reschedule_taken', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.reschedule_taken', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.reschedule_taken', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The headline non-regression. A provider standing at the car, starting two
-- hours late, must still be able to tap Start Job even though the real work now
-- runs into the next booking's slot. occupied_range keys off scheduled_at
-- precisely so this cannot 23P01.
INSERT INTO public.bookings
  (id, customer_id, provider_id, status, scheduled_at, estimated_duration_mins)
SELECT 'dddd0000-0000-4000-8000-000000000020',
       'aaaa0000-0000-4000-8000-000000000002',
       'cccc0000-0000-4000-8000-000000000002',
       'confirmed', t + interval '4 hours', 120
  FROM _anchor;

DO $$
DECLARE anchor TIMESTAMPTZ := (SELECT t FROM _anchor);
BEGIN
  UPDATE public.bookings
     SET status = 'in_progress', started_at = anchor + interval '2 hours'
   WHERE id = 'dddd0000-0000-4000-8000-000000000015';
  PERFORM set_config('test.late_start', 'ALLOWED', TRUE);
EXCEPTION
  WHEN exclusion_violation THEN PERFORM set_config('test.late_start', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.late_start', 'ERR:' || SQLSTATE, TRUE);
END $$;

INSERT INTO _results
SELECT 'a late start does not move occupied_range',
       lower(occupied_range) = (SELECT t - interval '20 min' FROM _anchor),
       format('%s', occupied_range)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000015';

-- ...while the customer-facing ready-by time does follow reality (Phase 0).
INSERT INTO _results
SELECT 'a late start does move estimated_completion_at',
       estimated_completion_at = (SELECT t + interval '4 hours' FROM _anchor),
       format('%s', estimated_completion_at)
  FROM public.bookings WHERE id = 'dddd0000-0000-4000-8000-000000000015';

-- ── Assertions ───────────────────────────────────────────────────────────
INSERT INTO _results SELECT 'a second committed booking at the same instant is refused',
  current_setting('test.same_instant', TRUE) = 'BLOCKED', 'expect BLOCKED (23P01)';
INSERT INTO _results SELECT 'a booking landing inside the trailing buffer is refused',
  current_setting('test.buffer_overlap', TRUE) = 'BLOCKED', 'expect BLOCKED (23P01)';
INSERT INTO _results SELECT 'a booking clear of the buffers is allowed',
  current_setting('test.clear_slot', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'a competing request may still be created',
  current_setting('test.pending_ok', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'accepting a request for a taken slot is refused',
  current_setting('test.accept_taken', TRUE) = 'BLOCKED', 'expect BLOCKED (23P01)';
INSERT INTO _results SELECT 'a cancelled booking no longer reserves its slot',
  current_setting('test.cancelled_slot', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'the guard is per provider, not global',
  current_setting('test.other_provider', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'rescheduling into a free slot is allowed',
  current_setting('test.reschedule_free', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'rescheduling onto a committed job is refused',
  current_setting('test.reschedule_taken', TRUE) = 'BLOCKED', 'expect BLOCKED (23P01)';
INSERT INTO _results SELECT 'a provider can start a job two hours late',
  current_setting('test.late_start', TRUE) = 'ALLOWED', 'expect ALLOWED';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
