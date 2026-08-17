-- Pricing / privilege verification for migration
-- 20260817140000_bookings_server_derived_pricing.
--
-- Pure-SQL behavioral test for the booking INSERT hole — the sibling of the
-- UPDATE hole covered by bookings_update_column_guard.test.sql. Everything
-- runs in a transaction that ROLLBACKs, so it never mutates real data.
--
-- Seeds a customer, an approved provider at the standard 3% rate, and two
-- $100.00 packages, then checks:
--
--   * A customer inserting forged amounts gets a hard 42501 — the money
--     columns are not in their INSERT vocabulary at all.
--   * An honest insert is priced from service_packages and reproduces
--     src/utils/money.ts exactly.
--   * A forged services snapshot (real id, fake base_price) is rebuilt from
--     the provider's published prices, so the fake never reaches the row.
--   * Booking another provider's package is refused rather than priced.
--   * service_role still supplies its own figures, which is what the E2E seed
--     script and the Edge Functions rely on.
--
-- Run against the linked project (read-write path, no psql required):
--   supabase db query --linked -f supabase/migrations/__tests__/bookings_server_derived_pricing.test.sql
--
-- Expected: every row's pass = t.

BEGIN;
CREATE TEMP TABLE _results (step TEXT, pass BOOLEAN, note TEXT) ON COMMIT DROP;

-- ── Seed (as owner — RLS bypassed for setup) ────────────────────────────
INSERT INTO public.users (id, email) VALUES
  ('aaaa1111-0000-0000-0000-000000000001', 'price-customer@example.com'),
  ('bbbb2222-0000-0000-0000-000000000002', 'price-provider@example.com'),
  ('cccc3333-0000-0000-0000-000000000003', 'price-rival@example.com');

INSERT INTO public.provider_profiles (id, user_id, verification_status, platform_fee_rate) VALUES
  ('dddd4444-0000-0000-0000-000000000004', 'bbbb2222-0000-0000-0000-000000000002', 'approved', 0.03),
  ('eeee5555-0000-0000-0000-000000000005', 'cccc3333-0000-0000-0000-000000000003', 'approved', 0.03);

-- The Founding Provider Program trigger (migration 20260622140000) enrols the
-- first 100 approved providers at 0%, so it overwrites the rate seeded above.
-- Force it back to the standard 3% *after* enrolment: a zero fee would make
-- the platform_fee assertions below pass trivially, and a zeroed platform cut
-- is exactly the exploit this migration exists to stop.
UPDATE public.provider_profiles
   SET platform_fee_rate = 0.03
 WHERE id IN ('dddd4444-0000-0000-0000-000000000004',
              'eeee5555-0000-0000-0000-000000000005');

INSERT INTO public.service_packages
  (id, provider_id, name, category, base_price, duration_mins, is_active, is_approved)
VALUES
  ('ffff6666-0000-0000-0000-000000000006', 'dddd4444-0000-0000-0000-000000000004',
   'Interior Detail', 'detailing', 100.00, 90, TRUE, TRUE),
  ('ffff7777-0000-0000-0000-000000000007', 'dddd4444-0000-0000-0000-000000000004',
   'Exterior Detail', 'detailing', 100.00, 60, TRUE, TRUE),
  -- Belongs to the rival provider — not bookable from provider dddd4444.
  ('ffff8888-0000-0000-0000-000000000008', 'eeee5555-0000-0000-0000-000000000005',
   'Rival Detail', 'detailing', 100.00, 30, TRUE, TRUE);

-- ── 1. The exploit: a customer naming their own amounts ─────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','aaaa1111-0000-0000-0000-000000000001','role','authenticated')::text, TRUE);

-- The quiet one: a normal-looking total with the platform's cut zeroed out.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services,
     total_amount, platform_fee, provider_payout)
  VALUES
    ('1111aaaa-0000-0000-0000-00000000000a',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days',
     '[{"id":"ffff6666-0000-0000-0000-000000000006"}]'::JSONB,
     204.00, 0.00, 204.00);
  PERFORM set_config('test.forged_fees', 'ALLOWED', TRUE);
EXCEPTION
  WHEN insufficient_privilege THEN PERFORM set_config('test.forged_fees', 'BLOCKED', TRUE);
  WHEN OTHERS THEN PERFORM set_config('test.forged_fees', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 2. The honest insert is priced by the server ────────────────────────
-- Two $100 packages: subtotal 20000c, fee floor(20000*0.02)=400c,
-- total 20400c, deposit floor(20400*0.15)=3060c,
-- platform floor(20000*0.03)=600c, payout 20000-600=19400c.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services)
  VALUES
    ('2222bbbb-0000-0000-0000-00000000000b',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days',
     '[{"id":"ffff6666-0000-0000-0000-000000000006"},
       {"id":"ffff7777-0000-0000-0000-000000000007"}]'::JSONB);
  PERFORM set_config('test.honest', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.honest', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 3. A forged snapshot price is rebuilt, not trusted ──────────────────
-- Real package id, fake base_price and name. The trigger discards everything
-- but the id, so neither the money nor the displayed record can lie.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services)
  VALUES
    ('3333cccc-0000-0000-0000-00000000000c',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days',
     '[{"id":"ffff6666-0000-0000-0000-000000000006","base_price":1,"name":"Free Detail","duration_mins":9999}]'::JSONB);
  PERFORM set_config('test.forged_snapshot', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.forged_snapshot', 'ERR:' || SQLSTATE, TRUE);
END $$;

-- ── 4. Another provider's package is not bookable here ──────────────────
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services)
  VALUES
    ('4444dddd-0000-0000-0000-00000000000d',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days',
     '[{"id":"ffff8888-0000-0000-0000-000000000008"}]'::JSONB);
  PERFORM set_config('test.cross_provider', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.cross_provider', 'BLOCKED:' || SQLSTATE, TRUE);
END $$;

-- An empty basket has no price and must not become a free booking.
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services)
  VALUES
    ('5555eeee-0000-0000-0000-00000000000e',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days', '[]'::JSONB);
  PERFORM set_config('test.empty', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.empty', 'BLOCKED:' || SQLSTATE, TRUE);
END $$;

RESET ROLE;

-- ── 5. service_role still prices its own inserts ────────────────────────
SET LOCAL ROLE service_role;
DO $$
BEGIN
  INSERT INTO public.bookings
    (id, customer_id, provider_id, status, scheduled_at, services,
     total_amount, platform_fee, provider_payout)
  VALUES
    ('6666ffff-0000-0000-0000-00000000000f',
     'aaaa1111-0000-0000-0000-000000000001', 'dddd4444-0000-0000-0000-000000000004',
     'pending', now() + interval '2 days',
     '[{"id":"ffff6666-0000-0000-0000-000000000006"}]'::JSONB,
     42.00, 1.00, 41.00);
  PERFORM set_config('test.service_role', 'ALLOWED', TRUE);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('test.service_role', 'ERR:' || SQLSTATE, TRUE);
END $$;
RESET ROLE;

-- ── Assertions ──────────────────────────────────────────────────────────
INSERT INTO _results SELECT 'customer cannot insert forged amounts',
  current_setting('test.forged_fees', TRUE) = 'BLOCKED', 'expect BLOCKED';
INSERT INTO _results SELECT 'forged-amount booking was not created',
  NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = '1111aaaa-0000-0000-0000-00000000000a'),
  'expect no row';

INSERT INTO _results SELECT 'honest insert succeeds',
  current_setting('test.honest', TRUE) = 'ALLOWED', 'expect ALLOWED';
INSERT INTO _results SELECT 'server priced total_amount = 204.00',
  (SELECT total_amount FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 204.00,
  'subtotal 200 + 2% fee';
INSERT INTO _results SELECT 'server priced service_fee = 4.00',
  (SELECT service_fee FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 4.00,
  'floor(20000 * 0.02)';
INSERT INTO _results SELECT 'server priced deposit_amount = 30.60',
  (SELECT deposit_amount FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 30.60,
  'floor(20400 * 0.15)';
INSERT INTO _results SELECT 'server priced platform_fee = 6.00',
  (SELECT platform_fee FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 6.00,
  'floor(20000 * 0.03)';
INSERT INTO _results SELECT 'server priced provider_payout = 194.00',
  (SELECT provider_payout FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 194.00,
  'subtotal - platform fee';
INSERT INTO _results SELECT 'server derived duration = 150 mins',
  (SELECT estimated_duration_mins FROM public.bookings WHERE id='2222bbbb-0000-0000-0000-00000000000b') = 150,
  '90 + 60';

INSERT INTO _results SELECT 'forged snapshot price was rebuilt',
  (SELECT total_amount FROM public.bookings WHERE id='3333cccc-0000-0000-0000-00000000000c') = 102.00,
  'expect real $100 + 2%, not $0.01';
INSERT INTO _results SELECT 'forged snapshot name was rebuilt',
  (SELECT services -> 0 ->> 'name' FROM public.bookings WHERE id='3333cccc-0000-0000-0000-00000000000c')
    = 'Interior Detail', 'expect the published name';
INSERT INTO _results SELECT 'forged snapshot duration was rebuilt',
  (SELECT estimated_duration_mins FROM public.bookings WHERE id='3333cccc-0000-0000-0000-00000000000c') = 90,
  'expect 90, not 9999';

INSERT INTO _results SELECT 'cross-provider package is refused',
  current_setting('test.cross_provider', TRUE) LIKE 'BLOCKED:%', 'expect BLOCKED';
INSERT INTO _results SELECT 'empty basket is refused',
  current_setting('test.empty', TRUE) LIKE 'BLOCKED:%', 'expect BLOCKED';

INSERT INTO _results SELECT 'service_role keeps its own figures',
  current_setting('test.service_role', TRUE) = 'ALLOWED'
  AND (SELECT total_amount FROM public.bookings WHERE id='6666ffff-0000-0000-0000-00000000000f') = 42.00,
  'expect 42.00 untouched';

SELECT step, pass, note FROM _results ORDER BY step;
ROLLBACK;
