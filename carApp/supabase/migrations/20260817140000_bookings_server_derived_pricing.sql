-- Close the booking INSERT hole — the sibling of the UPDATE hole fixed in
-- 20260817120000.
--
-- That migration stopped a customer from *rewriting* their price. It did
-- nothing about them *setting* it in the first place: "bookings: customer
-- insert" only checks WITH CHECK (auth.uid() = customer_id), and the client
-- computed every money column itself and sent them along with the row. The
-- anon key ships inside the mobile binary and every user holds a valid JWT, so
-- PostgREST is reachable directly — the app was the only thing computing an
-- honest price.
--
-- The quiet exploit is not underpaying, which the provider would notice when
-- the job card shows the wrong price. It is inserting a normal-looking
-- total_amount with platform_fee = 0 and provider_payout = total_amount: the
-- customer pays the expected amount, the provider is paid in full and has no
-- reason to look, and the platform's cut silently goes to zero.
--
-- Fix: the client no longer states prices at all, it states *intent* (which
-- provider, which packages), and the server prices it.
--
--   1. A BEFORE INSERT trigger recomputes every money column from
--      service_packages — the provider's own published prices — and rebuilds
--      the services snapshot from the same rows, so the stored record cannot
--      disagree with what was charged.
--   2. Column privileges then remove the money columns from the client's
--      INSERT vocabulary entirely, so a stale or hostile client gets a hard
--      403 instead of having its numbers quietly overwritten.
--
-- Idempotent — safe to re-run.

-- ── 1. Server-side pricing ───────────────────────────────────────────────
-- Mirrors src/utils/money.ts exactly, which is the contract the review screen
-- shows the customer:
--   subtotal       = Σ service_packages.base_price
--   service_fee    = floor(subtotal * 0.02)
--   total          = subtotal + service_fee
--   deposit        = floor(total * 0.15)
--   platform_fee   = floor(subtotal * provider.platform_fee_rate)
--   payout         = subtotal - platform_fee
-- All arithmetic runs in integer cents so the floors land identically to the
-- client's; only the final columns convert back to the decimal dollars the
-- bookings table stores.
--
-- SECURITY INVOKER, like enforce_booking_status_transition and for the same
-- reason: it reads current_user to decide whether the caller is a client. As
-- SECURITY DEFINER that would always read 'postgres' and the trigger would
-- never price anything. Invoker rights are also what make the lookup correct —
-- "service_packages: read public" limits the invoker to active, approved
-- packages, so an unbookable package fails here rather than being priced.
CREATE OR REPLACE FUNCTION public.derive_booking_amounts()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  requested_ids   UUID[];
  matched         INT;
  subtotal_cents  BIGINT;
  fee_cents       BIGINT;
  total_cents     BIGINT;
  deposit_cents   BIGINT;
  platform_cents  BIGINT;
  payout_cents    BIGINT;
  fee_rate        NUMERIC;
  snapshot        JSONB;
  duration        INT;
BEGIN
  -- Server-side inserts price themselves: the Edge Functions, the E2E seed
  -- script, and ops backfills all supply their own figures deliberately.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.provider_id IS NULL THEN
    RAISE EXCEPTION 'A booking must name a provider' USING ERRCODE = '23514';
  END IF;

  SELECT array_agg(DISTINCT (svc ->> 'id')::UUID)
    INTO requested_ids
    FROM jsonb_array_elements(COALESCE(NEW.services, '[]'::JSONB)) AS svc
   WHERE svc ->> 'id' IS NOT NULL;

  IF requested_ids IS NULL OR cardinality(requested_ids) = 0 THEN
    RAISE EXCEPTION 'A booking must include at least one service'
      USING ERRCODE = '23514';
  END IF;

  -- Rebuild the snapshot and the subtotal from the provider's own published
  -- prices. Anything the client sent in NEW.services other than the ids is
  -- discarded, so a forged base_price cannot survive even as display text.
  SELECT
      jsonb_agg(
        jsonb_build_object(
          'id',            p.id,
          'name',          p.name,
          'description',   p.description,
          'category',      p.category,
          'base_price',    ROUND(COALESCE(p.base_price, 0) * 100)::BIGINT,
          'duration_mins', p.duration_mins
        )
        ORDER BY p.sort_order NULLS LAST, p.name
      ),
      SUM(ROUND(COALESCE(p.base_price, 0) * 100))::BIGINT,
      SUM(COALESCE(p.duration_mins, 0))::INT,
      COUNT(*)::INT
    INTO snapshot, subtotal_cents, duration, matched
    FROM public.service_packages p
   WHERE p.id = ANY (requested_ids)
     AND p.provider_id = NEW.provider_id;

  -- A miss means the package does not exist, belongs to a different provider,
  -- or is not active and approved — RLS hides those from the invoker. Refusing
  -- is right in every case: none of them are bookable.
  IF matched IS NULL OR matched <> cardinality(requested_ids) THEN
    RAISE EXCEPTION
      'Booking references services that are not bookable from this provider'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(pp.platform_fee_rate, 0.03)
    INTO fee_rate
    FROM public.provider_profiles pp
   WHERE pp.id = NEW.provider_id;

  IF fee_rate IS NULL THEN
    RAISE EXCEPTION 'Provider not found for booking' USING ERRCODE = '23503';
  END IF;

  fee_cents      := FLOOR(subtotal_cents * 0.02);
  total_cents    := subtotal_cents + fee_cents;
  deposit_cents  := FLOOR(total_cents * 0.15);
  platform_cents := FLOOR(subtotal_cents * fee_rate);
  payout_cents   := subtotal_cents - platform_cents;

  NEW.services        := snapshot;
  NEW.service_fee     := fee_cents / 100.0;
  NEW.total_amount    := total_cents / 100.0;
  NEW.deposit_amount  := deposit_cents / 100.0;
  NEW.platform_fee    := platform_cents / 100.0;
  NEW.provider_payout := payout_cents / 100.0;

  -- Phase 0's duration comes from the same authoritative rows, so the ready-by
  -- time cannot be inflated by a forged snapshot either.
  IF duration > 0 THEN
    NEW.estimated_duration_mins := duration;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_booking_amounts ON public.bookings;
CREATE TRIGGER trg_derive_booking_amounts
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_booking_amounts();

COMMENT ON FUNCTION public.derive_booking_amounts() IS
  'Prices client-created bookings server-side from service_packages, rebuilding the services snapshot so the stored record matches what was charged. Bypassed for service_role, where Edge Functions and seeds supply their own figures.';

-- ── 2. Column allowlist for INSERT ───────────────────────────────────────
-- What the client may now state: who and what, when, where, and a note.
-- What it may no longer state: any amount. The trigger above fills those in,
-- and BEFORE-trigger assignments are not privilege-checked, so it can write
-- columns the caller cannot name.
--
-- status stays grantable because the client legitimately opens a booking in
-- 'pending'; the CHECK constraint bounds the vocabulary and
-- enforce_booking_status_transition governs every move afterwards.
--
-- `id` is granted deliberately. It is not a price, RLS and the customer_id
-- check still govern the row, and a client supplying its own uuid (an
-- idempotent retry, a test fixture) is harmless. Withholding it is false
-- tightness that costs a misleading "permission denied for table bookings" —
-- Postgres reports INSERT column denials at table level, so the one ungranted
-- column looks like a blanket failure.
REVOKE INSERT ON public.bookings FROM anon, authenticated;
GRANT INSERT (
  id,
  customer_id,
  provider_id,
  vehicle_id,
  package_id,
  services,
  status,
  scheduled_at,
  service_address,
  location_lat,
  location_lng,
  notes
) ON public.bookings TO authenticated;
