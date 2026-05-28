-- ============================================================
-- CARAPP — PROVIDER CONTENT SEED  (Flow 2.3 — View provider profile)
-- ------------------------------------------------------------
-- Backfills the data needed to render a full provider detail
-- screen against the providers seeded in providers.sql:
--   1. demo customer users     (act as raters / kudos givers)
--   2. service_packages        (per provider, drawn from catalog)
--   3. ratings                 (4 dimensions + review text)
--   4. kudos                   (badge awards)
--
-- The denormalized counters on provider_profiles
-- (avg_gear_rating / total_jobs / kudos_count) are NOT touched
-- here — they were set as a snapshot in providers.sql and are
-- intentionally consistent (not equal) with the rows below,
-- since real production providers will always have far more
-- completed jobs than visible reviews. The seeded ratings /
-- kudos exist to populate the visible review history on the
-- profile screen, not to recompute the aggregates.
--
-- Safe to run repeatedly: each section uses NOT EXISTS guards
-- keyed on stable demo identifiers.
--
-- Prerequisites:
--   - schema.sql applied
--   - service_catalog.sql run
--   - providers.sql run
-- ============================================================

-- ============================================================
-- 1. Demo customer users (used as rating reviewers + kudos givers)
-- ============================================================
WITH customer_seed(email, full_name) AS (
  VALUES
    ('alex.rivera@carapp.demo',  'Alex Rivera'),
    ('casey.morgan@carapp.demo', 'Casey Morgan'),
    ('jamie.lee@carapp.demo',    'Jamie Lee'),
    ('sam.patel@carapp.demo',    'Sam Patel')
)
INSERT INTO users (email, full_name, role, is_verified, email_verified)
SELECT s.email, s.full_name, 'customer', TRUE, TRUE
FROM customer_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.email = s.email
);

-- ============================================================
-- 2. Service packages (one row per provider × catalog item)
-- ============================================================
WITH package_seed(
  provider_email, catalog_name, package_name, description,
  category, base_price, duration_mins, sort_order
) AS (
  VALUES
    -- Marcus Reyes — premium detailer ------------------------------
    ('marcus.reyes@carapp.demo', 'Exterior Wash & Wax',
      'Signature Exterior Wash & Wax',
      'Hand wash, clay-bar decontamination, and 6-month sealant.',
      'detailing', 95.00, 90, 1),
    ('marcus.reyes@carapp.demo', 'Full Detail',
      'Showroom Full Detail',
      'Two-stage paint correction, full interior shampoo, leather conditioning, tire dressing.',
      'detailing', 349.00, 300, 2),
    ('marcus.reyes@carapp.demo', 'Ceramic Coating',
      '2-Year Ceramic Coating',
      'IGL Kenzo coating with prep correction. Comes with care kit.',
      'detailing', 799.00, 480, 3),

    -- Aisha Carter — interior specialist ---------------------------
    ('aisha.carter@carapp.demo', 'Interior Detail',
      'Deep Interior Refresh',
      'Steam clean carpets + seats, air vent detail, full dash and console treatment.',
      'detailing', 159.00, 180, 1),
    ('aisha.carter@carapp.demo', 'Pet Hair Removal',
      'Pet Hair Eviction',
      'Multi-stage extraction for stubborn pet hair. Includes odor neutralizer.',
      'addon', 49.00, 45, 2),
    ('aisha.carter@carapp.demo', 'Odor Removal',
      'Ozone Odor Treatment',
      'Ozone generator session for smoke, pet, or food odors. Safe re-entry in 60 minutes.',
      'addon', 79.00, 90, 3),

    -- Diego Hernandez — ceramic specialist -------------------------
    ('diego.hernandez@carapp.demo', 'Paint Correction',
      'Single-Stage Correction',
      'Removes light swirls and oxidation. Includes paint depth measurement.',
      'detailing', 249.00, 240, 1),
    ('diego.hernandez@carapp.demo', 'Ceramic Coating',
      '5-Year Ceramic Coating',
      'Professional-grade ceramic with full surface decontamination prep.',
      'detailing', 1199.00, 600, 2),
    ('diego.hernandez@carapp.demo', 'Headlight Restoration',
      'Headlight Clarity Restore',
      'Sand, polish, and UV-seal yellowed lenses. Pair price.',
      'detailing', 89.00, 60, 3),

    -- Priya Patel — fast-turn detailer -----------------------------
    ('priya.patel@carapp.demo', 'Express Wash',
      'Quick Shine Express',
      'Hand wash, tire shine, and quick interior wipe-down. 30 minutes.',
      'detailing', 49.00, 30, 1),
    ('priya.patel@carapp.demo', 'Exterior Wash & Wax',
      'Wash + Spray Wax',
      'Two-bucket hand wash with synthetic spray wax topper.',
      'detailing', 79.00, 75, 2),
    ('priya.patel@carapp.demo', 'Engine Bay Cleaning',
      'Engine Bay Refresh',
      'Safe degrease and dress. Photos before/after included.',
      'detailing', 69.00, 60, 3),

    -- Jordan Brooks — ASE Master Mechanic --------------------------
    ('jordan.brooks@carapp.demo', 'Oil Change',
      'Full-Synthetic Oil & Filter',
      'Up to 6 quarts full-synthetic, OEM-grade filter, 27-point inspection.',
      'mechanical', 89.00, 45, 1),
    ('jordan.brooks@carapp.demo', 'Brake Pad Replacement',
      'Front or Rear Brake Pads',
      'Premium ceramic pads, rotor inspection, brake-fluid level top-off. Per axle.',
      'mechanical', 229.00, 90, 2),
    ('jordan.brooks@carapp.demo', 'Diagnostic Scan',
      'OBD-II Diagnostic + Live Data',
      'Full code read with live sensor data review. Includes written summary.',
      'mechanical', 69.00, 45, 3),

    -- Samira Khan — brakes + batteries -----------------------------
    ('samira.khan@carapp.demo', 'Battery Replacement',
      'Battery Swap + Charging-System Check',
      'New battery installation, alternator + starter load test.',
      'mechanical', 199.00, 60, 1),
    ('samira.khan@carapp.demo', 'Battery Test & Jumpstart',
      'Roadside Jumpstart',
      'Onsite jumpstart with battery and charging-system test. No-tow visit.',
      'mechanical', 59.00, 30, 2),
    ('samira.khan@carapp.demo', 'Pre-Purchase Inspection',
      'Used-Car Pre-Purchase Inspection',
      'Comprehensive 60-point inspection with photo report. Done at seller''s location.',
      'mechanical', 159.00, 90, 3),

    -- Tyler Nguyen — routine maintenance ---------------------------
    ('tyler.nguyen@carapp.demo', 'Oil Change',
      'Conventional Oil Change',
      'Up to 5 quarts conventional, standard filter, visual inspection.',
      'mechanical', 59.00, 30, 1),
    ('tyler.nguyen@carapp.demo', 'Tire Rotation',
      'Tire Rotation + Pressure Set',
      'All four rotated to manufacturer pattern with PSI set to door-jamb spec.',
      'mechanical', 35.00, 25, 2),
    ('tyler.nguyen@carapp.demo', 'Wiper Blade Replacement',
      'Wiper Blade Swap',
      'OEM-fit wiper blades installed. Pair price.',
      'mechanical', 39.00, 15, 3),

    -- Wesley Foster — full-service -------------------------------
    ('wesley.foster@carapp.demo', 'Oil Change',
      'High-Mileage Oil Change',
      'High-mileage synthetic blend, premium filter, fluid top-off.',
      'mechanical', 79.00, 45, 1),
    ('wesley.foster@carapp.demo', 'Air Filter Replacement',
      'Engine + Cabin Filter Combo',
      'Both engine and cabin air filters replaced with OE-spec parts.',
      'mechanical', 69.00, 30, 2),
    ('wesley.foster@carapp.demo', 'Spark Plug Replacement',
      'Spark Plug Service (4-cyl)',
      'Iridium plugs installed and torqued to spec. 4-cylinder price.',
      'mechanical', 149.00, 60, 3)
)
INSERT INTO service_packages (
  provider_id, catalog_id, name, description, category,
  base_price, duration_mins, is_active, is_approved, sort_order
)
SELECT
  pp.id,
  sc.id,
  s.package_name,
  s.description,
  s.category,
  s.base_price,
  s.duration_mins,
  TRUE,
  TRUE,
  s.sort_order
FROM package_seed s
JOIN users u             ON u.email = s.provider_email
JOIN provider_profiles pp ON pp.user_id = u.id
JOIN service_catalog sc   ON sc.name = s.catalog_name
WHERE NOT EXISTS (
  SELECT 1
  FROM service_packages existing
  WHERE existing.provider_id = pp.id
    AND existing.name = s.package_name
);

-- ============================================================
-- 3. Ratings (4-dimension gear ratings + review text)
-- ============================================================
-- review_text is the idempotency key per (reviewer, reviewee) pair.
WITH rating_seed(
  provider_email, reviewer_email,
  quality, timeliness, communication, value,
  review_text
) AS (
  VALUES
    -- Marcus Reyes ------------------------------------------------
    ('marcus.reyes@carapp.demo', 'alex.rivera@carapp.demo',
      5, 5, 5, 5,
      'Marcus turned my black sedan into a mirror. Showed up early, walked me through every step. Worth every dollar.'),
    ('marcus.reyes@carapp.demo', 'casey.morgan@carapp.demo',
      5, 5, 4, 5,
      'Ceramic coating job is gorgeous. Booking took a while but the result is unreal.'),
    ('marcus.reyes@carapp.demo', 'jamie.lee@carapp.demo',
      5, 4, 5, 5,
      'Wax sealant lasted through three months of pollen and rain. Will book again.'),
    ('marcus.reyes@carapp.demo', 'sam.patel@carapp.demo',
      5, 5, 5, 4,
      'Pricey but you can tell he obsesses over the details. Glass and trim looked brand new.'),

    -- Aisha Carter ------------------------------------------------
    ('aisha.carter@carapp.demo', 'alex.rivera@carapp.demo',
      5, 5, 5, 5,
      'My golden sheds enough to build another dog. Aisha got every strand out and the car smells like new again.'),
    ('aisha.carter@carapp.demo', 'casey.morgan@carapp.demo',
      5, 4, 5, 5,
      'Ozone treatment fixed a smoke smell I had given up on. Honest and fairly priced.'),
    ('aisha.carter@carapp.demo', 'jamie.lee@carapp.demo',
      4, 5, 5, 5,
      'Interior is spotless. Took a little longer than estimated but communication was great the whole time.'),

    -- Diego Hernandez ---------------------------------------------
    ('diego.hernandez@carapp.demo', 'casey.morgan@carapp.demo',
      5, 4, 5, 5,
      'The paint depth report alone was worth it. You can tell he is a craftsman.'),
    ('diego.hernandez@carapp.demo', 'sam.patel@carapp.demo',
      5, 4, 4, 5,
      'Booking was 3 weeks out but I would wait again. Coating beads water beautifully.'),
    ('diego.hernandez@carapp.demo', 'alex.rivera@carapp.demo',
      4, 5, 5, 4,
      'Headlights look factory-fresh. Took the time to explain UV-seal aftercare.'),

    -- Priya Patel -------------------------------------------------
    ('priya.patel@carapp.demo', 'jamie.lee@carapp.demo',
      5, 5, 5, 5,
      'Saturday morning booking, done in 30 minutes, car looked great. Easy 5 stars.'),
    ('priya.patel@carapp.demo', 'sam.patel@carapp.demo',
      4, 5, 5, 5,
      'Quick and friendly. Engine bay photos before/after were a nice touch.'),
    ('priya.patel@carapp.demo', 'casey.morgan@carapp.demo',
      5, 5, 4, 5,
      'Great value for an express wash. Showed up on time and got it done fast.'),

    -- Jordan Brooks -----------------------------------------------
    ('jordan.brooks@carapp.demo', 'sam.patel@carapp.demo',
      5, 5, 5, 5,
      'Jordan caught a leaking valve cover during my oil change. Saved me from a much bigger repair.'),
    ('jordan.brooks@carapp.demo', 'alex.rivera@carapp.demo',
      5, 5, 5, 4,
      'Brake job came in under quote when he saw the rotors did not need replacing. Honest mechanic.'),
    ('jordan.brooks@carapp.demo', 'jamie.lee@carapp.demo',
      5, 5, 5, 5,
      'Did the OBD scan in my driveway, sent me a written summary by the time he left. Excellent work.'),
    ('jordan.brooks@carapp.demo', 'casey.morgan@carapp.demo',
      5, 4, 5, 5,
      'Very thorough on the 27-point inspection. Showed me everything he checked.'),

    -- Samira Khan -------------------------------------------------
    ('samira.khan@carapp.demo', 'alex.rivera@carapp.demo',
      5, 5, 5, 4,
      'Dead battery in my garage at 6am. Samira was there by 7:30 with a tested replacement. Lifesaver.'),
    ('samira.khan@carapp.demo', 'casey.morgan@carapp.demo',
      4, 5, 5, 5,
      'Pre-purchase inspection caught frame rust the seller did not disclose. Worth it.'),
    ('samira.khan@carapp.demo', 'jamie.lee@carapp.demo',
      5, 4, 5, 5,
      'Quick jumpstart and charging-system check. Clear that the alternator was fine. Honest call.'),

    -- Tyler Nguyen ------------------------------------------------
    ('tyler.nguyen@carapp.demo', 'sam.patel@carapp.demo',
      4, 5, 5, 5,
      'Tyler is newer to the platform but did a solid oil change. Fair pricing.'),
    ('tyler.nguyen@carapp.demo', 'jamie.lee@carapp.demo',
      4, 4, 5, 5,
      'Good rotation and PSI set. Took the time to explain wear patterns on each tire.'),
    ('tyler.nguyen@carapp.demo', 'alex.rivera@carapp.demo',
      5, 4, 4, 5,
      'Honest and straightforward. Quoted the job up front, did not try to upsell.'),

    -- Wesley Foster -----------------------------------------------
    ('wesley.foster@carapp.demo', 'casey.morgan@carapp.demo',
      5, 5, 5, 4,
      'High-mileage oil change on my 180k Camry. Wesley knew exactly what blend it needed.'),
    ('wesley.foster@carapp.demo', 'sam.patel@carapp.demo',
      5, 5, 4, 5,
      'Spark plug job done quickly. Old plugs were in rough shape — engine feels smoother already.'),
    ('wesley.foster@carapp.demo', 'jamie.lee@carapp.demo',
      5, 5, 5, 5,
      'Filter combo was an easy yes. Wesley showed me the old ones — disgusting. Would book again.')
)
INSERT INTO ratings (
  booking_id, reviewer_id, reviewee_id,
  quality_score, timeliness_score, communication_score, value_score,
  overall_score, review_text, dispute_window_end
)
SELECT
  NULL,
  reviewer.id,
  reviewee.id,
  s.quality,
  s.timeliness,
  s.communication,
  s.value,
  -- Weighted composite (equal weight for simplicity in seed data)
  ROUND(((s.quality + s.timeliness + s.communication + s.value)::numeric / 4.0), 2),
  s.review_text,
  now() + INTERVAL '48 hours'
FROM rating_seed s
JOIN users reviewer ON reviewer.email = s.reviewer_email
JOIN users reviewee ON reviewee.email = s.provider_email
WHERE NOT EXISTS (
  SELECT 1
  FROM ratings r
  WHERE r.reviewer_id = reviewer.id
    AND r.reviewee_id = reviewee.id
    AND r.review_text = s.review_text
);

-- ============================================================
-- 4. Kudos badges
-- ============================================================
-- Idempotency key: (giver_id, receiver_id, badge)
WITH kudos_seed(provider_email, giver_email, badge) AS (
  VALUES
    -- Marcus Reyes
    ('marcus.reyes@carapp.demo',    'alex.rivera@carapp.demo',  'meticulous'),
    ('marcus.reyes@carapp.demo',    'casey.morgan@carapp.demo', 'magic_hands'),
    ('marcus.reyes@carapp.demo',    'jamie.lee@carapp.demo',    'reliable'),
    ('marcus.reyes@carapp.demo',    'sam.patel@carapp.demo',    'meticulous'),

    -- Aisha Carter
    ('aisha.carter@carapp.demo',    'alex.rivera@carapp.demo',  'magic_hands'),
    ('aisha.carter@carapp.demo',    'casey.morgan@carapp.demo', 'communicator'),
    ('aisha.carter@carapp.demo',    'jamie.lee@carapp.demo',    'meticulous'),

    -- Diego Hernandez
    ('diego.hernandez@carapp.demo', 'casey.morgan@carapp.demo', 'meticulous'),
    ('diego.hernandez@carapp.demo', 'sam.patel@carapp.demo',    'magic_hands'),

    -- Priya Patel
    ('priya.patel@carapp.demo',     'jamie.lee@carapp.demo',    'fast_worker'),
    ('priya.patel@carapp.demo',     'sam.patel@carapp.demo',    'great_value'),
    ('priya.patel@carapp.demo',     'casey.morgan@carapp.demo', 'reliable'),

    -- Jordan Brooks
    ('jordan.brooks@carapp.demo',   'sam.patel@carapp.demo',    'meticulous'),
    ('jordan.brooks@carapp.demo',   'alex.rivera@carapp.demo',  'great_value'),
    ('jordan.brooks@carapp.demo',   'jamie.lee@carapp.demo',    'communicator'),
    ('jordan.brooks@carapp.demo',   'casey.morgan@carapp.demo', 'reliable'),

    -- Samira Khan
    ('samira.khan@carapp.demo',     'alex.rivera@carapp.demo',  'fast_worker'),
    ('samira.khan@carapp.demo',     'casey.morgan@carapp.demo', 'meticulous'),
    ('samira.khan@carapp.demo',     'jamie.lee@carapp.demo',    'reliable'),

    -- Tyler Nguyen
    ('tyler.nguyen@carapp.demo',    'sam.patel@carapp.demo',    'great_value'),
    ('tyler.nguyen@carapp.demo',    'jamie.lee@carapp.demo',    'communicator'),

    -- Wesley Foster
    ('wesley.foster@carapp.demo',   'casey.morgan@carapp.demo', 'reliable'),
    ('wesley.foster@carapp.demo',   'sam.patel@carapp.demo',    'fast_worker'),
    ('wesley.foster@carapp.demo',   'jamie.lee@carapp.demo',    'magic_hands')
)
INSERT INTO kudos (booking_id, giver_id, receiver_id, badge)
SELECT
  NULL,
  giver.id,
  receiver.id,
  s.badge
FROM kudos_seed s
JOIN users giver    ON giver.email = s.giver_email
JOIN users receiver ON receiver.email = s.provider_email
WHERE NOT EXISTS (
  SELECT 1
  FROM kudos k
  WHERE k.giver_id = giver.id
    AND k.receiver_id = receiver.id
    AND k.badge = s.badge
);
