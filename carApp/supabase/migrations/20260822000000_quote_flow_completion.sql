-- 20260822000000_quote_flow_completion.sql
--
-- Phase 3, the rest of it (Blueprint/quote_first_booking.md §3–§7). The
-- foundation in 20260821000000 added the quote statuses and columns; this adds
-- what the remaining Edge Function actions and the package menu need.
--
--   1. pending_adjustment_approval — §7 "vehicle worse than declared": the
--      provider proposes a longer / dearer job on a confirmed booking and the
--      customer approves it before anything changes
--   2. The overlap guard covers that status, so the slot stays held while the
--      customer decides
--   3. Server-only columns for the actions: the saved-card SetupIntent, the
--      provider's "more photos" note, a pending reschedule proposal and a
--      pending adjustment
--   4. scheduled_at leaves the client's UPDATE allowlist — a reschedule now
--      needs the other party's agreement (propose_reschedule /
--      respond_reschedule)
--   5. Adjustment line items share the quote grammar
--   6. service_packages: tiers, duration ranges and add-ons as child packages
--      (§4), with the retired 'addon' category reconciled
--   7. A booking cannot carry an add-on without its main service
--
-- Idempotent — safe to re-run.

-- ── 1. Status vocabulary ─────────────────────────────────────────────────
-- Widened again, never replaced (§2: legacy rows keep their statuses).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (status IN (
    'pending',
    'pending_provider_approval',
    'confirmed',
    'en_route',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
    'pending_provider_quote',
    'pending_customer_approval',
    'awaiting_customer_info',
    -- A confirmed job whose provider has proposed a new duration and price.
    -- Still committed: see the overlap guard below.
    'pending_adjustment_approval'
  ));

-- ── 2. Server-only columns ───────────────────────────────────────────────
-- Every column here is written by stripe-webhook with the service role and by
-- nothing else. None is granted to the client (see 4), for the same reason the
-- quote columns are not: each one either moves money or moves the provider's
-- day, and both go through an Edge Function that checks who is asking.

-- The SetupIntent that saved the customer's card at request time (§2: "card
-- saved at request, no hold, no charge"). accept_quote charges the deposit
-- off-session against its payment method. Stored rather than looked up from the
-- customer's saved cards, so the card charged is the one saved FOR this job.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_setup_intent_id TEXT;

-- request_more_photos (§7 "photos unusable"): what the provider asked for.
-- Kept after the customer responds, so the provider can see what they asked.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS info_request_note TEXT;

-- propose_reschedule: a new start one party proposed and the other has not yet
-- answered. scheduled_at does not move until they do, so the slot the booking
-- already holds stays held.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS proposed_scheduled_at TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reschedule_proposed_by TEXT;

-- adjust_job_duration: the proposed duration, the extra itemised charges and
-- the total they make. Nothing on the committed columns changes until the
-- customer approves (respond_adjustment), so declining leaves no trace.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adjustment_duration_mins INT;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adjustment_line_items JSONB;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adjustment_total_amount NUMERIC(10,2);
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_info_request_note_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_info_request_note_check
      CHECK (info_request_note IS NULL OR char_length(info_request_note) <= 500);
  END IF;

  -- Both or neither: a proposal nobody made, or a proposer with no time, is
  -- not a proposal the other party can answer.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_reschedule_proposal_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_reschedule_proposal_check CHECK (
        (proposed_scheduled_at IS NULL AND reschedule_proposed_by IS NULL)
        -- IS NOT NULL stated explicitly: `NULL IN (...)` is NULL, and a CHECK
        -- that evaluates to NULL passes, so without it a time with no proposer
        -- would slip through.
        OR (
          proposed_scheduled_at IS NOT NULL
          AND reschedule_proposed_by IS NOT NULL
          AND reschedule_proposed_by IN ('customer', 'provider')
        )
      );
  END IF;

  -- An adjustment exists exactly while the booking is waiting on it. A stale
  -- adjustment left on a confirmed row would be read by the next screen as a
  -- live proposal; a pending_adjustment_approval row without one would ask the
  -- customer to approve nothing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_adjustment_state_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_adjustment_state_check CHECK (
        (status = 'pending_adjustment_approval')
          = (adjustment_duration_mins IS NOT NULL
             AND adjustment_total_amount IS NOT NULL)
        AND (adjustment_duration_mins IS NOT NULL
             OR (adjustment_line_items IS NULL AND adjustment_reason IS NULL))
      );
  END IF;

  -- The same sanity rails submit_quote applies (_shared/quote.ts), restated so
  -- a direct service-role write cannot bypass them either.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_adjustment_duration_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_adjustment_duration_check
      CHECK (adjustment_duration_mins IS NULL
             OR adjustment_duration_mins BETWEEN 15 AND 720);
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.stripe_setup_intent_id IS
  'SetupIntent that saved the customer''s card when the request was sent. accept_quote charges the deposit off-session against it. Service-role writable only.';
COMMENT ON COLUMN public.bookings.info_request_note IS
  'What the provider asked for when they sent the request back (request_more_photos). Service-role writable only.';
COMMENT ON COLUMN public.bookings.proposed_scheduled_at IS
  'A new start proposed by one party and not yet answered by the other. scheduled_at is unchanged until it is accepted.';
COMMENT ON COLUMN public.bookings.adjustment_total_amount IS
  'The total the booking would become if the customer approves the pending adjustment. Distinct from total_amount, which is what was agreed.';

-- ── 3. The slot stays held while an adjustment is pending ────────────────
-- pending_adjustment_approval is a confirmed job with a question attached, not
-- a released one. Without this, the moment a provider proposed an adjustment
-- their slot would stop counting and another customer's accept could land in
-- it.
--
-- Recreated only when the current definition does not already name the status,
-- so a re-run does not rebuild the index for nothing. The set of statuses only
-- grows here, and no row can be in the new one yet, so no existing pair of
-- bookings can start conflicting.
DO $$
DECLARE
  current_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'bookings_no_provider_overlap'
     AND conrelid = 'public.bookings'::regclass;

  IF current_def IS NOT NULL AND current_def LIKE '%pending_adjustment_approval%' THEN
    RETURN;
  END IF;

  IF current_def IS NOT NULL THEN
    ALTER TABLE public.bookings DROP CONSTRAINT bookings_no_provider_overlap;
  END IF;

  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_no_provider_overlap
    EXCLUDE USING gist (
      provider_id WITH =,
      occupied_range WITH &&
    ) WHERE (status IN ('confirmed', 'en_route', 'in_progress',
                        'pending_adjustment_approval'));
END $$;

COMMENT ON CONSTRAINT bookings_no_provider_overlap ON public.bookings IS
  'A provider cannot hold two committed bookings whose occupied ranges overlap. pending_adjustment_approval counts as committed. Raises 23P01.';

-- ── 4. The client's write surface ────────────────────────────────────────
-- None of the new columns is granted. Stated rather than relied upon, because
-- GRANT is additive and a later convenience grant would undo it silently.
REVOKE INSERT (stripe_setup_intent_id, info_request_note, proposed_scheduled_at,
               reschedule_proposed_by, adjustment_duration_mins,
               adjustment_line_items, adjustment_total_amount, adjustment_reason)
  ON public.bookings FROM anon, authenticated;
REVOKE UPDATE (stripe_setup_intent_id, info_request_note, proposed_scheduled_at,
               reschedule_proposed_by, adjustment_duration_mins,
               adjustment_line_items, adjustment_total_amount, adjustment_reason)
  ON public.bookings FROM anon, authenticated;

-- scheduled_at leaves the UPDATE allowlist. It was granted in 20260817120000
-- for the customer's reschedule sheet, which wrote it directly — so either
-- party could move a confirmed job, and with it the provider's committed day,
-- without the other agreeing. Rescheduling is now propose_reschedule +
-- respond_reschedule. INSERT keeps it: a new request still states the window
-- start as its placeholder.
REVOKE UPDATE (scheduled_at) ON public.bookings FROM anon, authenticated;

-- ── 5. Line item grammar, shared ─────────────────────────────────────────
-- Adjustment line items render on the same kind of approval screen as quote
-- line items and are appended to them on approval, so they obey the same
-- grammar. Factored into one checker rather than restated.
CREATE OR REPLACE FUNCTION public.assert_booking_line_items(
  items JSONB,
  column_name TEXT
)
  RETURNS VOID
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path = public
AS $$
DECLARE
  item JSONB;
BEGIN
  IF items IS NULL THEN
    RETURN;
  END IF;

  IF jsonb_typeof(items) <> 'array' THEN
    RAISE EXCEPTION '% must be a JSON array', column_name
      USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(items)
  LOOP
    IF jsonb_typeof(item) <> 'object' THEN
      RAISE EXCEPTION 'Each % entry must be an object', column_name
        USING ERRCODE = '22023';
    END IF;

    IF COALESCE(item ->> 'label', '') = '' THEN
      RAISE EXCEPTION 'Each % entry needs a non-empty label', column_name
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(item -> 'amount_cents') <> 'number' THEN
      RAISE EXCEPTION 'Line item "%" needs a numeric amount_cents',
        item ->> 'label' USING ERRCODE = '22023';
    END IF;

    IF (item ->> 'amount_cents')::NUMERIC <> trunc((item ->> 'amount_cents')::NUMERIC) THEN
      RAISE EXCEPTION 'Line item "%" has a fractional amount_cents',
        item ->> 'label' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_booking_quote()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_booking_line_items(NEW.quote_line_items, 'quote_line_items');
  PERFORM public.assert_booking_line_items(NEW.adjustment_line_items, 'adjustment_line_items');
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_quote() IS
  'Enforces the line item grammar on quote_line_items and adjustment_line_items. A bad shape would otherwise surface as a crash on an approval screen — the worst place to find it.';

DROP TRIGGER IF EXISTS trg_validate_booking_quote ON public.bookings;
CREATE TRIGGER trg_validate_booking_quote
  BEFORE INSERT OR UPDATE OF quote_line_items, adjustment_line_items
    ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_quote();

-- ── 6. Package tiers, ranges and add-ons (§4) ────────────────────────────
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS duration_min_mins INT;
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS duration_max_mins INT;
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS tier TEXT;
ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS parent_package_id UUID
    REFERENCES public.service_packages(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.service_packages.duration_min_mins IS
  'Lower end of the advertised duration ("2–3 hrs"). Display only; set together with duration_max_mins. duration_mins stays the figure the suggestion engine and pricing trigger use.';
COMMENT ON COLUMN public.service_packages.tier IS
  'basic | standard | premium, or NULL for an untiered package. Add-ons carry no tier.';
COMMENT ON COLUMN public.service_packages.parent_package_id IS
  'Set on an add-on: the main service it attaches to. Same provider, one level deep. Deleting the main service deletes its add-ons.';

-- The 'addon' category was retired from service_catalog in 20260725200513 but
-- left legal here, and three live packages still carry it. Add-ons are now
-- modelled structurally (parent_package_id), so fold those rows into their
-- provider's own category, the same way the catalog migration folded its
-- add-ons into the provider type's primary category. No parent is guessed for
-- them — a provider with several main services is the only one who knows which
-- one "Pet Hair Removal" belongs to — so they become standalone services until
-- the provider attaches them in the menu editor.
UPDATE public.service_packages sp
   SET category = COALESCE(
         (SELECT o.category
            FROM public.service_packages o
           WHERE o.provider_id = sp.provider_id
             AND o.category <> 'addon'
           GROUP BY o.category
           ORDER BY count(*) DESC, o.category
           LIMIT 1),
         'detailing')
 WHERE sp.category = 'addon';

ALTER TABLE public.service_packages
  DROP CONSTRAINT IF EXISTS service_packages_category_check;
ALTER TABLE public.service_packages
  ADD CONSTRAINT service_packages_category_check
  CHECK (category IN ('detailing', 'mechanical'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_tier_check'
  ) THEN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_tier_check
      CHECK (tier IS NULL OR tier IN ('basic', 'standard', 'premium'));
  END IF;

  -- Both or neither, and the right way round. A range with one end is not a
  -- range, and "3–2 hrs" is a typo the customer would read literally.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_duration_range_check'
  ) THEN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_duration_range_check CHECK (
        (duration_min_mins IS NULL AND duration_max_mins IS NULL)
        OR (
          duration_min_mins IS NOT NULL
          AND duration_max_mins IS NOT NULL
          AND duration_min_mins > 0
          AND duration_min_mins <= duration_max_mins
        )
      );
  END IF;

  -- A tier ranks main services against each other. An add-on is not one of
  -- them, so a tiered add-on is a contradiction rather than extra detail.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_packages_addon_shape_check'
  ) THEN
    ALTER TABLE public.service_packages
      ADD CONSTRAINT service_packages_addon_shape_check CHECK (
        parent_package_id IS NULL
        OR (tier IS NULL AND parent_package_id <> id)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_packages_parent
  ON public.service_packages (parent_package_id)
  WHERE parent_package_id IS NOT NULL;

-- A CHECK cannot look at another row, so the hierarchy rules are a trigger:
--   • the parent belongs to the same provider — otherwise a provider could hang
--     an add-on off a competitor's service and appear on their menu
--   • the parent is itself a main service — one level deep, so the selector
--     never has to render a tree
--   • a package that already has add-ons cannot become one
--   • an add-on takes its parent's category, which is what the catalog
--     migration did when it retired 'addon' there
--
-- SECURITY INVOKER, like every other guard here. Run as the provider, the
-- parent lookup goes through "service_packages: write own" (FOR ALL covers
-- SELECT), so their own inactive packages are visible and nobody else's are.
CREATE OR REPLACE FUNCTION public.validate_service_package_hierarchy()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  parent_provider UUID;
  parent_parent   UUID;
  parent_category VARCHAR;
BEGIN
  IF NEW.parent_package_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT provider_id, parent_package_id, category
    INTO parent_provider, parent_parent, parent_category
    FROM public.service_packages
   WHERE id = NEW.parent_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Add-on parent package % does not exist', NEW.parent_package_id
      USING ERRCODE = '23503';
  END IF;

  IF parent_provider IS DISTINCT FROM NEW.provider_id THEN
    RAISE EXCEPTION 'An add-on must attach to one of the same provider''s services'
      USING ERRCODE = '23514';
  END IF;

  IF parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'An add-on cannot attach to another add-on'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.service_packages c WHERE c.parent_package_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'A service with add-ons cannot itself become an add-on'
      USING ERRCODE = '23514';
  END IF;

  NEW.category := parent_category;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_service_package_hierarchy() IS
  'Add-ons attach one level deep to a main service of the same provider, and inherit its category.';

DROP TRIGGER IF EXISTS trg_validate_service_package_hierarchy ON public.service_packages;
CREATE TRIGGER trg_validate_service_package_hierarchy
  BEFORE INSERT OR UPDATE OF parent_package_id, provider_id, category
    ON public.service_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_service_package_hierarchy();

-- ── 7. An add-on is booked with its main service ─────────────────────────
-- The selector only offers an add-on once its parent is chosen, but that is
-- the client's promise, not the database's. derive_booking_amounts would price
-- an orphaned add-on happily, and the provider would arrive to do a "Ceramic
-- Boost" with no detail underneath it.
--
-- ORDERING: must run after trg_derive_booking_amounts, which rebuilds
-- NEW.services from service_packages. Same-timing triggers fire alphabetically
-- and 'trg_derive_…' < 'trg_validate_booking_addons', so it does — the ids read
-- here are the rebuilt ones, not the client's.
--
-- Client roles only, like the pricing and suggestion triggers: service-role
-- writers (seeds, Edge Functions) state their own snapshot.
CREATE OR REPLACE FUNCTION public.validate_booking_addons()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  orphaned TEXT;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(p.name, ', ' ORDER BY p.name)
    INTO orphaned
    FROM jsonb_array_elements(COALESCE(NEW.services, '[]'::JSONB)) AS svc
    JOIN public.service_packages p ON p.id = (svc ->> 'id')::UUID
   WHERE p.parent_package_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(NEW.services, '[]'::JSONB)) AS other
        WHERE (other ->> 'id')::UUID = p.parent_package_id
     );

  IF orphaned IS NOT NULL THEN
    RAISE EXCEPTION 'Add-on % can only be booked with the service it belongs to', orphaned
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_addons() IS
  'Refuses a booking that carries an add-on without its main service. Runs after trg_derive_booking_amounts rebuilds NEW.services.';

DROP TRIGGER IF EXISTS trg_validate_booking_addons ON public.bookings;
CREATE TRIGGER trg_validate_booking_addons
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_addons();
