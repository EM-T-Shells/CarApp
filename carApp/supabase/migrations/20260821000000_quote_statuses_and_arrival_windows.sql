-- 20260821000000_quote_statuses_and_arrival_windows.sql
--
-- Phase 3 foundation (Blueprint/quote_first_booking.md §3, §8).
--
-- Additive and non-breaking on purpose. This migration widens the vocabulary
-- and adds the columns the quote flow needs; it changes no existing behaviour
-- and no row takes a new status until the Phase 3 Edge Function actions exist.
-- Splitting it out this way means the risky half of Phase 3 — resequencing
-- payments — can be written and reverted against a schema that is already in
-- place and tested, rather than both landing at once.
--
--   1. Two new statuses: pending_provider_quote, pending_customer_approval
--   2. requested_window_start / requested_window_end
--   3. quote_line_items / quoted_total_amount, writable ONLY server-side
--
-- Idempotent — safe to re-run.

-- ── 1. Status vocabulary ─────────────────────────────────────────────────
-- §2: legacy rows are left as-is and the old statuses stay valid. So this
-- widens the CHECK rather than replacing the list — a booking already sitting
-- in 'pending_provider_approval' is still legal, and the deposit-first flow
-- keeps working until Phase 3 switches it over.
--
-- The target lifecycle (§3):
--   pending_provider_quote -> pending_customer_approval -> confirmed
--     -> en_route -> in_progress -> completed
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status IN (
    -- Current flow, unchanged.
    'pending',
    'pending_provider_approval',
    'confirmed',
    'en_route',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
    -- Quote flow.
    'pending_provider_quote',
    'pending_customer_approval',
    -- §7: photos unusable -> request_more_photos parks the request here rather
    -- than declining it, so the customer can rescue it instead of rebooking.
    'awaiting_customer_info'
  ));

-- ── 2. Arrival window ────────────────────────────────────────────────────
-- §2 locked this: the customer picks a day and a window, the provider sets the
-- exact start inside it. scheduled_at stays the authoritative instant — it is
-- what occupied_range, estimated_completion_at and every existing reader key
-- off — and these two columns record what was *asked for*.
--
-- Nullable, because every existing booking predates them and because a booking
-- made through the current flow never has a window at all. A NULL window means
-- "the customer named an exact time", which is what today's DateTimePicker
-- produces.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_window_start TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_window_end TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_requested_window_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_requested_window_check CHECK (
        -- Both or neither. A half-stated window is not a narrower ask, it is a
        -- missing one, and a reader that took the start as gospel would place
        -- a job at the earliest edge of a window the customer never closed.
        (requested_window_start IS NULL AND requested_window_end IS NULL)
        OR (
          requested_window_start IS NOT NULL
          AND requested_window_end IS NOT NULL
          AND requested_window_end > requested_window_start
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.requested_window_start IS
  'Start of the arrival window the customer asked for. NULL means they named an exact time (the pre-quote flow). scheduled_at remains the authoritative instant.';
COMMENT ON COLUMN public.bookings.requested_window_end IS
  'End of the requested arrival window, exclusive of nothing — it is a preference, not a constraint. See requested_window_start.';

-- ── 3. The quote itself ──────────────────────────────────────────────────
-- quote_line_items is the itemisation §2 made mandatory: "SUV +$30, heavy pet
-- hair +$25". Shape, validated below:
--   [{"label":"SUV","amount_cents":3000},{"label":"Heavy pet hair","amount_cents":2500}]
--
-- Amounts are integer CENTS, not NUMERIC. Every other money column on this
-- table is NUMERIC(10,2) because Postgres compares and sums them, but these are
-- opaque to the database — nothing aggregates them — and JSONB has only IEEE
-- doubles, so storing 30.00 as a JSON number invites a 29.999999999999996 to
-- reach a customer's screen. money.ts already works in integer cents for the
-- same reason.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quote_line_items JSONB;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quoted_total_amount NUMERIC(10,2);

COMMENT ON COLUMN public.bookings.quote_line_items IS
  'Itemised surcharges: [{"label":"SUV","amount_cents":3000}]. Integer cents — JSONB has no exact decimal. Service-role writable only.';
COMMENT ON COLUMN public.bookings.quoted_total_amount IS
  'The provider''s quoted total, before the customer approves it. Distinct from total_amount, which is what was actually agreed and charged.';

-- Deliberately NOT granted to anon or authenticated, on either INSERT or
-- UPDATE. Naming them here rather than relying on the earlier REVOKEs is
-- documentation: the whole point of §4's two-layer guard is that a price
-- reaches the row through an Edge Function or not at all, and a future
-- migration that adds a convenience GRANT would undo it silently.
REVOKE INSERT (quote_line_items, quoted_total_amount)
  ON public.bookings FROM anon, authenticated;
REVOKE UPDATE (quote_line_items, quoted_total_amount)
  ON public.bookings FROM anon, authenticated;
REVOKE INSERT (requested_window_start, requested_window_end)
  ON public.bookings FROM anon, authenticated;

-- The window IS the customer's to state, unlike the quote.
GRANT INSERT (requested_window_start, requested_window_end)
  ON public.bookings TO authenticated;
GRANT UPDATE (requested_window_start, requested_window_end)
  ON public.bookings TO authenticated;

-- ── 4. Quote shape validation ────────────────────────────────────────────
-- Same reasoning as trg_validate_booking_intake: a CHECK cannot iterate an
-- array, and an unvalidated shape here would surface as a crash on the
-- customer's approval screen — the single worst place to discover it, since it
-- is the screen where they are being asked to agree to a number.
CREATE OR REPLACE FUNCTION public.validate_booking_quote()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  item JSONB;
BEGIN
  IF NEW.quote_line_items IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.quote_line_items) <> 'array' THEN
    RAISE EXCEPTION 'quote_line_items must be a JSON array'
      USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(NEW.quote_line_items)
  LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Each quote line item must be an object'
        USING ERRCODE = '22023';
    END IF;

    IF COALESCE(item ->> 'label', '') = '' THEN
      RAISE EXCEPTION 'Each quote line item needs a non-empty label'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(item -> 'amount_cents') <> 'number' THEN
      RAISE EXCEPTION 'Quote line item "%" needs a numeric amount_cents',
        item ->> 'label' USING ERRCODE = '22023';
    END IF;

    -- Integer cents. A fractional cent is a rounding bug upstream, and letting
    -- it through means the itemisation cannot be made to sum to the total.
    IF (item ->> 'amount_cents')::NUMERIC <> trunc((item ->> 'amount_cents')::NUMERIC) THEN
      RAISE EXCEPTION 'Quote line item "%" has a fractional amount_cents',
        item ->> 'label' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_quote() IS
  'Enforces the quote_line_items grammar. A bad shape would otherwise surface as a crash on the customer approval screen — the worst place to find it.';

DROP TRIGGER IF EXISTS trg_validate_booking_quote ON public.bookings;
CREATE TRIGGER trg_validate_booking_quote
  BEFORE INSERT OR UPDATE OF quote_line_items ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_quote();

-- ── 5. Client transitions for the quote flow ─────────────────────────────
-- enforce_booking_status_transition pins the client to the transitions the app
-- actually performs. The quote flow adds exactly one that is legitimately
-- client-side: a customer abandoning a request that has not been quoted or
-- approved yet.
--
-- Everything else stays server-side and that is the design, not an oversight:
--   - submitting a quote sets a PRICE
--   - approving a quote CHARGES a deposit
--   - requesting more photos notifies
-- All three are Edge Function actions. A client transition into
-- 'pending_customer_approval' would be a client-set price by another route.
CREATE OR REPLACE FUNCTION public.enforce_booking_status_transition()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  is_customer BOOLEAN;
  is_provider BOOLEAN;
BEGIN
  -- Trusted callers pass straight through: service_role (Edge Functions),
  -- postgres (migrations and ops corrections). Naming the *restricted* roles
  -- rather than the trusted ones means an unrecognised internal role is never
  -- accidentally locked out of its own maintenance work.
  --
  -- MUST stay SECURITY INVOKER. As SECURITY DEFINER current_user would be the
  -- owner for every caller, this early return would match on every write, and
  -- the whole guard would be silently disabled while still looking correct.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  is_customer := COALESCE(auth.uid() = OLD.customer_id, FALSE);
  is_provider := COALESCE(
    auth.uid() = (
      SELECT user_id FROM public.provider_profiles WHERE id = OLD.provider_id
    ),
    FALSE
  );

  -- started_at drives the generated estimated_completion_at and the
  -- actual_duration_mins stamp, so only the provider running the job may set
  -- it. A customer moving it would rewrite both.
  IF NEW.started_at IS DISTINCT FROM OLD.started_at AND NOT is_provider THEN
    RAISE EXCEPTION 'Only the assigned provider can set started_at on a booking'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      -- Customer abandons a request whose deposit never landed. The booking
      -- row is created before the PaymentIntent (the Edge Function needs a
      -- booking_id), so this unwinds a payment that fell through.
      (is_customer AND OLD.status = 'pending' AND NEW.status = 'cancelled')
      -- §2: with no expiry timers, cancel-from-either-end is the release
      -- valve, so both parties can walk away from an unpriced request. Nothing
      -- has been charged in any of these states — the deposit is not taken
      -- until approval — so there is no refund to reason about here.
      OR (
        (is_customer OR is_provider)
        AND OLD.status IN ('pending_provider_quote',
                           'pending_customer_approval',
                           'awaiting_customer_info')
        AND NEW.status = 'cancelled'
      )
      -- Provider drives the job lifecycle from the active-job screen.
      OR (is_provider AND OLD.status = 'confirmed' AND NEW.status = 'en_route')
      OR (is_provider AND OLD.status = 'en_route' AND NEW.status = 'in_progress')
    ) THEN
      RAISE EXCEPTION
        'Booking status % -> % is not a client transition; it must go through the server',
        OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_booking_status_transition() IS
  'Restricts client-side booking status changes to the transitions the app performs: the customer abandons a pending request, either party cancels an unpriced quote request, and the provider drives confirmed -> en_route -> in_progress. Reserves started_at to the assigned provider. Bypassed for service_role, where quoting, approving and completing already live.';

-- The trigger itself is unchanged and still bound to the same function name;
-- CREATE OR REPLACE above is what updates the behaviour. Re-stated for
-- idempotency on a fresh database.
DROP TRIGGER IF EXISTS trg_enforce_booking_status_transition ON public.bookings;
CREATE TRIGGER trg_enforce_booking_status_transition
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_status_transition();

-- ── 6. Index for the provider's request queue ────────────────────────────
-- The Requests section of the Jobs tab (§6) reads exactly this: a provider's
-- rows in the two waiting states, oldest first, because §7 wants an age label
-- ("waiting 2 days") and the oldest request is the one most at risk.
CREATE INDEX IF NOT EXISTS idx_bookings_provider_quote_queue
  ON public.bookings (provider_id, created_at)
  WHERE status IN ('pending_provider_quote', 'pending_customer_approval',
                   'awaiting_customer_info');
