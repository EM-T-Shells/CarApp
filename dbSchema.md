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
  first_name    VARCHAR NOT NULL,
  last_name     VARCHAR NOT NULL,
  profile_pic   TEXT,
  is_provider   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
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
