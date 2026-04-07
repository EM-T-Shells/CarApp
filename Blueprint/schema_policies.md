Here's the unified merged schema with SQL and RLS policies:

```sql
-- ============================================================
-- STABL — UNIFIED MERGED SCHEMA
-- ============================================================

-- PROVIDER TYPES (admin managed)
CREATE TABLE provider_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL UNIQUE,
  label       VARCHAR NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- USERS
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE,
  phone              TEXT UNIQUE,
  full_name          TEXT,
  role               VARCHAR NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'provider', 'both')),
  avatar_url         TEXT,
  is_verified        BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

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
  avg_gear_rating     NUMERIC(3,2) DEFAULT 0,
  total_jobs          INT DEFAULT 0,
  kudos_count         INT DEFAULT 0,
  stripe_account_id   TEXT,
  verification_status VARCHAR NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'suspended')),
  platform_fee_rate   NUMERIC(4,3) DEFAULT 0.05,
  is_founding_provider BOOLEAN DEFAULT FALSE,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

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
  status           VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'en_route', 'in_progress', 'completed', 'cancelled')),
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
  scheduled_at     TIMESTAMPTZ NOT NULL,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

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

-- ============================================================
-- RLS — ENABLE ON ALL TABLES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_profiles ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY "users: update own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- VEHICLES
CREATE POLICY "vehicles: read own" ON vehicles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "vehicles: write own" ON vehicles
  FOR ALL USING (auth.uid() = user_id);

-- PROVIDER PROFILES
CREATE POLICY "provider_profiles: read approved" ON provider_profiles
  FOR SELECT USING (verification_status = 'approved');

CREATE POLICY "provider_profiles: write own" ON provider_profiles
  FOR ALL USING (auth.uid() = user_id);

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
```
