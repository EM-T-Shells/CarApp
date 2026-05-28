-- ============================================================
-- CARAPP — DEMO PROVIDERS SEED  (Flow 2.2 — Search for providers)
-- ------------------------------------------------------------
-- Seeds approved provider accounts so the Search tab + results
-- screen have data to render. Inserts paired rows into:
--   1. users               (role = 'provider', email_verified = TRUE)
--   2. provider_profiles   (verification_status = 'approved')
--
-- Coverage is the Northern Virginia / DC Metro area (per
-- CarApp's MVP target market). Mix of DETAILER + MECHANIC,
-- varied avg_gear_rating, total_jobs, kudos_count, and the
-- founding-provider flag so all FiltersSheet permutations
-- (sort by rating, min-rating filter, type filter) have data.
--
-- Safe to run repeatedly: rows are only inserted when the
-- demo email is not already present (users) and the user
-- does not already have a provider_profile.
--
-- Prerequisites:
--   - schema.sql applied
--   - provider_types contains DETAILER and MECHANIC rows
--
-- Run AFTER: service_catalog.sql
-- Run BEFORE: provider_content.sql (which depends on these rows)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Demo provider USER rows
-- ------------------------------------------------------------
WITH provider_user_seed(email, full_name, avatar_url) AS (
  VALUES
    ('marcus.reyes@carapp.demo',     'Marcus Reyes',     NULL),
    ('aisha.carter@carapp.demo',     'Aisha Carter',     NULL),
    ('diego.hernandez@carapp.demo',  'Diego Hernandez',  NULL),
    ('priya.patel@carapp.demo',      'Priya Patel',      NULL),
    ('jordan.brooks@carapp.demo',    'Jordan Brooks',    NULL),
    ('samira.khan@carapp.demo',      'Samira Khan',      NULL),
    ('tyler.nguyen@carapp.demo',     'Tyler Nguyen',     NULL),
    ('wesley.foster@carapp.demo',    'Wesley Foster',    NULL)
)
INSERT INTO users (email, full_name, avatar_url, role, is_verified, email_verified)
SELECT s.email, s.full_name, s.avatar_url, 'provider', TRUE, TRUE
FROM provider_user_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.email = s.email
);

-- ------------------------------------------------------------
-- 2. Demo PROVIDER PROFILE rows
-- ------------------------------------------------------------
WITH provider_seed(
  email, type_name, bio, coverage_area, mile_radius,
  avg_gear_rating, total_jobs, kudos_count, is_founding
) AS (
  VALUES
    -- Detailers ------------------------------------------------
    ('marcus.reyes@carapp.demo',    'DETAILER',
      'Owner of Marcus Mobile Detail. 6+ years of paint correction and ceramic coating experience. I treat every car like it''s my own.',
      'Reston, VA + 15 miles',         15.0, 4.9, 87, 24, TRUE),

    ('aisha.carter@carapp.demo',    'DETAILER',
      'Sparkle Mobile Detailing — interior specialist, pet-hair and odor removal certified. Servicing Arlington and the surrounding NoVA corridor.',
      'Arlington, VA + 12 miles',      12.0, 4.8, 52, 18, FALSE),

    ('diego.hernandez@carapp.demo', 'DETAILER',
      'Diego''s Ceramic Pro. IDA SV-certified ceramic installer. Booking 2–3 weeks out — quality work takes time.',
      'Alexandria, VA + 10 miles',     10.0, 4.6, 31, 12, FALSE),

    ('priya.patel@carapp.demo',     'DETAILER',
      'Crystal Clean Auto — fast, friendly, fully insured. Weekend and after-hours appointments available.',
      'Fairfax, VA + 18 miles',        18.0, 4.7, 64, 19, TRUE),

    -- Mechanics ------------------------------------------------
    ('jordan.brooks@carapp.demo',   'MECHANIC',
      'Brooks Mobile Mechanic — ASE Master Certified. 12 years dealership experience, now bringing the shop to you.',
      'Tysons, VA + 20 miles',         20.0, 4.9, 102, 28, TRUE),

    ('samira.khan@carapp.demo',     'MECHANIC',
      'On-Site Auto Repair. Specializing in brakes, batteries, and pre-purchase inspections. Same-day diagnostics in most cases.',
      'Vienna, VA + 15 miles',         15.0, 4.7, 45, 14, FALSE),

    ('tyler.nguyen@carapp.demo',    'MECHANIC',
      'TN Mobile Wrench — newer to the platform but bringing 8 years of independent shop work. Honest pricing, clear explanations.',
      'Falls Church, VA + 12 miles',   12.0, 4.5, 22,  7, FALSE),

    ('wesley.foster@carapp.demo',   'MECHANIC',
      'Foster Auto Mobile. ASE-certified, fleet experience. Quick turnaround on routine maintenance and emergency battery / jumpstart calls.',
      'Springfield, VA + 18 miles',    18.0, 4.8, 71, 21, TRUE)
)
INSERT INTO provider_profiles (
  user_id, provider_type_id, bio, coverage_area, mile_radius,
  avg_gear_rating, total_jobs, kudos_count, verification_status,
  platform_fee_rate, is_founding_provider, approved_at
)
SELECT
  u.id,
  pt.id,
  s.bio,
  s.coverage_area,
  s.mile_radius,
  s.avg_gear_rating,
  s.total_jobs,
  s.kudos_count,
  'approved',
  CASE WHEN s.is_founding THEN 0.000 ELSE 0.050 END,
  s.is_founding,
  now()
FROM provider_seed s
JOIN users u            ON u.email = s.email
JOIN provider_types pt  ON pt.name = s.type_name
WHERE NOT EXISTS (
  SELECT 1 FROM provider_profiles pp WHERE pp.user_id = u.id
);
