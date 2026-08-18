-- 20260820000000_intake_vehicle_size_and_modifiers.sql
--
-- Phase 2 of the quote-first redesign (Blueprint/quote_first_booking.md §8).
-- Everything a provider needs in order to quote, gathered before they are asked
-- to. Phase 3 turns it into an actual quote; this migration only makes the
-- inputs exist and be trustworthy.
--
--   1. vehicles.size_class          — the customer's declared vehicle class
--   2. bookings.vehicle_size_class  — snapshot of it, at booking time
--      bookings.condition_answers   — the three condition questions
--      bookings.suggested_duration_mins — what the engine proposed
--   3. service_duration_modifiers   — provider-owned deltas driving 2
--   4. booking_photos 'intake'      — pre-booking photos, customer-insertable
--
-- The through-line is §1's observation that a booking could not express a
-- variable-length job. Size and condition are the two facts that make a job
-- variable, and until now neither was recorded anywhere.
--
-- Idempotent — safe to re-run.

-- ── 1. Vehicle size class ────────────────────────────────────────────────
-- On the vehicle rather than only on the booking, because it is a property of
-- the car and asking again on every booking would be the third time the
-- customer has typed the same thing. The booking snapshots it (see 2).
--
-- Nullable: 26 existing vehicles predate this and there is no honest way to
-- infer a class from year/make/model without a vehicle database. NULL means
-- "not declared", which the suggestion engine treats as no modifier rather than
-- as 'sedan' — guessing would quietly under-quote every truck.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vehicles'
       AND column_name = 'size_class'
  ) THEN
    ALTER TABLE public.vehicles ADD COLUMN size_class VARCHAR;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_size_class_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_size_class_check
      CHECK (size_class IS NULL OR size_class IN
        ('compact', 'sedan', 'suv', 'truck', 'van', 'oversized'));
  END IF;
END $$;

COMMENT ON COLUMN public.vehicles.size_class IS
  'Customer-declared size class. NULL means not declared; the suggestion engine applies no size modifier rather than assuming a default.';

-- ── 2. Booking-time snapshot and condition answers ───────────────────────
-- vehicle_size_class duplicates vehicles.size_class on purpose. A vehicle can
-- be edited or deleted after the job (the FK is ON DELETE SET NULL), and the
-- duration was quoted against the car as described at the time. Reading it back
-- through the live vehicle row would silently rewrite the basis of a completed
-- job — the same reasoning that makes bookings.services a snapshot rather than
-- a join.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vehicle_size_class VARCHAR;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS condition_answers JSONB;

-- What the engine proposed, kept alongside estimated_duration_mins (what was
-- committed) and actual_duration_mins (what it took). Three columns because
-- calibration in Phase 4 needs all three: a suggestion the provider always
-- overrides is a broken suggestion, and without storing it there is no way to
-- know.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS suggested_duration_mins INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_vehicle_size_class_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_vehicle_size_class_check
      CHECK (vehicle_size_class IS NULL OR vehicle_size_class IN
        ('compact', 'sedan', 'suv', 'truck', 'van', 'oversized'));
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.vehicle_size_class IS
  'Size class as declared when this booking was made. Snapshot, not a join — the vehicle row can change or vanish afterwards.';
COMMENT ON COLUMN public.bookings.condition_answers IS
  'The three condition questions: {"soil_level":"moderate","pets":"none","stains":"some"}. Validated by trg_validate_booking_intake.';
COMMENT ON COLUMN public.bookings.suggested_duration_mins IS
  'What the duration engine proposed, before the provider committed. Server-derived; never client-supplied. Calibration input for Phase 4.';

-- ── 3. Provider duration modifiers ───────────────────────────────────────
-- The knobs behind the suggestion. Provider-owned because a two-person crew
-- and a solo detailer disagree about what an SUV costs them, and a platform
-- -wide constant would be wrong for both.
CREATE TABLE IF NOT EXISTS public.service_duration_modifiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  factor_type  TEXT NOT NULL,
  factor_value TEXT NOT NULL,
  delta_mins   INT NOT NULL DEFAULT 0,
  -- Stored, and deliberately NOT applied to any money column by this migration.
  -- bookings' prices are derived by derive_booking_amounts from
  -- service_packages alone; wiring a provider-writable table into that path
  -- would hand the client an indirect route to the totals it was denied in
  -- 20260817140000. Phase 3 surfaces this as an itemised surcharge the customer
  -- approves, through an Edge Function.
  delta_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT service_duration_modifiers_factor CHECK (
    (factor_type = 'size_class' AND factor_value IN
       ('compact', 'sedan', 'suv', 'truck', 'van', 'oversized'))
    OR (factor_type = 'soil_level' AND factor_value IN
       ('light', 'moderate', 'heavy'))
    OR (factor_type = 'pets' AND factor_value IN
       ('none', 'occasional', 'frequent'))
    OR (factor_type = 'stains' AND factor_value IN
       ('none', 'some', 'heavy'))
  ),
  -- A negative delta is legitimate: a compact really is quicker than the base
  -- estimate. The floor stops a modifier set from driving a job to zero
  -- minutes, which the suggestion engine would then render as "no duration".
  CONSTRAINT service_duration_modifiers_delta_mins_check
    CHECK (delta_mins BETWEEN -240 AND 480),
  CONSTRAINT service_duration_modifiers_delta_price_check
    CHECK (delta_price BETWEEN -500 AND 2000),
  -- One delta per factor value per provider. Two rows for 'suv' would make the
  -- suggestion depend on row order.
  CONSTRAINT service_duration_modifiers_unique
    UNIQUE (provider_id, factor_type, factor_value)
);

COMMENT ON TABLE public.service_duration_modifiers IS
  'Per-provider duration/price deltas by vehicle size and condition. Drives the suggested duration only; delta_price is not applied to any booking amount in Phase 2.';

CREATE INDEX IF NOT EXISTS idx_service_duration_modifiers_provider
  ON public.service_duration_modifiers (provider_id);

ALTER TABLE public.service_duration_modifiers ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in, not just the owner: the customer's booking
-- screen shows the suggested duration before the provider ever sees the
-- request, so the client needs the same numbers the server used. They are not
-- sensitive — they are the provider's own published rate card in another form.
DROP POLICY IF EXISTS "service_duration_modifiers: read" ON public.service_duration_modifiers;
CREATE POLICY "service_duration_modifiers: read" ON public.service_duration_modifiers
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "service_duration_modifiers: write own" ON public.service_duration_modifiers;
CREATE POLICY "service_duration_modifiers: write own" ON public.service_duration_modifiers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.provider_profiles pp
       WHERE pp.id = service_duration_modifiers.provider_id
         AND pp.user_id = auth.uid()
    )
  );

-- Supabase grants ALL on every new public table by default, so a fresh table is
-- wide open at the column level until this runs. Same lesson as 20260818120000.
REVOKE INSERT, UPDATE, DELETE ON public.service_duration_modifiers
  FROM anon, authenticated;
GRANT INSERT (id, provider_id, factor_type, factor_value, delta_mins, delta_price)
  ON public.service_duration_modifiers TO authenticated;
-- provider_id is INSERT-only: re-pointing a modifier at another provider is
-- never an edit, and leaving it out means that fails at the privilege layer
-- rather than depending on the policy staying correct.
GRANT UPDATE (factor_type, factor_value, delta_mins, delta_price)
  ON public.service_duration_modifiers TO authenticated;
GRANT DELETE ON public.service_duration_modifiers TO authenticated;

-- ── 4. Condition answers validation ──────────────────────────────────────
-- A CHECK constraint cannot reject *unknown keys* without enumerating the
-- object, so this is a trigger for the same reason trg_validate_provider_schedule
-- is one. Rejecting unknown keys matters more than it looks: a client that
-- sends {"soilLevel": "heavy"} would otherwise store a value no reader ever
-- looks at, and the job would be quoted as if the question were unanswered.
CREATE OR REPLACE FUNCTION public.validate_booking_intake()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  answer_key   TEXT;
  answer_value TEXT;
BEGIN
  -- On UPDATE, these two columns belong to the customer alone.
  --
  -- The column allowlist cannot express this: it grants a column to a ROLE, and
  -- customer and provider are the same role. enforce_booking_status_transition
  -- does not cover it either — it only guards `status` and `started_at`, so any
  -- other granted column passes straight through for either participant. That
  -- left a provider able to rewrite the declared size and condition, which is
  -- the stated basis of the quote, without the customer seeing it change.
  --
  -- Frozen once the job is committed. After confirmation the numbers have been
  -- agreed, so a correction is a re-quote — spec §7's 'vehicle worse than
  -- declared on arrival' — and that runs through an Edge Function with the
  -- customer's approval, not a silent column write.
  IF TG_OP = 'UPDATE' AND current_user IN ('authenticated', 'anon') THEN
    IF auth.uid() IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'Only the customer can change the declared vehicle size or condition'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status NOT IN ('pending', 'pending_provider_approval') THEN
      RAISE EXCEPTION
        'Vehicle size and condition are fixed once a booking is %; a change is a re-quote',
        OLD.status USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.condition_answers IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.condition_answers) <> 'object' THEN
    RAISE EXCEPTION 'condition_answers must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  FOR answer_key, answer_value IN
    SELECT key, value #>> '{}' FROM jsonb_each(NEW.condition_answers)
  LOOP
    IF answer_key NOT IN ('soil_level', 'pets', 'stains') THEN
      RAISE EXCEPTION 'Unknown condition question: %', answer_key
        USING ERRCODE = '22023';
    END IF;

    IF answer_value IS NULL THEN
      RAISE EXCEPTION 'Condition answer % must be a string', answer_key
        USING ERRCODE = '22023';
    END IF;

    IF (answer_key = 'soil_level'
          AND answer_value NOT IN ('light', 'moderate', 'heavy'))
       OR (answer_key = 'pets'
          AND answer_value NOT IN ('none', 'occasional', 'frequent'))
       OR (answer_key = 'stains'
          AND answer_value NOT IN ('none', 'some', 'heavy'))
    THEN
      RAISE EXCEPTION 'Invalid answer % for condition question %',
        answer_value, answer_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_intake() IS
  'Enforces the condition_answers grammar (including unknown keys, which a CHECK cannot reject without enumerating the object) and reserves both intake columns to the customer while the booking is still uncommitted.';

DROP TRIGGER IF EXISTS trg_validate_booking_condition ON public.bookings;
DROP TRIGGER IF EXISTS trg_validate_booking_intake ON public.bookings;
CREATE TRIGGER trg_validate_booking_intake
  BEFORE INSERT OR UPDATE OF condition_answers, vehicle_size_class
    ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_intake();

-- ── 5. Server-derived suggested duration ─────────────────────────────────
-- Derived rather than accepted from the client, for the same reason prices are
-- (20260817140000): a client-stated duration is a client-stated cost, since
-- duration is what occupies the provider's day. The client still computes the
-- same number for display — src/utils/suggestion.ts mirrors this arithmetic —
-- but what lands in the row is the server's.
--
-- ORDERING: this trigger MUST run after trg_derive_booking_amounts, which
-- rebuilds NEW.services from service_packages. Postgres fires same-timing
-- triggers in alphabetical order by trigger name, and
-- 'trg_derive_booking_amounts' < 'trg_derive_booking_suggestion', so it does.
-- Renaming either one without preserving that order would silently compute the
-- suggestion from the client's unvalidated services array.
CREATE OR REPLACE FUNCTION public.derive_booking_suggestion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  base_mins  INT;
  delta_total INT;
BEGIN
  -- Same trusted-role early return as the pricing trigger, and SECURITY INVOKER
  -- for the same reason: current_user must be the caller's role, not the
  -- function owner's, or this matches every write and stops being a guard.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT SUM(COALESCE(p.duration_mins, 0))::INT
    INTO base_mins
    FROM jsonb_array_elements(COALESCE(NEW.services, '[]'::JSONB)) AS svc
    JOIN public.service_packages p ON p.id = (svc ->> 'id')::UUID
   WHERE p.provider_id = NEW.provider_id;

  IF base_mins IS NULL OR base_mins <= 0 THEN
    NEW.suggested_duration_mins := NULL;
    RETURN NEW;
  END IF;

  -- Sum every modifier this provider has published that matches the declared
  -- size and the answered conditions. A factor the customer left unanswered
  -- contributes nothing, rather than defaulting to a middle value — an
  -- unanswered question is not a moderate answer.
  SELECT COALESCE(SUM(m.delta_mins), 0)::INT
    INTO delta_total
    FROM public.service_duration_modifiers m
   WHERE m.provider_id = NEW.provider_id
     AND (
       (m.factor_type = 'size_class'
          AND m.factor_value = NEW.vehicle_size_class)
       OR (m.factor_type = 'soil_level'
          AND m.factor_value = NEW.condition_answers ->> 'soil_level')
       OR (m.factor_type = 'pets'
          AND m.factor_value = NEW.condition_answers ->> 'pets')
       OR (m.factor_type = 'stains'
          AND m.factor_value = NEW.condition_answers ->> 'stains')
     );

  -- Floored at 15 minutes. Modifiers can legitimately be negative, and a set of
  -- them summing below the base would otherwise propose a job that takes no
  -- time — which reads as "unknown duration" downstream, the one thing the
  -- suggestion exists to avoid.
  NEW.suggested_duration_mins := GREATEST(base_mins + delta_total, 15);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.derive_booking_suggestion() IS
  'Computes suggested_duration_mins from the package base plus the provider''s size/condition modifiers. Runs after trg_derive_booking_amounts, which rebuilds NEW.services.';

DROP TRIGGER IF EXISTS trg_derive_booking_suggestion ON public.bookings;
CREATE TRIGGER trg_derive_booking_suggestion
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_booking_suggestion();

-- ── 6. Booking column allowlist additions ────────────────────────────────
-- The client may state the two FACTS (what the car is, what condition it is
-- in) and never the CONCLUSION (how long it takes, what it costs).
-- suggested_duration_mins is absent from both lists on purpose: the trigger
-- above writes it, and BEFORE-trigger assignments are not privilege-checked, so
-- it can write a column the caller cannot name.
GRANT INSERT (vehicle_size_class, condition_answers)
  ON public.bookings TO authenticated;

-- Editable while the request is still being assembled. The status-transition
-- trigger from 20260817120000 governs when that stops being possible; these
-- columns do not need their own gate because changing them after a quote is
-- agreed does not change any committed number — Phase 3's re-quote path is an
-- Edge Function.
GRANT UPDATE (vehicle_size_class, condition_answers)
  ON public.bookings TO authenticated;

-- vehicles has no column allowlist today, so its table-level default grant
-- already covers size_class and this changes nothing. It is stated anyway so
-- that narrowing vehicles later — which it should get, on the same reasoning as
-- provider_profiles — does not silently break vehicle editing.
GRANT INSERT (size_class), UPDATE (size_class)
  ON public.vehicles TO authenticated;

-- ── 7. Intake photos ─────────────────────────────────────────────────────
-- §1: booking_photos.photo_type was CHECK IN ('before','after') and its only
-- INSERT policy was provider-only, so a customer could not attach a photo to
-- anything, ever. Pre-booking photos were structurally impossible, which is
-- what made "provider assesses the vehicle from photos" unbuildable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'booking_photos_photo_type_check'
       AND conrelid = 'public.booking_photos'::regclass
  ) THEN
    ALTER TABLE public.booking_photos
      DROP CONSTRAINT booking_photos_photo_type_check;
  END IF;
END $$;

ALTER TABLE public.booking_photos
  ADD CONSTRAINT booking_photos_photo_type_check
  CHECK (photo_type IN ('intake', 'before', 'after'));

COMMENT ON COLUMN public.booking_photos.photo_type IS
  'intake = customer-supplied, pre-quote. before/after = provider-supplied, job day. Only intake is customer-insertable.';

-- Customer insert, intake only. Permissive policies are OR'd, so the existing
-- provider policy is untouched; this adds a second, narrower route in.
--
-- The photo_type predicate is the whole point. Without it a customer could
-- write an 'after' photo — the evidence a job was completed correctly — which
-- is the provider's record and feeds dispute resolution.
DROP POLICY IF EXISTS "booking_photos: customer insert intake" ON public.booking_photos;
CREATE POLICY "booking_photos: customer insert intake" ON public.booking_photos
  FOR INSERT WITH CHECK (
    photo_type = 'intake'
    AND auth.uid() = (
      SELECT b.customer_id FROM public.bookings b WHERE b.id = booking_id
    )
  );

-- Deleting a photo is not a customer action and not a provider one either: the
-- before/after pair is dispute evidence, and an intake photo is what a quote
-- was based on. Removal belongs to the service role.
-- INSERT is revoked first, not only UPDATE and DELETE. Supabase's default
-- privileges already granted INSERT at TABLE level, and a table-level grant
-- covers every column — so adding a column-level GRANT on top of it restricts
-- nothing. The REVOKE is what makes the allowlist below mean anything.
REVOKE INSERT, UPDATE, DELETE ON public.booking_photos FROM anon, authenticated;
GRANT INSERT (id, booking_id, photo_type, storage_url)
  ON public.booking_photos TO authenticated;
-- uploaded_at is deliberately absent: it defaults to now() and is the only
-- evidence of when a photo actually arrived.
