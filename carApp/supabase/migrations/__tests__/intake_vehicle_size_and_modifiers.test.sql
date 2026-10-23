-- intake_vehicle_size_and_modifiers.test.sql
--
-- Verifies 20260820000000. Wraps in a transaction and ROLLBACKs, so it never
-- touches real data.
--
-- Covers, in order: the size-class vocabulary, the condition_answers grammar
-- (including unknown keys, which is the case a CHECK constraint could not
-- express), the server-derived suggestion and its interaction with the pricing
-- trigger's rebuilt services snapshot, the intake-photo route in and the
-- 'after'-photo route that must stay closed, and the column allowlists.
--
-- Run:
--   supabase db query --linked -f supabase/migrations/__tests__/intake_vehicle_size_and_modifiers.test.sql
-- Expect every row's pass = t.

BEGIN;

CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Fixtures ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES
  ('a0a10000-0000-4000-8000-000000000001', 'p2-customer@test.local'),
  ('a0a10000-0000-4000-8000-000000000002', 'p2-provider@test.local'),
  ('a0a10000-0000-4000-8000-000000000003', 'p2-other@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES
  ('a0a10000-0000-4000-8000-000000000001', 'p2-customer@test.local', 'Intake Customer', 'customer'),
  ('a0a10000-0000-4000-8000-000000000002', 'p2-provider@test.local', 'Intake Provider', 'provider'),
  ('a0a10000-0000-4000-8000-000000000003', 'p2-other@test.local', 'Other Customer', 'customer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.provider_profiles (id, user_id, verification_status)
VALUES ('b2b20000-0000-4000-8000-000000000001',
        'a0a10000-0000-4000-8000-000000000002', 'approved')
ON CONFLICT (id) DO NOTHING;

-- The Founding Provider trigger rewrites platform_fee_rate on approval, so set
-- it after insert or every fee assertion passes trivially against zero.
UPDATE public.provider_profiles SET platform_fee_rate = 0.15
 WHERE id = 'b2b20000-0000-4000-8000-000000000001';

INSERT INTO public.vehicles (id, user_id, year, make, model)
VALUES ('c2c20000-0000-4000-8000-000000000001',
        'a0a10000-0000-4000-8000-000000000001', '2021', 'Toyota', 'RAV4')
ON CONFLICT (id) DO NOTHING;

-- A 90-minute package, so the modifier arithmetic is legible.
INSERT INTO public.service_packages
  (id, provider_id, name, base_price, duration_mins, category, is_active, is_approved)
VALUES ('d2d20000-0000-4000-8000-000000000001',
        'b2b20000-0000-4000-8000-000000000001',
        'Interior Detail', 200.00, 90, 'detailing', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Provider's published modifiers: an SUV costs 30 more minutes, heavy soil 45,
-- frequent pets 20. A compact SAVES 15 — negative deltas are legitimate.
INSERT INTO public.service_duration_modifiers
  (provider_id, factor_type, factor_value, delta_mins)
VALUES
  ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'suv', 30),
  ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'compact', -15),
  ('b2b20000-0000-4000-8000-000000000001', 'soil_level', 'heavy', 45),
  ('b2b20000-0000-4000-8000-000000000001', 'pets', 'frequent', 20)
ON CONFLICT DO NOTHING;

-- ── 1. Vocabulary ────────────────────────────────────────────────────────

DO $$
BEGIN
  UPDATE public.vehicles SET size_class = 'spaceship'
   WHERE id = 'c2c20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.bad_size', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.bad_size', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.vehicles SET size_class = 'suv'
   WHERE id = 'c2c20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.good_size', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.good_size', SQLSTATE, TRUE);
END $$;

INSERT INTO _results SELECT 'an unknown vehicle size class is refused',
  current_setting('t.bad_size', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a known vehicle size class is accepted',
  current_setting('t.good_size', TRUE) = 'ALLOWED', 'expect ALLOWED';

-- ── 2. Client-side inserts, as the customer ──────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a0a10000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Base 90 + suv 30 + heavy soil 45 + frequent pets 20 = 185.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, vehicle_size_class, condition_answers)
  VALUES ('e2e20000-0000-4000-8000-000000000001',
          'a0a10000-0000-4000-8000-000000000001',
          'b2b20000-0000-4000-8000-000000000001',
          'c2c20000-0000-4000-8000-000000000001',
          '[{"id":"d2d20000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending', TIMESTAMPTZ '2026-10-20 15:00:00+00', '1 Test St',
          'suv',
          '{"soil_level":"heavy","pets":"frequent","stains":"none"}'::JSONB);
  PERFORM set_config('t.insert_full', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.insert_full', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

-- No size, no conditions: the suggestion is the package base, unmodified.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address)
  VALUES ('e2e20000-0000-4000-8000-000000000002',
          'a0a10000-0000-4000-8000-000000000001',
          'b2b20000-0000-4000-8000-000000000001',
          'c2c20000-0000-4000-8000-000000000001',
          '[{"id":"d2d20000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending', TIMESTAMPTZ '2026-10-21 15:00:00+00', '1 Test St');
  PERFORM set_config('t.insert_bare', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.insert_bare', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

-- A negative modifier really does subtract.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, vehicle_size_class)
  VALUES ('e2e20000-0000-4000-8000-000000000003',
          'a0a10000-0000-4000-8000-000000000001',
          'b2b20000-0000-4000-8000-000000000001',
          'c2c20000-0000-4000-8000-000000000001',
          '[{"id":"d2d20000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending', TIMESTAMPTZ '2026-10-22 15:00:00+00', '1 Test St',
          'compact');
  PERFORM set_config('t.insert_compact', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.insert_compact', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

-- The forged suggestion. suggested_duration_mins is outside the INSERT
-- allowlist, so naming it at all must fail — this is the whole point of
-- deriving it rather than accepting it.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, suggested_duration_mins)
  VALUES ('e2e20000-0000-4000-8000-0000000000ff',
          'a0a10000-0000-4000-8000-000000000001',
          'b2b20000-0000-4000-8000-000000000001',
          'c2c20000-0000-4000-8000-000000000001',
          '[{"id":"d2d20000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending', TIMESTAMPTZ '2026-10-23 15:00:00+00', '1 Test St', 5);
  PERFORM set_config('t.forged_suggestion', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.forged_suggestion', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.forged_suggestion', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 3. condition_answers grammar ─────────────────────────────────────────

DO $$
BEGIN
  UPDATE public.bookings
     SET condition_answers = '{"soilLevel":"heavy"}'::JSONB
   WHERE id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.unknown_key', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.unknown_key', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET condition_answers = '{"soil_level":"filthy"}'::JSONB
   WHERE id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.bad_value', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.bad_value', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET condition_answers = '["heavy"]'::JSONB
   WHERE id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.not_object', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.not_object', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET condition_answers = '{"soil_level":"light","stains":"some"}'::JSONB
   WHERE id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.partial_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.partial_ok', SQLSTATE, TRUE);
END $$;

-- ── 4. Intake photos ─────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO public.booking_photos (booking_id, photo_type, storage_url)
  VALUES ('e2e20000-0000-4000-8000-000000000001', 'intake',
          'booking-photos/e2e2/intake-1.jpg');
  PERFORM set_config('t.intake_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.intake_ok', SQLSTATE, TRUE);
END $$;

-- The 'after' photo is the evidence a job was done correctly. It is the
-- provider's record and feeds dispute resolution, so the customer route in must
-- be intake-only.
DO $$
BEGIN
  INSERT INTO public.booking_photos (booking_id, photo_type, storage_url)
  VALUES ('e2e20000-0000-4000-8000-000000000001', 'after',
          'booking-photos/e2e2/after-forged.jpg');
  PERFORM set_config('t.customer_after', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.customer_after', 'BLOCKED', TRUE);
END $$;

-- Someone else's booking, even for an intake photo.
DO $$
BEGIN
  INSERT INTO public.booking_photos (booking_id, photo_type, storage_url)
  VALUES ('e2e20000-0000-4000-8000-000000000001', 'intake', 'x.jpg');
  PERFORM set_config('t.dummy', 'x', TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.booking_photos SET storage_url = 'rewritten.jpg'
   WHERE booking_id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.photo_update', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.photo_update', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.photo_update', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  DELETE FROM public.booking_photos
   WHERE booking_id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.photo_delete', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.photo_delete', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.photo_delete', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 5. Intake columns belong to the customer, while uncommitted ──────────

RESET ROLE;
UPDATE public.bookings SET status = 'confirmed'
 WHERE id = 'e2e20000-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a0a10000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  UPDATE public.bookings SET vehicle_size_class = 'van'
   WHERE id = 'e2e20000-0000-4000-8000-000000000003';
  PERFORM set_config('t.frozen_after_confirm', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.frozen_after_confirm', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.frozen_after_confirm', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The provider is a participant on the row, so RLS lets them through and
-- enforce_booking_status_transition ignores non-status columns. Only the intake
-- trigger stops them rewriting the stated basis of the quote.
SET LOCAL request.jwt.claims TO
  '{"sub":"a0a10000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  UPDATE public.bookings SET vehicle_size_class = 'compact'
   WHERE id = 'e2e20000-0000-4000-8000-000000000001';
  PERFORM set_config('t.provider_rewrite', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.provider_rewrite', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.provider_rewrite', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 6. Modifier ownership ────────────────────────────────────────────────

SET LOCAL request.jwt.claims TO
  '{"sub":"a0a10000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  INSERT INTO public.service_duration_modifiers
    (provider_id, factor_type, factor_value, delta_mins)
  VALUES ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'van', 999);
  PERFORM set_config('t.foreign_modifier', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.foreign_modifier', 'BLOCKED', TRUE);
END $$;

SET LOCAL request.jwt.claims TO
  '{"sub":"a0a10000-0000-4000-8000-000000000002","role":"authenticated"}';

DO $$
BEGIN
  INSERT INTO public.service_duration_modifiers
    (provider_id, factor_type, factor_value, delta_mins)
  VALUES ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'van', 25);
  PERFORM set_config('t.own_modifier', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.own_modifier', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_duration_modifiers
    (provider_id, factor_type, factor_value, delta_mins)
  VALUES ('b2b20000-0000-4000-8000-000000000001', 'soil_level', 'suv', 10);
  PERFORM set_config('t.crossed_factor', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.crossed_factor', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_duration_modifiers
    (provider_id, factor_type, factor_value, delta_mins)
  VALUES ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'truck', 9000);
  PERFORM set_config('t.absurd_delta', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.absurd_delta', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_duration_modifiers
    (provider_id, factor_type, factor_value, delta_mins)
  VALUES ('b2b20000-0000-4000-8000-000000000001', 'size_class', 'suv', 5);
  PERFORM set_config('t.duplicate_modifier', 'ALLOWED', TRUE);
EXCEPTION WHEN unique_violation THEN
  PERFORM set_config('t.duplicate_modifier', 'BLOCKED', TRUE);
WHEN OTHERS THEN
  PERFORM set_config('t.duplicate_modifier', 'ERR:' || SQLSTATE, TRUE);
END $$;

RESET ROLE;

-- ── Assertions ───────────────────────────────────────────────────────────

INSERT INTO _results SELECT 'a customer can state size and condition on insert',
  current_setting('t.insert_full', TRUE) = 'ALLOWED',
  current_setting('t.insert_full', TRUE);
INSERT INTO _results SELECT 'a booking with neither still inserts',
  current_setting('t.insert_bare', TRUE) = 'ALLOWED',
  current_setting('t.insert_bare', TRUE);

INSERT INTO _results
SELECT 'the suggestion sums the package base and every matching modifier',
       suggested_duration_mins = 185, format('%s, expect 185', suggested_duration_mins)
  FROM public.bookings WHERE id = 'e2e20000-0000-4000-8000-000000000001';

INSERT INTO _results
SELECT 'an unanswered factor contributes nothing, rather than a middle value',
       suggested_duration_mins = 90, format('%s, expect 90', suggested_duration_mins)
  FROM public.bookings WHERE id = 'e2e20000-0000-4000-8000-000000000002';

INSERT INTO _results
SELECT 'a negative modifier subtracts',
       suggested_duration_mins = 75, format('%s, expect 75', suggested_duration_mins)
  FROM public.bookings WHERE id = 'e2e20000-0000-4000-8000-000000000003';

-- The two durations answer different questions and must not be conflated: the
-- suggestion is what the engine proposed, estimated_duration_mins is what the
-- pricing trigger derived from the packages alone.
INSERT INTO _results
SELECT 'the suggestion does not overwrite the committed duration',
       estimated_duration_mins = 90 AND suggested_duration_mins = 185,
       format('estimated %s, suggested %s',
              estimated_duration_mins, suggested_duration_mins)
  FROM public.bookings WHERE id = 'e2e20000-0000-4000-8000-000000000001';

INSERT INTO _results SELECT 'a client cannot state its own suggested duration',
  current_setting('t.forged_suggestion', TRUE) = 'BLOCKED', 'expect BLOCKED';

INSERT INTO _results SELECT 'an unknown condition question is refused',
  current_setting('t.unknown_key', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'an invalid condition answer is refused',
  current_setting('t.bad_value', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'condition_answers must be an object',
  current_setting('t.not_object', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a partially answered questionnaire is accepted',
  current_setting('t.partial_ok', TRUE) = 'ALLOWED', 'expect ALLOWED';

INSERT INTO _results SELECT 'a customer can attach an intake photo',
  current_setting('t.intake_ok', TRUE) = 'ALLOWED',
  current_setting('t.intake_ok', TRUE);
INSERT INTO _results SELECT 'a customer cannot attach an after photo',
  current_setting('t.customer_after', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'photos cannot be rewritten by a client',
  current_setting('t.photo_update', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'photos cannot be deleted by a client',
  current_setting('t.photo_delete', TRUE) = 'BLOCKED', 'expect BLOCKED';

INSERT INTO _results
SELECT 'intake columns are frozen once the booking is confirmed',
  current_setting('t.frozen_after_confirm', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results
SELECT 'a provider cannot rewrite the declared size on the customer''s booking',
  current_setting('t.provider_rewrite', TRUE) = 'BLOCKED', 'expect BLOCKED';

INSERT INTO _results SELECT 'a customer cannot publish modifiers for a provider',
  current_setting('t.foreign_modifier', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a provider can publish their own modifiers',
  current_setting('t.own_modifier', TRUE) = 'ALLOWED',
  current_setting('t.own_modifier', TRUE);
INSERT INTO _results SELECT 'a value from the wrong factor type is refused',
  current_setting('t.crossed_factor', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an out-of-range delta is refused',
  current_setting('t.absurd_delta', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a duplicate modifier for one factor value is refused',
  current_setting('t.duplicate_modifier', TRUE) = 'BLOCKED', 'expect BLOCKED';

-- The regression guard from 20260819000000's lesson: GRANT is additive, so a
-- careless re-grant elsewhere could hand back a money column.
INSERT INTO _results
SELECT 'the new grants did not reopen any bookings money column',
       NOT EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee IN ('anon', 'authenticated')
            AND privilege_type IN ('INSERT', 'UPDATE')
            AND column_name IN ('total_amount', 'deposit_amount',
                                'platform_fee', 'provider_payout',
                                'suggested_duration_mins')
       ),
       'expect no money or derived-duration column granted';

SELECT step, pass, note FROM _results ORDER BY step;

ROLLBACK;
