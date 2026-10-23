-- quote_flow_completion.test.sql
--
-- Verifies 20260822000000. Wraps in a transaction and ROLLBACKs.
--
-- The load-bearing assertions are, again, the negative ones: that the new
-- server-only columns are unreachable from the client, that a customer can no
-- longer move a confirmed job's start on their own, and that a job waiting on
-- an adjustment still holds its slot.
--
-- Run:
--   supabase db query --linked -f supabase/migrations/__tests__/quote_flow_completion.test.sql
-- Expect every row's pass = t.

BEGIN;

CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Fixtures ─────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email)
VALUES ('a4a40000-0000-4000-8000-000000000001', 'q4-customer@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES ('a4a40000-0000-4000-8000-000000000001', 'q4-customer@test.local', 'Q4 Customer', 'customer')
ON CONFLICT (id) DO NOTHING;

-- No provider profile is created here. trg_validate_provider_schedule checks
-- every provider_profiles insert against pg_timezone_names, which on the hosted
-- project has taken from ~20s to over a minute per lookup — enough to push a
-- suite past the management API's 100s gateway limit (HTTP 524), losing the
-- output, while the transaction keeps its locks. Two existing providers are
-- borrowed instead; every row this suite attaches to them is rolled back.
-- Approved ones first, so RLS treats them like any bookable provider.
SELECT set_config('t.prov',
  (SELECT id::TEXT FROM public.provider_profiles
    ORDER BY (verification_status = 'approved') DESC, id LIMIT 1), TRUE);
SELECT set_config('t.rival',
  (SELECT id::TEXT FROM public.provider_profiles
    WHERE id::TEXT <> current_setting('t.prov', TRUE)
    ORDER BY (verification_status = 'approved') DESC, id LIMIT 1), TRUE);

INSERT INTO public.vehicles (id, user_id, year, make, model)
VALUES ('c4c40000-0000-4000-8000-000000000001',
        'a4a40000-0000-4000-8000-000000000001', '2021', 'Subaru', 'Outback')
ON CONFLICT (id) DO NOTHING;

-- A tiered main service with an advertised range, and one belonging to some
-- other provider (see the note on the provider fixture above).
INSERT INTO public.service_packages
  (id, provider_id, name, base_price, duration_mins, category, is_active,
   is_approved, tier, duration_min_mins, duration_max_mins)
VALUES
  ('d4d40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'Premium Detail', 250.00, 150, 'detailing', TRUE, TRUE, 'premium', 120, 180),
  ('d4d40000-0000-4000-8000-000000000003', current_setting('t.prov', TRUE)::UUID,
   'Basic Detail', 120.00, 60, 'detailing', TRUE, TRUE, 'basic', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.service_packages
  (id, provider_id, name, base_price, duration_mins, category, is_active, is_approved)
VALUES ('d4d40000-0000-4000-8000-000000000009', current_setting('t.rival', TRUE)::UUID,
        'Rival Detail', 100.00, 60, 'detailing', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ── 1. Package tiers, ranges, add-ons ────────────────────────────────────

-- An add-on stated as 'mechanical' under a detailing parent: the hierarchy
-- trigger aligns it, so the menu never shows an add-on in a section its parent
-- is not in.
DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, base_price, duration_mins, category, is_active,
     is_approved, parent_package_id)
  VALUES ('d4d40000-0000-4000-8000-000000000002', current_setting('t.prov', TRUE)::UUID,
          'Ceramic Boost', 40.00, 30, 'mechanical', TRUE, TRUE,
          'd4d40000-0000-4000-8000-000000000001');
  PERFORM set_config('t.addon_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.addon_ok', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

SELECT set_config('t.addon_category',
  COALESCE((SELECT category FROM public.service_packages
             WHERE id = 'd4d40000-0000-4000-8000-000000000002'), 'missing'), TRUE);

DO $$
BEGIN
  INSERT INTO public.service_packages (id, provider_id, name, category, tier)
  VALUES ('d4d40000-0000-4000-8000-0000000000f1', current_setting('t.prov', TRUE)::UUID,
          'Gold Detail', 'detailing', 'gold');
  PERFORM set_config('t.bad_tier', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.bad_tier', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, category, duration_min_mins, duration_max_mins)
  VALUES ('d4d40000-0000-4000-8000-0000000000f2', current_setting('t.prov', TRUE)::UUID,
          'Backwards', 'detailing', 180, 120);
  PERFORM set_config('t.inverted_range', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.inverted_range', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, category, duration_min_mins)
  VALUES ('d4d40000-0000-4000-8000-0000000000f3', current_setting('t.prov', TRUE)::UUID,
          'Half Range', 'detailing', 120);
  PERFORM set_config('t.half_range', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.half_range', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, category, tier, parent_package_id)
  VALUES ('d4d40000-0000-4000-8000-0000000000f4', current_setting('t.prov', TRUE)::UUID,
          'Tiered Add-on', 'detailing', 'basic', 'd4d40000-0000-4000-8000-000000000001');
  PERFORM set_config('t.tiered_addon', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.tiered_addon', SQLSTATE, TRUE);
END $$;

-- Hanging an add-on off a competitor's service would put it on their menu.
DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, category, parent_package_id)
  VALUES ('d4d40000-0000-4000-8000-0000000000f5', current_setting('t.prov', TRUE)::UUID,
          'Squatter', 'detailing', 'd4d40000-0000-4000-8000-000000000009');
  PERFORM set_config('t.foreign_parent', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.foreign_parent', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_packages
    (id, provider_id, name, category, parent_package_id)
  VALUES ('d4d40000-0000-4000-8000-0000000000f6', current_setting('t.prov', TRUE)::UUID,
          'Nested', 'detailing', 'd4d40000-0000-4000-8000-000000000002');
  PERFORM set_config('t.nested_addon', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.nested_addon', SQLSTATE, TRUE);
END $$;

-- The main service already has an add-on, so it cannot become one — even
-- under another of the same provider's main services, which passes every other
-- rule. Tier cleared so the add-on shape CHECK is not what refuses it.
DO $$
BEGIN
  UPDATE public.service_packages
     SET parent_package_id = 'd4d40000-0000-4000-8000-000000000003',
         tier = NULL
   WHERE id = 'd4d40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.parent_becomes_addon', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.parent_becomes_addon', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  INSERT INTO public.service_packages (id, provider_id, name, category)
  VALUES ('d4d40000-0000-4000-8000-0000000000f7', current_setting('t.prov', TRUE)::UUID,
          'Old-style Add-on', 'addon');
  PERFORM set_config('t.addon_category_refused', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.addon_category_refused', SQLSTATE, TRUE);
END $$;

-- ── 2. Adjustment and reschedule shapes (as owner) ───────────────────────

INSERT INTO public.bookings
  (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
   service_address, total_amount, deposit_amount, estimated_duration_mins)
VALUES
  ('e4e40000-0000-4000-8000-000000000001',
   'a4a40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'c4c40000-0000-4000-8000-000000000001',
   '[{"id":"d4d40000-0000-4000-8000-000000000001"}]'::JSONB,
   'confirmed', TIMESTAMPTZ '2031-12-01 15:00:00+00', '4 Test St', 255.00, 38.25, 120);

-- A pending adjustment with nothing to approve.
DO $$
BEGIN
  UPDATE public.bookings SET status = 'pending_adjustment_approval'
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.empty_adjustment', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.empty_adjustment', SQLSTATE, TRUE);
END $$;

-- A stale adjustment left on a confirmed row.
DO $$
BEGIN
  UPDATE public.bookings
     SET adjustment_duration_mins = 180, adjustment_total_amount = 300.00
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.stale_adjustment', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.stale_adjustment', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET status = 'pending_adjustment_approval',
         adjustment_duration_mins = 180,
         adjustment_total_amount = 285.00,
         adjustment_line_items = '[{"label":"Heavier soiling than declared","amount_cents":3000}]'::JSONB,
         adjustment_reason = 'Mud throughout the interior'
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.adjustment_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.adjustment_ok', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET adjustment_line_items = '[{"label":"Mud","amount_cents":30.5}]'::JSONB
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.adjustment_fractional', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.adjustment_fractional', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings SET adjustment_duration_mins = 5
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.adjustment_too_short', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.adjustment_too_short', SQLSTATE, TRUE);
END $$;

-- The slot stays held: a second job for the same provider, starting inside the
-- first one, cannot be confirmed while the first waits on its adjustment.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, total_amount, deposit_amount, estimated_duration_mins)
  VALUES ('e4e40000-0000-4000-8000-000000000002',
          'a4a40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
          'c4c40000-0000-4000-8000-000000000001',
          '[{"id":"d4d40000-0000-4000-8000-000000000001"}]'::JSONB,
          'confirmed', TIMESTAMPTZ '2031-12-01 15:30:00+00', '5 Test St', 255.00, 38.25, 60);
  PERFORM set_config('t.slot_held', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.slot_held', SQLSTATE, TRUE);
END $$;

INSERT INTO public.bookings
  (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
   service_address, total_amount, deposit_amount, estimated_duration_mins)
VALUES
  ('e4e40000-0000-4000-8000-000000000003',
   'a4a40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
   'c4c40000-0000-4000-8000-000000000001',
   '[{"id":"d4d40000-0000-4000-8000-000000000001"}]'::JSONB,
   'confirmed', TIMESTAMPTZ '2031-12-05 15:00:00+00', '6 Test St', 255.00, 38.25, 120);

DO $$
BEGIN
  UPDATE public.bookings SET proposed_scheduled_at = TIMESTAMPTZ '2031-12-06 15:00:00+00'
   WHERE id = 'e4e40000-0000-4000-8000-000000000003';
  PERFORM set_config('t.half_proposal', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.half_proposal', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET proposed_scheduled_at = TIMESTAMPTZ '2031-12-06 15:00:00+00',
         reschedule_proposed_by = 'admin'
   WHERE id = 'e4e40000-0000-4000-8000-000000000003';
  PERFORM set_config('t.bad_proposer', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.bad_proposer', SQLSTATE, TRUE);
END $$;

DO $$
BEGIN
  UPDATE public.bookings
     SET proposed_scheduled_at = TIMESTAMPTZ '2031-12-06 15:00:00+00',
         reschedule_proposed_by = 'provider'
   WHERE id = 'e4e40000-0000-4000-8000-000000000003';
  PERFORM set_config('t.proposal_ok', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.proposal_ok', SQLSTATE, TRUE);
END $$;

-- ── 3. As the customer ───────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO
  '{"sub":"a4a40000-0000-4000-8000-000000000001","role":"authenticated"}';

-- A reschedule needs the other party now.
DO $$
BEGIN
  UPDATE public.bookings SET scheduled_at = TIMESTAMPTZ '2031-12-09 15:00:00+00'
   WHERE id = 'e4e40000-0000-4000-8000-000000000003';
  PERFORM set_config('t.client_reschedule', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_reschedule', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_reschedule', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Accepting their own proposal by writing it.
DO $$
BEGIN
  UPDATE public.bookings SET proposed_scheduled_at = NULL, reschedule_proposed_by = NULL
   WHERE id = 'e4e40000-0000-4000-8000-000000000003';
  PERFORM set_config('t.client_proposal', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_proposal', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_proposal', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Approving an adjustment for less than the provider asked.
DO $$
BEGIN
  UPDATE public.bookings SET adjustment_total_amount = 1.00
   WHERE id = 'e4e40000-0000-4000-8000-000000000001';
  PERFORM set_config('t.client_adjustment', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN
    PERFORM set_config('t.client_adjustment', 'BLOCKED', TRUE);
  WHEN OTHERS THEN
    PERFORM set_config('t.client_adjustment', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- Booking the add-on alone.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, requested_window_start, requested_window_end)
  VALUES ('e4e40000-0000-4000-8000-000000000010',
          'a4a40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
          'c4c40000-0000-4000-8000-000000000001',
          '[{"id":"d4d40000-0000-4000-8000-000000000002"}]'::JSONB,
          'pending_provider_quote', TIMESTAMPTZ '2031-12-10 14:00:00+00', '7 Test St',
          TIMESTAMPTZ '2031-12-10 14:00:00+00', TIMESTAMPTZ '2031-12-10 18:00:00+00');
  PERFORM set_config('t.orphan_addon', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.orphan_addon', SQLSTATE, TRUE);
END $$;

-- The add-on with its main service, which is the ordinary case.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, vehicle_id, services, status, scheduled_at,
     service_address, requested_window_start, requested_window_end)
  VALUES ('e4e40000-0000-4000-8000-000000000011',
          'a4a40000-0000-4000-8000-000000000001', current_setting('t.prov', TRUE)::UUID,
          'c4c40000-0000-4000-8000-000000000001',
          '[{"id":"d4d40000-0000-4000-8000-000000000001"},{"id":"d4d40000-0000-4000-8000-000000000002"}]'::JSONB,
          'pending_provider_quote', TIMESTAMPTZ '2031-12-11 14:00:00+00', '8 Test St',
          TIMESTAMPTZ '2031-12-11 14:00:00+00', TIMESTAMPTZ '2031-12-11 18:00:00+00');
  PERFORM set_config('t.addon_with_parent', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('t.addon_with_parent', SQLSTATE || ' ' || SQLERRM, TRUE);
END $$;

SELECT set_config('t.addon_priced',
  COALESCE((SELECT total_amount::TEXT FROM public.bookings
             WHERE id = 'e4e40000-0000-4000-8000-000000000011'), 'missing'), TRUE);

RESET ROLE;

-- ── Assertions ───────────────────────────────────────────────────────────

INSERT INTO _results SELECT 'an add-on attaches to a main service',
  current_setting('t.addon_ok', TRUE) = 'ALLOWED', current_setting('t.addon_ok', TRUE);
INSERT INTO _results SELECT 'an add-on takes its parent''s category',
  current_setting('t.addon_category', TRUE) = 'detailing', current_setting('t.addon_category', TRUE);
INSERT INTO _results SELECT 'an unknown tier is refused',
  current_setting('t.bad_tier', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an inverted duration range is refused',
  current_setting('t.inverted_range', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a one-sided duration range is refused',
  current_setting('t.half_range', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a tiered add-on is refused',
  current_setting('t.tiered_addon', TRUE) = '23514', 'expect 23514';
-- A NULL rival (only one provider in the project) fails the rival insert and
-- then this check with 23503, which is correctly not a pass.
INSERT INTO _results SELECT 'an add-on cannot attach to another provider''s service',
  current_setting('t.foreign_parent', TRUE) = '23514',
  'expect 23514, got ' || COALESCE(current_setting('t.foreign_parent', TRUE), 'nothing');
INSERT INTO _results SELECT 'an add-on cannot attach to an add-on',
  current_setting('t.nested_addon', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a service with add-ons cannot become one',
  current_setting('t.parent_becomes_addon', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'the retired addon category is refused',
  current_setting('t.addon_category_refused', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'no package still carries the addon category',
  NOT EXISTS (SELECT 1 FROM public.service_packages WHERE category = 'addon'),
  'expect none';

INSERT INTO _results SELECT 'pending_adjustment_approval needs an adjustment',
  current_setting('t.empty_adjustment', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an adjustment cannot sit on a confirmed booking',
  current_setting('t.stale_adjustment', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a well-formed adjustment is accepted',
  current_setting('t.adjustment_ok', TRUE) = 'ALLOWED', current_setting('t.adjustment_ok', TRUE);
INSERT INTO _results SELECT 'adjustment line items obey the quote grammar',
  current_setting('t.adjustment_fractional', TRUE) = '22023', 'expect 22023';
INSERT INTO _results SELECT 'an adjustment below 15 minutes is refused',
  current_setting('t.adjustment_too_short', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a job waiting on an adjustment still holds its slot',
  current_setting('t.slot_held', TRUE) = '23P01', 'expect 23P01';
INSERT INTO _results SELECT 'a half-stated reschedule proposal is refused',
  current_setting('t.half_proposal', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a proposal names customer or provider',
  current_setting('t.bad_proposer', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'a well-formed reschedule proposal is accepted',
  current_setting('t.proposal_ok', TRUE) = 'ALLOWED', current_setting('t.proposal_ok', TRUE);

INSERT INTO _results SELECT 'a customer cannot move a confirmed start directly',
  current_setting('t.client_reschedule', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a customer cannot write a reschedule proposal',
  current_setting('t.client_proposal', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'a customer cannot write an adjustment total',
  current_setting('t.client_adjustment', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'an add-on cannot be booked without its main service',
  current_setting('t.orphan_addon', TRUE) = '23514', 'expect 23514';
INSERT INTO _results SELECT 'an add-on books with its main service',
  current_setting('t.addon_with_parent', TRUE) = 'ALLOWED', current_setting('t.addon_with_parent', TRUE);
-- 250 + 40 = 290 subtotal, + FLOOR(290 * 0.02) = 5.80 service fee.
INSERT INTO _results SELECT 'the add-on is priced by the existing trigger',
  current_setting('t.addon_priced', TRUE) = '295.80', current_setting('t.addon_priced', TRUE);

-- The regression guard. GRANT is additive; none of these may ever appear.
INSERT INTO _results
SELECT 'no client grant exists on any new server-only column',
       NOT EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee IN ('anon', 'authenticated')
            AND privilege_type IN ('INSERT', 'UPDATE')
            AND column_name IN ('stripe_setup_intent_id', 'info_request_note',
                                'proposed_scheduled_at', 'reschedule_proposed_by',
                                'adjustment_duration_mins', 'adjustment_line_items',
                                'adjustment_total_amount', 'adjustment_reason')
       ),
       'expect none granted';
INSERT INTO _results
SELECT 'scheduled_at is out of the client UPDATE allowlist',
       NOT EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee IN ('anon', 'authenticated')
            AND privilege_type = 'UPDATE'
            AND column_name = 'scheduled_at'
       ),
       'expect not granted';
INSERT INTO _results
SELECT 'scheduled_at is still in the client INSERT allowlist',
       EXISTS (
         SELECT 1 FROM information_schema.column_privileges
          WHERE table_schema = 'public' AND table_name = 'bookings'
            AND grantee = 'authenticated'
            AND privilege_type = 'INSERT'
            AND column_name = 'scheduled_at'
       ),
       'expect granted';

SELECT step, pass, note FROM _results ORDER BY step;

ROLLBACK;
