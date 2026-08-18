-- quote_statuses_and_arrival_windows.test.sql
--
-- Verifies 20260821000000. Wraps in a transaction and ROLLBACKs.
--
-- The load-bearing assertions are the negative ones: that widening the status
-- vocabulary did not open a client route to setting a price, and that the two
-- quote columns are unreachable from the client on both INSERT and UPDATE.
--
-- Run:
--   supabase db query --linked -f supabase/migrations/__tests__/quote_statuses_and_arrival_windows.test.sql
-- Expect every row's pass = t.

BEGIN;

CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Fixtures ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES
  ('a3a30000-0000-4000-8000-000000000001', 'q3-customer@test.local'),
  ('a3a30000-0000-4000-8000-000000000002', 'q3-provider@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES
  ('a3a30000-0000-4000-8000-000000000001', 'q3-customer@test.local', 'Quote Customer', 'customer'),
  ('a3a30000-0000-4000-8000-000000000002', 'q3-provider@test.local', 'Quote Provider', 'provider')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.provider_profiles (id, user_id, verification_status)
VALUES ('b3b30000-0000-4000-8000-000000000001',
        'a3a30000-0000-4000-8000-000000000002', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vehicles (id, user_id, year, make, model)
VALUES ('c3c30000-0000-4000-8000-000000000001',
        'a3a30000-0000-4000-8000-000000000001', '2020', 'Honda', 'Civic')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.service_packages
  (id, provider_id, name, base_price, duration_mins, category, is_active, is_approved)
VALUES ('d3d30000-0000-4000-8000-000000000001',
        'b3b30000-0000-4000-8000-000000000001',
        'Full Detail', 300.00, 120, 'detailing', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── 1. The new statuses are legal, and the old ones still are ────────────

DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, total_amount, deposit_amount)
  VALUES ('e3e30000-0000-4000-8000-000000000001',
          'a3a30000-0000-4000-8000-000000000001',
          'b3b30000-0000-4000-8000-000000000001',
          'c3c30000-0000-4000-8000-000000000001',
          '[{"id":"d3d30000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending_provider_quote', TIMESTAMPTZ '2026-11-10 15:00:00+00',
          '9 Test St', 300.00, 45.00);
  PERFORM set_config('t.new_status', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.new_status', SQLSTATE, TRUE);
END $$;

-- §2: legacy rows are left as-is and the old statuses stay valid.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, total_amount, deposit_amount)
  VALUES ('e3e30000-0000-4000-8000-000000000002',
          'a3a30000-0000-4000-8000-000000000001',
          'b3b30000-0000-4000-8000-000000000001',
          'c3c30000-0000-4000-8000-000000000001',
          '[{"id":"d3d30000-0000-4000-8000-000000000001"}]'::JSONB,
          'pending_provider_approval', TIMESTAMPTZ '2026-11-11 15:00:00+00',
          '9 Test St', 300.00, 45.00);
  PERFORM set_config('t.old_status', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.old_status', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, total_amount, deposit_amount)
  VALUES ('e3e30000-0000-4000-8000-0000000000fe',
          'a3a30000-0000-4000-8000-000000000001',
          'b3b30000-0000-4000-8000-000000000001',
          'c3c30000-0000-4000-8000-000000000001',
          '[{"id":"d3d30000-0000-4000-8000-000000000001"}]'::JSONB,
          'quoting_maybe', TIMESTAMPTZ '2026-11-12 15:00:00+00',
          '9 Test St', 300.00, 45.00);
  PERFORM set_config('t.bogus_status', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.bogus_status', SQLSTATE, TRUE);
END $$;

-- ── 2. Arrival window shape ──────────────────────────────────────────────

DO $$
BEGIN
  UPDATE public.bookings
     SET requested_window_start = TIMESTAMPTZ '2026-11-10 14:00:00+00',
         requested_window_end   = TIMESTAMPTZ '2026-11-10 18:00:00+00'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.window_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.window_ok', SQLSTATE, TRUE);
END $$;

-- A half-stated window is a missing one, not a narrower ask.
DO $$
BEGIN
  UPDATE public.bookings
     SET requested_window_start = TIMESTAMPTZ '2026-11-10 14:00:00+00',
         requested_window_end   = NULL
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.half_window', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.half_window', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET requested_window_start = TIMESTAMPTZ '2026-11-10 18:00:00+00',
         requested_window_end   = TIMESTAMPTZ '2026-11-10 14:00:00+00'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.inverted_window', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.inverted_window', SQLSTATE, TRUE);
END $$;

-- ── 3. Quote line item grammar ───────────────────────────────────────────

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items =
       '[{"label":"SUV","amount_cents":3000},{"label":"Heavy pet hair","amount_cents":2500}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.quote_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.quote_ok', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items = '{"label":"SUV","amount_cents":3000}'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.quote_not_array', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.quote_not_array', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items = '[{"label":"","amount_cents":3000}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.quote_blank_label', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.quote_blank_label', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items = '[{"label":"SUV","amount_cents":"3000"}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.quote_string_amount', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.quote_string_amount', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items = '[{"label":"SUV","amount_cents":30.5}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.quote_fractional', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.quote_fractional', SQLSTATE, TRUE);
END $$;

-- ── 4. As the customer ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a3a30000-0000-4000-8000-000000000001","role":"authenticated"}';

-- The window IS the customer's to state.
DO $$
BEGIN
  UPDATE public.bookings
     SET requested_window_start = TIMESTAMPTZ '2026-11-10 13:00:00+00',
         requested_window_end   = TIMESTAMPTZ '2026-11-10 17:00:00+00'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.client_window', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_window', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_window', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- The quote is not. This is the whole point of the migration.
DO $$
BEGIN
  UPDATE public.bookings SET quoted_total_amount = 1.00
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.client_quote_total', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_quote_total', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_quote_total', 'ERR:' || SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET quote_line_items = '[{"label":"Discount","amount_cents":-99999}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.client_quote_items', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_quote_items', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_quote_items', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- §2: cancel-from-either-end is the release valve, since there are no expiry
-- timers. Nothing has been charged in these states.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'cancelled'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.customer_cancels_quote', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.customer_cancels_quote', 'BLOCKED', TRUE);
END $$;

-- Self-approving a quote would be setting a price by another route: the
-- approval transition is what charges the deposit.
RESET ROLE;
UPDATE public.bookings SET status = 'pending_provider_quote'
 WHERE id = 'e3e30000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a3a30000-0000-4000-8000-000000000001","role":"authenticated"}';

DO $$
BEGIN
  UPDATE public.bookings SET status = 'confirmed'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.customer_self_confirm', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.customer_self_confirm', 'BLOCKED', TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET status = 'pending_customer_approval'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.customer_self_quote', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.customer_self_quote', 'BLOCKED', TRUE);
END $$;

-- ── 5. As the provider ───────────────────────────────────────────────────

SET LOCAL request.jwt.claims TO
  '{"sub":"a3a30000-0000-4000-8000-000000000002","role":"authenticated"}';

-- Submitting a quote sets a price, so it belongs to an Edge Function.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'pending_customer_approval'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.provider_self_quote', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.provider_self_quote', 'BLOCKED', TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET status = 'cancelled'
   WHERE id = 'e3e30000-0000-4000-8000-000000000001';
  PERFORM set_config('t.provider_cancels_quote', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.provider_cancels_quote', 'BLOCKED', TRUE);
END $$;

RESET ROLE;

-- The service role is where quoting actually lives.
DO $$
BEGIN
  UPDATE public.bookings
     SET status = 'pending_customer_approval',
         quoted_total_amount = 355.00,
         quote_line_items = '[{"label":"SUV","amount_cents":3000},{"label":"Heavy pet hair","amount_cents":2500}]'::JSONB
   WHERE id = 'e3e30000-0000-4000-8000-000000000002';
  PERFORM set_config('t.service_role_quote', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.service_role_quote', SQLSTATE, TRUE);
END $$;

-- ── Assertions ───────────────────────────────────────────────────────────

INSERT INTO _results SELECT 'the quote statuses are legal',
  current_setting('t.new_status', TRUE) = 'ALLOWED',
  current_setting('t.new_status', TRUE);
INSERT INTO _results SELECT 'the existing statuses are still legal',
  current_setting('t.old_status', TRUE) = 'ALLOWED',
  current_setting('t.old_status', TRUE);
INSERT INTO _results SELECT 'an invented status is still refused',
  current_setting('t.bogus_status', TRUE) = '23514', 'expect 23514';

INSERT INTO _results SELECT 'a well-formed arrival window is accepted',
  current_setting('t.window_ok', TRUE) = 'ALLOWED',
  current_setting('t.window_ok', TRUE);
INSERT INTO _results SELECT 'a half-stated arrival window is refused',
  current_setting('t.half_window', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an inverted arrival window is refused',
  current_setting('t.inverted_window', TRUE) = '23514', 'expect 23514';

INSERT INTO _results SELECT 'a well-formed itemised quote is accepted',
  current_setting('t.quote_ok', TRUE) = 'ALLOWED',
  current_setting('t.quote_ok', TRUE);
INSERT INTO _results SELECT 'quote_line_items must be an array',
  current_setting('t.quote_not_array', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a quote line needs a label',
  current_setting('t.quote_blank_label', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a quote amount must be a number, not a string',
  current_setting('t.quote_string_amount', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'a fractional cent is refused',
  current_setting('t.quote_fractional', TRUE) = '22023', 'expect 22023';

INSERT INTO _results SELECT 'a customer can state their arrival window',
  current_setting('t.client_window', TRUE) = 'ALLOWED',
  current_setting('t.client_window', TRUE);
INSERT INTO _results SELECT 'a customer cannot state a quoted total',
  current_setting('t.client_quote_total', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a customer cannot write quote line items',
  current_setting('t.client_quote_items', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a customer can cancel an unpriced request',
  current_setting('t.customer_cancels_quote', TRUE) = 'ALLOWED',
  'expect ALLOWED';
INSERT INTO _results SELECT 'a customer cannot confirm their own booking',
  current_setting('t.customer_self_confirm', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a customer cannot move a request to awaiting approval',
  current_setting('t.customer_self_quote', TRUE) = 'BLOCKED', 'expect BLOCKED';

INSERT INTO _results SELECT 'a provider cannot submit a quote client-side',
  current_setting('t.provider_self_quote', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a provider can cancel an unpriced request',
  current_setting('t.provider_cancels_quote', TRUE) = 'ALLOWED',
  'expect ALLOWED';
INSERT INTO _results SELECT 'the service role can submit a quote',
  current_setting('t.service_role_quote', TRUE) = 'ALLOWED',
  current_setting('t.service_role_quote', TRUE);

-- The regression guard: widening the vocabulary must not have widened the
-- grants. GRANT is additive and these two columns are the whole point.
INSERT INTO _results
SELECT 'no client grant exists on either quote column',
       NOT EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee IN ('anon', 'authenticated')
            AND privilege_type IN ('INSERT', 'UPDATE')
            AND column_name IN ('quote_line_items', 'quoted_total_amount')
       ),
       'expect neither column granted';

SELECT step, pass, note FROM _results ORDER BY step;

ROLLBACK;
