-- Blocker #8: make the Founding Provider Program real.
--
-- Before: is_founding_provider existed but nothing ever set it. No first-100
-- count check, no expiry, no auto-convert. The 0% founding fee was never
-- applied to a real provider.
--
-- Now:
--   * The first 100 providers to reach verification_status = 'approved' are
--     auto-enrolled by a trigger: is_founding_provider = TRUE, platform_fee_rate
--     = 0 (0%), founding_provider_expires_at = approval + 90 days.
--   * Everyone after the 100th (and every non-founding provider) sits at the
--     standard 3% MVP rate.
--   * A daily pg_cron sweep converts each founding provider back to the standard
--     3% rate once its 90-day window has elapsed (is_founding_provider stays
--     TRUE for historical/badge purposes; only the fee changes).
--
-- Fee-rate conflict resolution (Blueprint): the MVP standard provider fee is
-- 3% (spec §5/§10 + Workflow doc "3% at MVP"). The DB default and the founding
-- expiry target are both 0.030.
--
-- Apply with: supabase db push   (or run in the SQL editor on the project).

-- ── Standard fee rate: 5% -> 3% ─────────────────────────────────────────
ALTER TABLE public.provider_profiles
  ALTER COLUMN platform_fee_rate SET DEFAULT 0.030;

-- Re-point any existing non-founding providers still on the old 5% default to
-- the resolved 3% MVP rate. Founding providers (0%) are left untouched.
UPDATE public.provider_profiles
  SET platform_fee_rate = 0.030
  WHERE is_founding_provider IS NOT TRUE
    AND platform_fee_rate = 0.050;

-- ── Founding-window expiry column ───────────────────────────────────────
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS founding_provider_expires_at TIMESTAMPTZ;

-- Helpful constants captured here so the cron body and the trigger agree.
--   FOUNDING_CAP            = 100   (first N approved providers)
--   FOUNDING_WINDOW         = 90 days
--   FOUNDING_FEE_RATE       = 0.000
--   STANDARD_MVP_FEE_RATE   = 0.030

-- ── Provisioning trigger ────────────────────────────────────────────────
-- Fires when a provider becomes 'approved' (INSERT-as-approved, or any UPDATE
-- that transitions verification_status to 'approved'). Enrolls the provider in
-- the founding program iff fewer than 100 providers are already founding.
--
-- Concurrency: a transaction-scoped advisory lock serialises concurrent
-- approvals so the count check + enrollment is atomic and the cap can never be
-- exceeded by a race. Idempotent: a provider already flagged founding, or one
-- being re-approved, is never enrolled twice.
CREATE OR REPLACE FUNCTION public.provision_founding_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  founding_count INT;
BEGIN
  -- Only act on the pending/other -> approved transition.
  IF NEW.verification_status <> 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.verification_status = 'approved' THEN
    RETURN NEW;  -- already approved before; nothing to provision
  END IF;

  -- Never re-enroll an already-founding provider.
  IF NEW.is_founding_provider IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Serialise concurrent approvals against the founding cap.
  PERFORM pg_advisory_xact_lock(hashtext('founding_provider_cap'));

  SELECT count(*) INTO founding_count
  FROM public.provider_profiles
  WHERE is_founding_provider IS TRUE;

  IF founding_count < 100 THEN
    NEW.is_founding_provider        := TRUE;
    NEW.platform_fee_rate           := 0.000;
    NEW.founding_provider_expires_at := COALESCE(NEW.approved_at, now()) + INTERVAL '90 days';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_founding_provider ON public.provider_profiles;
CREATE TRIGGER trg_provision_founding_provider
  BEFORE INSERT OR UPDATE OF verification_status ON public.provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_founding_provider();

-- ── Founding-window expiry sweep ────────────────────────────────────────
-- Pure DB operation (no Stripe / no money movement), so it runs entirely in
-- SQL — no Edge Function round-trip needed (unlike the #4 approval sweep).
-- Converts any founding provider whose 90-day window has elapsed back to the
-- standard 3% rate. is_founding_provider is left TRUE (historical badge); only
-- the fee and the expiry sentinel change.
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.expire_founding_providers()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  converted INT;
BEGIN
  UPDATE public.provider_profiles
    SET platform_fee_rate = 0.030,
        founding_provider_expires_at = NULL
    WHERE is_founding_provider IS TRUE
      AND founding_provider_expires_at IS NOT NULL
      AND founding_provider_expires_at <= now();
  GET DIAGNOSTICS converted = ROW_COUNT;
  RETURN converted;
END;
$$;

-- Index supports the daily sweep's predicate.
CREATE INDEX IF NOT EXISTS idx_provider_founding_expiry
  ON public.provider_profiles (founding_provider_expires_at)
  WHERE is_founding_provider IS TRUE AND founding_provider_expires_at IS NOT NULL;

SELECT cron.unschedule('expire-founding-providers')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-founding-providers');

-- Daily at 03:00 UTC — the window is 90 days, so minute-level precision is
-- unnecessary; once a day is ample and cheap.
SELECT cron.schedule(
  'expire-founding-providers',
  '0 3 * * *',
  $$ SELECT public.expire_founding_providers(); $$
);
