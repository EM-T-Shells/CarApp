-- ============================================================
-- CARAPP — UNIFIED MERGED SCHEMA
-- ============================================================

-- btree_gist supplies btree operators (`provider_id WITH =`) inside a GiST
-- index, which is what bookings_no_provider_overlap needs alongside `&&`.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- PROVIDER TYPES (admin managed)
CREATE TABLE provider_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL UNIQUE,
  label       VARCHAR NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- USERS
-- NOTE: the public.users row is inserted by the app at the end of onboarding
-- (insertUser() on the review step), NOT by a trigger on auth.users. Do not
-- add an on_auth_user_created / handle_new_user trigger here — it would create
-- the row at signup time and the auth gate would skip onboarding entirely.
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE,
  phone              TEXT UNIQUE,
  full_name          TEXT,
  role               VARCHAR NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'provider', 'both')),
  avatar_url         TEXT,
  -- Customer mailing address (structured), captured on the onboarding
  -- profile step. Used to match customers with nearby providers.
  -- Added by migration add_user_address_columns.
  address_line1      TEXT,
  address_line2      TEXT,
  city               TEXT,
  state              TEXT,
  postal_code        TEXT,
  is_verified        BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  email_verified     BOOLEAN DEFAULT FALSE,
  phone_verified     BOOLEAN DEFAULT FALSE,
  -- Single-device FCM token (one device per user for MVP). Flow 2.9.
  fcm_token              TEXT,
  fcm_token_platform     VARCHAR CHECK (fcm_token_platform IN ('ios', 'android')),
  fcm_token_updated_at   TIMESTAMPTZ,
  -- Ops/admin flag for the desktop web admin panel (Blocker #9). Seeded per
  -- account via SQL — see Blueprint/external_setup.md. Gated by is_admin() in RLS.
  is_admin           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Public-safe projection of users. The `users` table RLS only allows a user
-- to read their own row (auth.uid() = id), so joins from provider_profiles,
-- bookings, message_threads, and messages cannot read another user's name or
-- avatar. This SECURITY DEFINER view exposes ONLY id/full_name/avatar_url
-- (never email/phone/stripe_customer_id) for all users, so those joins resolve.
-- Data-layer embeds reference it as `users:users_public(...)`.
CREATE OR REPLACE VIEW users_public
  WITH (security_invoker = false) AS
  SELECT id, full_name, avatar_url FROM users;

-- Admin check used by RLS (Blocker #9 admin panel). SECURITY DEFINER so it reads
-- users as the table owner, bypassing users' own RLS — this avoids the recursion
-- an RLS policy on users would hit if it queried users directly.
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM public.users u WHERE u.id = uid), FALSE);
$$;

GRANT SELECT ON users_public TO anon, authenticated;

-- VEHICLES
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  year          VARCHAR NOT NULL,
  make          VARCHAR NOT NULL,
  model         VARCHAR NOT NULL,
  trim          VARCHAR,
  color         VARCHAR,
  license_plate VARCHAR,
  vin           VARCHAR,
  is_primary    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- PROVIDER PROFILES
CREATE TABLE provider_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_type_id    UUID REFERENCES provider_types(id) ON DELETE SET NULL,
  bio                 TEXT,
  coverage_area       TEXT,
  mile_radius         NUMERIC(5,2),
  base_lat            NUMERIC(9,6),          -- geocoded base latitude (from coverage_area/address); powers distance-sorted search
  base_lng            NUMERIC(9,6),          -- geocoded base longitude

  availability        JSONB,                 -- weekly { "mon": true, …, "sun": false }; NULL = not set (Flow 5.2)
  -- Scheduling buffers (20260818000000). Snapshotted onto each booking at
  -- insert, so tuning them never rewrites a job already on the calendar.
  -- Travel time lives in the "after" buffer; there is no routing API in MVP.
  default_buffer_before_mins INT NOT NULL DEFAULT 15 CHECK (default_buffer_before_mins BETWEEN 0 AND 480),
  default_buffer_after_mins  INT NOT NULL DEFAULT 30 CHECK (default_buffer_after_mins BETWEEN 0 AND 480),
  -- Calendar (20260819000000). working_hours supersedes the availability
  -- booleans above, which stay for older clients; both shapes are read by
  -- workingHoursFromJson(). Hours are wall-clock, so `timezone` is what keeps
  -- them from drifting an hour twice a year. trg_validate_provider_schedule
  -- rejects an unknown IANA zone or a malformed window.
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  working_hours       JSONB,                 -- {"mon":[{"start":"08:00","end":"18:00"}],"sat":[]}
  max_jobs_per_day    INT CHECK (max_jobs_per_day IS NULL OR max_jobs_per_day > 0),
  avg_gear_rating     NUMERIC(3,2) DEFAULT 0,
  total_jobs          INT DEFAULT 0,
  kudos_count         INT DEFAULT 0,
  stripe_account_id   TEXT,
  verification_status VARCHAR NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'suspended', 'rejected')),
  platform_fee_rate   NUMERIC(4,3) DEFAULT 0.030,  -- 3% MVP standard rate (Blocker #8)
  is_founding_provider BOOLEAN DEFAULT FALSE,       -- first 100 approved providers (0% fee)
  founding_provider_expires_at TIMESTAMPTZ,         -- founding 0% window ends here; sweep -> 3%
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Provider profile write surface (20260818120000). "provider_profiles: write
-- own" scopes writes to the caller's own row correctly, but RLS cannot express
-- *which columns* — so the owner could write every one of them, including
-- platform_fee_rate (zero out the platform's cut) and verification_status
-- (self-approve past all six vetting steps). Column privileges close that; the
-- policy is unchanged. DELETE is revoked outright: the row is an FK target for
-- bookings, payouts and service packages.
REVOKE INSERT, UPDATE, DELETE ON provider_profiles FROM anon, authenticated;
GRANT INSERT (id, user_id, provider_type_id) ON provider_profiles TO authenticated;
GRANT UPDATE (bio, coverage_area, mile_radius, base_lat, base_lng, availability,
              default_buffer_before_mins, default_buffer_after_mins)
  ON provider_profiles TO authenticated;
GRANT UPDATE (timezone, working_hours, max_jobs_per_day)
  ON provider_profiles TO authenticated;

-- PROVIDER TIME OFF (20260819000000)
-- One-off blocks on a provider's calendar. Advisory in Phase 1 — DayTimeline
-- surfaces the clash, nothing refuses a booking inside one. Contrast
-- bookings_no_provider_overlap, which is reserved for what is genuinely
-- impossible (two jobs at once).
CREATE TABLE provider_time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      TEXT,                          -- provider's private note; do NOT expose to customers
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_time_off_ends_after_start CHECK (ends_at > starts_at),
  blocked_range TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  -- Overlapping blocks are always a double-submit, never a meaningful state.
  CONSTRAINT provider_time_off_no_overlap
    EXCLUDE USING gist (provider_id WITH =, blocked_range WITH &&)
);

CREATE INDEX IF NOT EXISTS idx_provider_time_off_provider_range
  ON provider_time_off USING gist (provider_id, blocked_range);

REVOKE INSERT, UPDATE, DELETE ON provider_time_off FROM anon, authenticated;
GRANT INSERT (id, provider_id, starts_at, ends_at, reason) ON provider_time_off TO authenticated;
GRANT UPDATE (starts_at, ends_at, reason) ON provider_time_off TO authenticated;
GRANT DELETE ON provider_time_off TO authenticated;

-- PROVIDER VETTING
CREATE TABLE provider_vetting (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
  identity_status       VARCHAR NOT NULL DEFAULT 'pending' CHECK (identity_status IN ('pending', 'submitted', 'approved', 'rejected')),
  background_status     VARCHAR NOT NULL DEFAULT 'pending' CHECK (background_status IN ('pending', 'submitted', 'approved', 'rejected')),
  insurance_status      VARCHAR NOT NULL DEFAULT 'pending' CHECK (insurance_status IN ('pending', 'submitted', 'approved', 'rejected')),
  credentials_status    VARCHAR NOT NULL DEFAULT 'pending' CHECK (credentials_status IN ('pending', 'submitted', 'approved', 'rejected')),
  bank_status           VARCHAR NOT NULL DEFAULT 'pending' CHECK (bank_status IN ('pending', 'submitted', 'approved', 'rejected')),
  profile_completeness  INT DEFAULT 0,
  checkr_report_id      TEXT,
  persona_inquiry_id    TEXT,
  rejection_reason      TEXT,
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Auto-create the provider_vetting row whenever a provider_profiles row is
-- inserted. provider_vetting RLS is UPDATE-only (no client INSERT), so this
-- SECURITY DEFINER trigger runs as the table owner to seed the row — clients
-- never insert vetting rows directly, keeping RLS tight. Added for Flow 4.1
-- (provider opt-in). Apply to existing projects as a migration.
CREATE OR REPLACE FUNCTION create_provider_vetting_row()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO provider_vetting (provider_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_provider_vetting ON provider_profiles;
CREATE TRIGGER trg_create_provider_vetting
  AFTER INSERT ON provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_provider_vetting_row();

-- SERVICE CATALOG (admin managed preset list)
CREATE TABLE service_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type_id UUID REFERENCES provider_types(id) ON DELETE SET NULL,
  name             VARCHAR NOT NULL,
  category         VARCHAR NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- SERVICE PACKAGES (provider defined, based on catalog)
CREATE TABLE service_packages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID REFERENCES provider_profiles(id) ON DELETE CASCADE,
  catalog_id   UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  name         VARCHAR NOT NULL,
  description  TEXT,
  category     VARCHAR NOT NULL CHECK (category IN ('detailing', 'mechanical', 'addon')),
  base_price   NUMERIC(10,2),
  duration_mins INT,
  is_active    BOOLEAN DEFAULT TRUE,
  is_custom    BOOLEAN DEFAULT FALSE,
  is_approved  BOOLEAN DEFAULT TRUE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- BOOKINGS
CREATE TABLE bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id      UUID REFERENCES provider_profiles(id) ON DELETE SET NULL,
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  package_id       UUID REFERENCES service_packages(id) ON DELETE SET NULL,
  services         JSONB NOT NULL DEFAULT '[]',        -- snapshot at booking time
  status           VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'pending_provider_approval', 'confirmed', 'en_route', 'in_progress', 'completed', 'cancelled', 'no_show')),
  total_amount     NUMERIC(10,2),
  deposit_amount   NUMERIC(10,2),
  platform_fee     NUMERIC(10,2),
  service_fee      NUMERIC(10,2),
  provider_payout  NUMERIC(10,2),
  service_location POINT,
  service_address  TEXT,
  location_lat     NUMERIC(9,6),
  location_lng     NUMERIC(9,6),
  notes            TEXT,
  deposit_forfeited BOOLEAN DEFAULT FALSE,
  cancellation_fee NUMERIC(10,2),                   -- $15 late-cancel fee (customer) or $25 penalty (provider); NULL if none
  cancelled_by     TEXT CHECK (cancelled_by IN ('customer', 'provider', 'system')), -- who cancelled; 'system' = 2h auto-cancel sweep
  no_show_at       TIMESTAMPTZ,                     -- set when provider marks the job a no-show
  approval_expires_at TIMESTAMPTZ,                  -- 2-hour provider-accept deadline (set on deposit success)
  confirmed_at     TIMESTAMPTZ,                     -- when the provider accepted
  declined_reason  TEXT,                            -- provider's reason on decline
  scheduled_at     TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,

  -- Duration (20260817000000). estimated_duration_mins is what the provider
  -- commits to; the client cannot write it — trg_derive_booking_amounts sums it
  -- from service_packages. actual_duration_mins is stamped on completion by
  -- trg_stamp_actual_duration and feeds calibration.
  estimated_duration_mins INT CHECK (estimated_duration_mins IS NULL OR estimated_duration_mins > 0),
  actual_duration_mins    INT CHECK (actual_duration_mins IS NULL OR actual_duration_mins >= 0),
  -- Ready-by time. Keys off started_at once the job begins, so a late start
  -- reports a late finish. NULL without a duration — an ETC equal to the start
  -- would read as "ready immediately".
  estimated_completion_at TIMESTAMPTZ GENERATED ALWAYS AS (
    CASE WHEN estimated_duration_mins IS NULL THEN NULL
         ELSE timezone('UTC', timezone('UTC', COALESCE(started_at, scheduled_at))
                              + make_interval(mins => estimated_duration_mins))
    END
  ) STORED,

  -- Scheduling buffers + occupancy (20260818000000). Buffers are snapshotted
  -- from the provider's defaults by trg_snapshot_booking_buffers; legacy rows
  -- are 0. occupied_range keys off scheduled_at, NOT started_at, so a late
  -- start cannot slide a committed slot into the next job — see the migration.
  buffer_before_mins INT CHECK (buffer_before_mins IS NULL OR buffer_before_mins >= 0),
  buffer_after_mins  INT CHECK (buffer_after_mins IS NULL OR buffer_after_mins >= 0),
  occupied_range   TSTZRANGE GENERATED ALWAYS AS (
    tstzrange(
      timezone('UTC', timezone('UTC', scheduled_at)
                      - make_interval(mins => COALESCE(buffer_before_mins, 0))),
      timezone('UTC', timezone('UTC', scheduled_at)
                      + make_interval(mins => COALESCE(estimated_duration_mins, 0)
                                              + COALESCE(buffer_after_mins, 0))),
      '[)'
    )
  ) STORED,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),

  -- A provider cannot hold two committed bookings whose occupied ranges
  -- overlap (20260818000000). pending / pending_provider_approval are excluded
  -- deliberately: several customers may request the same window and the first
  -- accept wins. Raises 23P01, surfaced as "That time was just taken."
  -- Requires btree_gist for `provider_id WITH =`.
  CONSTRAINT bookings_no_provider_overlap EXCLUDE USING gist (
    provider_id WITH =,
    occupied_range WITH &&
  ) WHERE (status IN ('confirmed', 'en_route', 'in_progress'))
);

-- Booking write surface (20260817120000 / 20260817140000). RLS has no column
-- granularity, so the client's vocabulary is fixed by column privileges and
-- two SECURITY INVOKER triggers, both of which live in those migrations:
--   trg_derive_booking_amounts        prices every client insert server-side
--   trg_enforce_booking_status_transition  pins clients to three transitions
--   trg_snapshot_booking_buffers      copies the provider's buffers onto a row
--   trg_stamp_actual_duration         stamps actual_duration_mins on completion
-- The client can state who/what/when/where and never an amount or a buffer.
REVOKE INSERT, UPDATE ON bookings FROM anon, authenticated;
GRANT INSERT (id, customer_id, provider_id, vehicle_id, package_id, services,
              status, scheduled_at, service_address, location_lat, location_lng,
              notes) ON bookings TO authenticated;
GRANT UPDATE (scheduled_at, status, started_at) ON bookings TO authenticated;

-- Auto-cancel sweep (expire_pending_approvals) scans expired approvals; index the hot path.
CREATE INDEX IF NOT EXISTS idx_bookings_pending_approval_expiry
  ON bookings (approval_expires_at)
  WHERE status = 'pending_provider_approval';

-- BOOKING PHOTOS
CREATE TABLE booking_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID REFERENCES bookings(id) ON DELETE CASCADE,
  photo_type   VARCHAR NOT NULL CHECK (photo_type IN ('before', 'after')),
  storage_url  TEXT NOT NULL,              -- Supabase Storage, not S3
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- PAYMENTS
CREATE TABLE payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_payment_intent_id  TEXT UNIQUE,
  payment_type              VARCHAR NOT NULL CHECK (payment_type IN ('deposit', 'balance', 'refund')),
  amount                    NUMERIC(10,2),
  status                    VARCHAR NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  processed_at              TIMESTAMPTZ DEFAULT now()
);

-- PAYOUTS
CREATE TABLE payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id        UUID REFERENCES provider_profiles(id) ON DELETE SET NULL,
  booking_id         UUID REFERENCES bookings(id) ON DELETE SET NULL,
  stripe_transfer_id TEXT UNIQUE,
  amount             NUMERIC(10,2),
  status             VARCHAR NOT NULL CHECK (status IN ('pending', 'paid', 'failed')),
  paid_at            TIMESTAMPTZ
);

-- RATINGS
CREATE TABLE ratings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           UUID REFERENCES bookings(id) ON DELETE SET NULL,
  reviewer_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewee_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  quality_score        INT CHECK (quality_score BETWEEN 1 AND 5),
  timeliness_score     INT CHECK (timeliness_score BETWEEN 1 AND 5),
  communication_score  INT CHECK (communication_score BETWEEN 1 AND 5),
  value_score          INT CHECK (value_score BETWEEN 1 AND 5),
  overall_score        NUMERIC(3,2),
  review_text          VARCHAR(500),
  is_flagged           BOOLEAN DEFAULT FALSE,
  dispute_window_end   TIMESTAMPTZ,              -- 48h after created_at
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- KUDOS
CREATE TABLE kudos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  giver_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  badge       VARCHAR NOT NULL CHECK (badge IN ('meticulous', 'reliable', 'magic_hands', 'great_value', 'fast_worker', 'communicator')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- MESSAGE THREADS
CREATE TABLE message_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES provider_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- MESSAGES
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT,
  image_url  TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  is_flagged BOOLEAN DEFAULT FALSE,
  sent_at    TIMESTAMPTZ DEFAULT now()
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR NOT NULL,
  title      VARCHAR,
  body       TEXT,
  is_read    BOOLEAN DEFAULT FALSE,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PROMOTIONS
CREATE TABLE promotions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT UNIQUE NOT NULL,
  promo_type     VARCHAR NOT NULL CHECK (promo_type IN ('referral', 'gift_card', 'discount')),
  value          NUMERIC(10,2),
  value_type     VARCHAR NOT NULL CHECK (value_type IN ('flat', 'percent')),
  uses_remaining INT,
  issued_to      UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = public code
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- PROMO REDEMPTIONS
CREATE TABLE promo_redemptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id       UUID REFERENCES promotions(id) ON DELETE SET NULL,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  booking_id     UUID REFERENCES bookings(id) ON DELETE SET NULL,
  amount_applied NUMERIC(10,2),
  redeemed_at    TIMESTAMPTZ DEFAULT now()
);

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id            UUID REFERENCES provider_profiles(id) ON DELETE SET NULL,
  status                 VARCHAR NOT NULL CHECK (status IN ('active', 'paused', 'cancelled')),
  frequency              VARCHAR CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  services               JSONB NOT NULL DEFAULT '[]',
  discount_rate          NUMERIC(4,3) DEFAULT 0.05,
  stripe_subscription_id TEXT,
  next_scheduled_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- PROVIDER LOCATION CACHE (last known position; live GPS in Redis)
CREATE TABLE provider_location_cache (
  provider_id  UUID PRIMARY KEY REFERENCES provider_profiles(id) ON DELETE CASCADE,
  latitude     NUMERIC(9,6) NOT NULL,
  longitude    NUMERIC(9,6) NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SEEDS
-- ============================================================

INSERT INTO provider_types (name, label) VALUES
  ('DETAILER', 'Car Detailer'),
  ('MECHANIC', 'Mechanic');

-- Service catalog — curated MVP list of mobile detailing and mechanic
-- offerings. Mirrors carApp/supabase/seeds/service_catalog.sql; update
-- both when adding new services. Inserted here so a fresh DB created
-- from this file alone has a populated catalog.
WITH seed_data(name, category, type_name) AS (
  VALUES
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
LEFT JOIN provider_types pt ON pt.name = s.type_name;

-- ============================================================
-- RLS — ENABLE ON ALL TABLES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_vetting ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_location_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- USERS
CREATE POLICY "users: read own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users: insert own" ON users
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "users: update own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins (web admin panel, Blocker #9) can read every user row to show provider
-- name/email in the vetting queue. Writes still go through the Edge Function.
CREATE POLICY "users: admin read all" ON users
  FOR SELECT USING (public.is_admin(auth.uid()));

-- VEHICLES
CREATE POLICY "vehicles: read own" ON vehicles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "vehicles: write own" ON vehicles
  FOR ALL USING (auth.uid() = user_id);

-- PROVIDER PROFILES
CREATE POLICY "provider_profiles: read own" ON provider_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "provider_profiles: read approved" ON provider_profiles
  FOR SELECT USING (verification_status = 'approved');

CREATE POLICY "provider_profiles: write own" ON provider_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Time off is provider-only for now. The customer-facing availability query
-- (getAvailableWindows) arrives with ArrivalWindowPicker in Phase 3 and needs
-- its own read path — one that does NOT expose `reason`.
CREATE POLICY "provider_time_off: manage own" ON provider_time_off
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM provider_profiles pp
       WHERE pp.id = provider_time_off.provider_id
         AND pp.user_id = auth.uid()
    )
  );

-- Admins read every provider (any verification_status) for the vetting queue.
CREATE POLICY "provider_profiles: admin read all" ON provider_profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

-- PROVIDER VETTING
-- Only the provider and admins (service role) can read vetting records
CREATE POLICY "provider_vetting: read own" ON provider_vetting
  FOR SELECT USING (
    auth.uid() = (
      SELECT user_id FROM provider_profiles WHERE id = provider_id
    )
  );

CREATE POLICY "provider_vetting: write own" ON provider_vetting
  FOR UPDATE USING (
    auth.uid() = (
      SELECT user_id FROM provider_profiles WHERE id = provider_id
    )
  );

-- Admins read every vetting record for the panel's provider-detail view.
CREATE POLICY "provider_vetting: admin read all" ON provider_vetting
  FOR SELECT USING (public.is_admin(auth.uid()));

-- PROVIDER TYPES
CREATE POLICY "provider_types: read active" ON provider_types
  FOR SELECT USING (is_active = TRUE);

-- SERVICE CATALOG
CREATE POLICY "service_catalog: read active" ON service_catalog
  FOR SELECT USING (is_active = TRUE);

-- SERVICE PACKAGES
CREATE POLICY "service_packages: read public" ON service_packages
  FOR SELECT USING (is_active = TRUE AND is_approved = TRUE);

CREATE POLICY "service_packages: write own" ON service_packages
  FOR ALL USING (
    auth.uid() = (
      SELECT user_id FROM provider_profiles WHERE id = provider_id
    )
  );

-- BOOKINGS
CREATE POLICY "bookings: read own" ON bookings
  FOR SELECT USING (
    auth.uid() = customer_id OR
    auth.uid() = (SELECT user_id FROM provider_profiles WHERE id = provider_id)
  );

CREATE POLICY "bookings: customer insert" ON bookings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "bookings: update own" ON bookings
  FOR UPDATE USING (
    auth.uid() = customer_id OR
    auth.uid() = (SELECT user_id FROM provider_profiles WHERE id = provider_id)
  );

-- BOOKING PHOTOS
CREATE POLICY "booking_photos: read participants" ON booking_photos
  FOR SELECT USING (
    auth.uid() = (SELECT customer_id FROM bookings WHERE id = booking_id) OR
    auth.uid() = (
      SELECT pp.user_id FROM provider_profiles pp
      JOIN bookings b ON b.provider_id = pp.id
      WHERE b.id = booking_id
    )
  );

CREATE POLICY "booking_photos: provider insert" ON booking_photos
  FOR INSERT WITH CHECK (
    auth.uid() = (
      SELECT pp.user_id FROM provider_profiles pp
      JOIN bookings b ON b.provider_id = pp.id
      WHERE b.id = booking_id
    )
  );

-- PAYMENTS
CREATE POLICY "payments: read own" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- PAYOUTS
CREATE POLICY "payouts: read own" ON payouts
  FOR SELECT USING (
    auth.uid() = (SELECT user_id FROM provider_profiles WHERE id = provider_id)
  );

-- RATINGS
CREATE POLICY "ratings: read public" ON ratings
  FOR SELECT USING (TRUE);

CREATE POLICY "ratings: insert own" ON ratings
  FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "ratings: flag own" ON ratings
  FOR UPDATE USING (auth.uid() = reviewer_id OR auth.uid() = reviewee_id);

-- KUDOS
CREATE POLICY "kudos: read public" ON kudos
  FOR SELECT USING (TRUE);

CREATE POLICY "kudos: insert own" ON kudos
  FOR INSERT WITH CHECK (auth.uid() = giver_id);

-- MESSAGE THREADS
CREATE POLICY "threads: read own" ON message_threads
  FOR SELECT USING (
    auth.uid() = customer_id OR
    auth.uid() = (SELECT user_id FROM provider_profiles WHERE id = provider_id)
  );

-- MESSAGES
CREATE POLICY "messages: read own thread" ON messages
  FOR SELECT USING (
    auth.uid() = (
      SELECT customer_id FROM message_threads WHERE id = thread_id
    ) OR
    auth.uid() = (
      SELECT pp.user_id FROM provider_profiles pp
      JOIN message_threads mt ON mt.provider_id = pp.id
      WHERE mt.id = thread_id
    )
  );

CREATE POLICY "messages: insert own" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- NOTIFICATIONS
CREATE POLICY "notifications: read own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications: update own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- PROMOTIONS
-- Public codes readable by all; personal codes readable only by recipient
CREATE POLICY "promotions: read eligible" ON promotions
  FOR SELECT USING (
    issued_to IS NULL OR issued_to = auth.uid()
  );

-- PROMO REDEMPTIONS
CREATE POLICY "promo_redemptions: read own" ON promo_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "promo_redemptions: insert own" ON promo_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- SUBSCRIPTIONS
CREATE POLICY "subscriptions: read own" ON subscriptions
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM provider_profiles WHERE id = provider_id)
  );

CREATE POLICY "subscriptions: write own" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- PROVIDER LOCATION CACHE
-- Customers with an active booking can read their provider's location
-- Providers can update their own location
CREATE POLICY "location_cache: read active booking" ON provider_location_cache
  FOR SELECT USING (
    auth.uid() = (
      SELECT customer_id FROM bookings
      WHERE provider_id = provider_location_cache.provider_id
      AND status IN ('en_route', 'in_progress')
      LIMIT 1
    )
  );

CREATE POLICY "location_cache: provider update own" ON provider_location_cache
  FOR ALL USING (
    auth.uid() = (
      SELECT user_id FROM provider_profiles WHERE id = provider_id
    )
  );

-- ============================================================================
-- STORAGE BUCKETS + POLICIES
-- Mirrors migration 20260713000000_storage_buckets.sql. Three buckets back the
-- upload paths in src/lib/supabase/storage.ts. All uploads are constrained to
-- image mime types (jpeg/png/webp) and 10 MB at the bucket level.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars',           'avatars',           true,  10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('booking-photos',    'booking-photos',    false, 10485760, ARRAY['image/jpeg','image/png','image/webp']),
  ('vetting-documents', 'vetting-documents', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- AVATARS — public read; a user writes only their own `{userId}.{ext}` object.
CREATE POLICY "avatars: public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '.%');

CREATE POLICY "avatars: owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '.%')
  WITH CHECK (bucket_id = 'avatars' AND name LIKE auth.uid()::text || '.%');

-- BOOKING-PHOTOS — participants only. First path segment is the booking id; a
-- participant is the booking's customer or the user behind its provider_profile.
CREATE POLICY "booking-photos: participant read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'booking-photos' AND EXISTS (
      SELECT 1 FROM bookings b
      LEFT JOIN provider_profiles p ON p.id = b.provider_id
      WHERE b.id::text = (storage.foldername(name))[1]
        AND (b.customer_id = auth.uid() OR p.user_id = auth.uid())
    )
  );

CREATE POLICY "booking-photos: participant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booking-photos' AND EXISTS (
      SELECT 1 FROM bookings b
      LEFT JOIN provider_profiles p ON p.id = b.provider_id
      WHERE b.id::text = (storage.foldername(name))[1]
        AND (b.customer_id = auth.uid() OR p.user_id = auth.uid())
    )
  );

-- VETTING-DOCUMENTS — a provider may INSERT only under their own `{userId}/`
-- folder. No SELECT policy: reads are service-role only (admin-review-provider).
CREATE POLICY "vetting-documents: owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vetting-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
