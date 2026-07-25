-- ============================================================
-- CARAPP — SERVICE CATALOG SEED
-- ------------------------------------------------------------
-- Curated MVP catalog of mobile detailing and mechanic services.
-- Safe to run repeatedly: rows are only inserted when an exact
-- (name, category, provider_type_id) match is not already present.
--
-- Run this file in the Supabase SQL editor (or via psql) once the
-- schema in carApp/supabase/schema.sql has been applied and
-- provider_types has been seeded with the DETAILER and MECHANIC rows.
-- ============================================================

WITH seed_data(name, category, type_name) AS (
  VALUES
    -- Detailer — detailing
    ('Express Wash',            'detailing',  'DETAILER'),
    ('Exterior Wash & Wax',     'detailing',  'DETAILER'),
    ('Interior Detail',         'detailing',  'DETAILER'),
    ('Full Detail',             'detailing',  'DETAILER'),
    ('Paint Correction',        'detailing',  'DETAILER'),
    ('Ceramic Coating',         'detailing',  'DETAILER'),
    ('Headlight Restoration',   'detailing',  'DETAILER'),
    ('Engine Bay Cleaning',     'detailing',  'DETAILER'),
    ('Pet Hair Removal',        'detailing',  'DETAILER'),
    ('Odor Removal',            'detailing',  'DETAILER'),
    ('Leather Conditioning',    'detailing',  'DETAILER'),

    -- Mechanic — mechanical
    ('Oil Change',              'mechanical', 'MECHANIC'),
    ('Tire Rotation',           'mechanical', 'MECHANIC'),
    ('Brake Pad Replacement',   'mechanical', 'MECHANIC'),
    ('Battery Replacement',     'mechanical', 'MECHANIC'),
    ('Battery Test & Jumpstart','mechanical', 'MECHANIC'),
    ('Air Filter Replacement',  'mechanical', 'MECHANIC'),
    ('Cabin Filter Replacement','mechanical', 'MECHANIC'),
    ('Spark Plug Replacement',  'mechanical', 'MECHANIC'),
    ('Diagnostic Scan',         'mechanical', 'MECHANIC'),
    ('Wiper Blade Replacement', 'mechanical', 'MECHANIC'),
    ('Headlight Bulb Replacement','mechanical','MECHANIC'),
    ('Pre-Purchase Inspection', 'mechanical', 'MECHANIC'),
    ('Fluid Top-Up',            'mechanical', 'MECHANIC'),
    ('Tire Pressure Check',     'mechanical', 'MECHANIC')
)
INSERT INTO service_catalog (name, category, provider_type_id, is_active)
SELECT s.name, s.category, pt.id, TRUE
FROM seed_data s
LEFT JOIN provider_types pt ON pt.name = s.type_name
WHERE NOT EXISTS (
  SELECT 1
  FROM service_catalog sc
  WHERE sc.name = s.name
    AND sc.category = s.category
    AND sc.provider_type_id IS NOT DISTINCT FROM pt.id
);
