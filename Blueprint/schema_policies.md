DB Schema, Policies and Triggers
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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    VARCHAR,
  last_name     VARCHAR,
  profile_pic   TEXT,
  is_provider   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
  stripe_customer_id TEXT,
);

-- USER INFORMATION
CREATE TABLE user_information (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  address     VARCHAR,
  city        VARCHAR,
  state       VARCHAR,
  zip_code    VARCHAR,
  latitude    NUMERIC(9,6),
  longitude   NUMERIC(9,6)
);

-- USER CAR INFORMATION
CREATE TABLE user_car_information (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  make      VARCHAR NOT NULL,
  model     VARCHAR NOT NULL,
  year      INT NOT NULL,
  vin       VARCHAR
);

-- PROVIDERS
CREATE TABLE providers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_type_id UUID REFERENCES provider_types(id) ON DELETE SET NULL,
  rating           NUMERIC(3,2) DEFAULT 0,
  mile_radius      NUMERIC(5,2),
  bio              TEXT,
  is_approved      BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now()
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

-- PROVIDER SERVICES
CREATE TABLE provider_services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID REFERENCES providers(id) ON DELETE CASCADE,
  catalog_id    UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  name          VARCHAR NOT NULL,
  category      VARCHAR,
  description   TEXT,
  price         NUMERIC(10,2),
  duration_mins INT,
  is_active     BOOLEAN DEFAULT TRUE,
  is_custom     BOOLEAN DEFAULT FALSE,
  is_approved   BOOLEAN DEFAULT TRUE,
  sort_order    INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- APPOINTMENTS
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID REFERENCES providers(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  car_id            UUID REFERENCES user_car_information(id) ON DELETE SET NULL,
  services          JSONB NOT NULL DEFAULT '[]',
  status            VARCHAR NOT NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  location_address  VARCHAR,
  location_lat      NUMERIC(9,6),
  location_lng      NUMERIC(9,6),
  deposit_amount    NUMERIC(10,2),
  total_estimate    NUMERIC(10,2),
  stripe_payment_id TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
  deposited_forfeited BOOLEAN DEFAULT FALSE,
);

-- REVIEWS
CREATE TABLE reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    UUID REFERENCES providers(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  rating         NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title          VARCHAR,
  description    TEXT,
  images         TEXT[],
  kudos_points   INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- MESSAGE THREADS
CREATE TABLE message_threads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id    UUID REFERENCES providers(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- MESSAGES
CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT,
  image_url  TEXT,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
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

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id            UUID REFERENCES providers(id) ON DELETE SET NULL,
  status                 VARCHAR NOT NULL,
  frequency              VARCHAR,
  services               JSONB NOT NULL DEFAULT '[]',
  stripe_subscription_id TEXT,
  next_scheduled_at      TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- SEED: initial provider types
INSERT INTO provider_types (name, label) VALUES
  ('DETAILER', 'Car Detailer'),
  ('MECHANIC', 'Mechanic');


Policies 

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_car_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;


-- USERS
-- Users can only read and update their own row
CREATE POLICY "users: read own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users: update own" ON users
  FOR UPDATE USING (auth.uid() = id);


-- USER INFORMATION
CREATE POLICY "user_information: read own" ON user_information
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_information: write own" ON user_information
  FOR ALL USING (auth.uid() = user_id);


-- USER CAR INFORMATION
CREATE POLICY "cars: read own" ON user_car_information
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cars: write own" ON user_car_information
  FOR ALL USING (auth.uid() = user_id);


-- PROVIDERS
-- Anyone can read approved providers (for search/browse) [1]
-- Only the provider themselves can update their own profile
CREATE POLICY "providers: read approved" ON providers
  FOR SELECT USING (is_approved = TRUE);

CREATE POLICY "providers: write own" ON providers
  FOR ALL USING (auth.uid() = user_id);


-- PROVIDER TYPES
-- Anyone can read active provider types (needed for onboarding UI)
-- No user can write — admin only via service role
CREATE POLICY "provider_types: read active" ON provider_types
  FOR SELECT USING (is_active = TRUE);


-- SERVICE CATALOG
-- Anyone can read active catalog items (needed for provider onboarding)
-- No user can write — admin only via service role
CREATE POLICY "service_catalog: read active" ON service_catalog
  FOR SELECT USING (is_active = TRUE);


-- PROVIDER SERVICES
-- Anyone can read active, approved services (shown on provider profile) [1]
-- Only the provider can manage their own services
CREATE POLICY "provider_services: read public" ON provider_services
  FOR SELECT USING (
    is_active = TRUE AND is_approved = TRUE
  );

CREATE POLICY "provider_services: write own" ON provider_services
  FOR ALL USING (
    auth.uid() = (
      SELECT user_id FROM providers WHERE id = provider_id
    )
  );


-- APPOINTMENTS
-- Customer can read their own appointments
-- Provider can read appointments assigned to them
-- Both can be done with a single policy
CREATE POLICY "appointments: read own" ON appointments
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM providers WHERE id = provider_id)
  );

CREATE POLICY "appointments: customer insert" ON appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "appointments: update own" ON appointments
  FOR UPDATE USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM providers WHERE id = provider_id)
  );


-- REVIEWS
-- Anyone can read reviews (shown on provider profiles) [1]
-- Only the customer who had the appointment can write a review
CREATE POLICY "reviews: read public" ON reviews
  FOR SELECT USING (TRUE);

CREATE POLICY "reviews: insert own" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- MESSAGE THREADS
-- Only the customer or provider in the thread can read it [1]
CREATE POLICY "threads: read own" ON message_threads
  FOR SELECT USING (
    auth.uid() = customer_id OR
    auth.uid() = (SELECT user_id FROM providers WHERE id = provider_id)
  );


-- MESSAGES
-- Only participants in the thread can read or send messages [1]
CREATE POLICY "messages: read own thread" ON messages
  FOR SELECT USING (
    auth.uid() = (
      SELECT customer_id FROM message_threads WHERE id = thread_id
    ) OR
    auth.uid() = (
      SELECT user_id FROM providers p
      JOIN message_threads mt ON mt.provider_id = p.id
      WHERE mt.id = thread_id
    )
  );

CREATE POLICY "messages: insert own" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);


-- NOTIFICATIONS
-- Users can only read their own notifications [1]
CREATE POLICY "notifications: read own" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications: update own" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);


-- SUBSCRIPTIONS
CREATE POLICY "subscriptions: read own" ON subscriptions
  FOR SELECT USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM providers WHERE id = provider_id)
  );

CREATE POLICY "subscriptions: write own" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);
