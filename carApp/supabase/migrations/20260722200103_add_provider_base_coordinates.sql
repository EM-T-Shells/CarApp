-- Provider base coordinates for distance-sorted search.
--
-- Recovered into version control from the remote migration history — this was
-- applied directly to the project on 2026-07-22 and had no file in the repo.
-- The columns are already documented in schema.sql and read by the search path
-- (searchProviders sorts by Haversine distance from these).

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS base_lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS base_lng NUMERIC(9,6);

COMMENT ON COLUMN provider_profiles.base_lat IS 'Provider base latitude, geocoded from coverage_area/address. Used for distance-sorted search (Haversine, client-side).';
COMMENT ON COLUMN provider_profiles.base_lng IS 'Provider base longitude, geocoded from coverage_area/address. Used for distance-sorted search (Haversine, client-side).';
