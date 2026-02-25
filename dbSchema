-- ENUMS
CREATE TYPE provider_type AS ENUM ('DETAILER', 'MECHANIC');
CREATE TYPE appointment_status AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED');

-- USERS (unchanged from CAI.pdf)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      VARCHAR NOT NULL,
  last_name       VARCHAR NOT NULL,
  profile_pic     TEXT,
  is_provider     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- USER INFORMATION (extended with lat/lng)
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

-- USER CAR INFORMATION (unchanged)
CREATE TABLE user_car_information (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  make      VARCHAR NOT NULL,
  model     VARCHAR NOT NULL,
  year      INT NOT NULL,
  vin       VARCHAR
);

-- PROVIDERS (merged detailer_provider + mechanic_provider)
CREATE TABLE providers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          provider_type NOT NULL,
  services      JSONB NOT NULL DEFAULT '[]',
  rating        NUMERIC(3,2) DEFAULT 0,
  mile_radius   NUMERIC(5,2),
  bio           TEXT,
  is_approved   BOOLEAN DEFAULT FALSE,  -- for admin approval flow
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- APPOINTMENTS (merged detailer + mechanic appointment tables)
CREATE TABLE appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID REFERENCES providers(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  car_id            UUID REFERENCES user_car_information(id) ON DELETE SET NULL,
  services          JSONB NOT NULL DEFAULT '[]',
  status            appointment_status DEFAULT 'REQUESTED',
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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   UUID REFERENCES providers(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  rating        NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title         VARCHAR,
  description   TEXT,
  images        TEXT[],  -- array of storage URLs
  kudos_points  INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- MESSAGES / THREADS
CREATE TABLE message_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT,
  image_url   TEXT,   -- images only, no video per spec [2]
  is_flagged  BOOLEAN DEFAULT FALSE,  -- for phone/email/payment detection [2]
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR NOT NULL,  -- 'BOOKING_CONFIRMED', 'REMINDER', 'REVIEW_REQUEST', etc.
  title       VARCHAR,
  body        TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  metadata    JSONB,  -- flexible payload (e.g. appointment_id)
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id           UUID REFERENCES providers(id) ON DELETE SET NULL,
  status                subscription_status DEFAULT 'ACTIVE',
  frequency             VARCHAR,  -- 'WEEKLY', 'MONTHLY', etc.
  services              JSONB NOT NULL DEFAULT '[]',
  stripe_subscription_id TEXT,
  next_scheduled_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now()
);
