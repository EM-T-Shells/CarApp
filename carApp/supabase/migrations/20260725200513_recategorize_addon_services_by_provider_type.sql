-- Retire the 'addon' service_catalog category. Each add-on already carries a
-- provider_type_id, so fold it into that provider type's primary category:
-- DETAILER add-ons -> 'detailing', MECHANIC add-ons -> 'mechanical'.
-- Idempotent: re-running only affects rows still marked 'addon'.
--
-- Recovered into version control from the remote migration history — this was
-- applied directly to the project on 2026-07-25 and had no file in the repo.

UPDATE service_catalog sc
SET category = 'detailing'
FROM provider_types pt
WHERE sc.provider_type_id = pt.id
  AND sc.category = 'addon'
  AND pt.name = 'DETAILER';

UPDATE service_catalog sc
SET category = 'mechanical'
FROM provider_types pt
WHERE sc.provider_type_id = pt.id
  AND sc.category = 'addon'
  AND pt.name = 'MECHANIC';
