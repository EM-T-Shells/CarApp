-- Close the booking UPDATE hole — the "Security fix" in §4 of the quote-first
-- booking spec. This gates Phase 3, where providers begin setting prices.
--
-- The policy "bookings: update own" is FOR UPDATE with no WITH CHECK and no
-- column restriction, so Postgres reuses its USING clause as the check: either
-- party to a booking can write ANY column on it. A customer could rewrite
-- total_amount, zero out provider_payout, or set status straight to
-- 'completed' — collecting the service without the balance ever being
-- captured. RLS has no column-level granularity, so no amount of policy
-- rewriting fixes this on its own.
--
-- Two layers, because neither is sufficient alone:
--
--   1. Column-level UPDATE privileges — a hard allowlist. Postgres evaluates
--      column privileges independently of RLS, so this cannot be bypassed by a
--      policy bug. Everything money-shaped becomes unwritable from the client.
--
--   2. A status-transition guard — the allowlist has to leave `status`
--      writable, because the provider drives the job lifecycle from the app.
--      But not every transition is the client's to make, so the trigger pins
--      it to the three the app actually performs.
--
-- Both layers apply only to the `authenticated` and `anon` roles. Edge
-- Functions connect with SUPABASE_SERVICE_ROLE_KEY and are untouched — that is
-- already where accept/decline, the deposit and balance captures, the
-- cancellation policy, and completion live.
--
-- Idempotent — safe to re-run.

-- ── 1. Column allowlist ──────────────────────────────────────────────────
-- The complete set of booking columns the app writes from the client:
--   scheduled_at   customer reschedule        app/(tabs)/bookings/[id].tsx
--   status         lifecycle transitions      (constrained by the trigger below)
--   started_at     provider stamps arrival    app/(provider-tabs)/jobs/[bookingId].tsx
-- Everything else — the money columns, the two parties, the cancellation
-- bookkeeping, and the Phase 0 duration columns — is server-side only.
REVOKE UPDATE ON public.bookings FROM anon, authenticated;
GRANT UPDATE (scheduled_at, status, started_at) ON public.bookings TO authenticated;

-- ── 2. Status transition guard ───────────────────────────────────────────
-- Deliberately SECURITY INVOKER (the default). A SECURITY DEFINER function
-- would run as its owner, making `current_user` 'postgres' for every caller —
-- the early return below would then match on every write and silently disable
-- this entire guard. The provider_profiles lookup is safe under the invoker's
-- own RLS: "provider_profiles: write own" is FOR ALL, so a provider can always
-- read their own row, and the bookings policy already relies on exactly this
-- subquery.
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

DROP TRIGGER IF EXISTS trg_enforce_booking_status_transition ON public.bookings;
CREATE TRIGGER trg_enforce_booking_status_transition
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_status_transition();

COMMENT ON FUNCTION public.enforce_booking_status_transition() IS
  'Restricts client-side booking status changes to the three transitions the app performs (customer abandons a pending request; provider goes en_route then in_progress) and reserves started_at to the assigned provider. Bypassed for service_role, where every other transition already lives.';
