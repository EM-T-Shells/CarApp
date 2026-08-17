-- Phase 0 of the quote-first booking redesign: make service duration a real
-- property of a booking.
--
-- Before: `bookings.scheduled_at` was a single instant with no end. A booking
-- occupied zero time. `service_packages.duration_mins` existed but was only
-- ever summed for display on the review screen (selectEstimatedDuration in
-- state/bookingDraft.ts) and thrown away — it never reached the booking row.
-- Nothing in the app could answer "when will the car be ready?".
--
-- Now: every booking carries the duration the provider is committing to, and
-- an estimated completion time derived from it. This phase changes no flows —
-- the columns are nullable, backfilled from the existing services snapshot, and
-- read-only to the UI. Later phases let the provider set the duration during
-- quoting and schedule around it.
--
-- estimated_completion_at is GENERATED rather than maintained in application
-- code so it can never drift from its inputs. It keys off started_at once the
-- job actually begins, so a job that starts 20 minutes late reports a ready-by
-- time 20 minutes later without anyone recomputing anything.
--
-- Idempotent — safe to re-run. Apply with: supabase db push (or SQL editor).

-- ── Columns ──────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS estimated_duration_mins INT
    CHECK (estimated_duration_mins IS NULL OR estimated_duration_mins > 0),
  ADD COLUMN IF NOT EXISTS actual_duration_mins INT
    CHECK (actual_duration_mins IS NULL OR actual_duration_mins >= 0);

-- Ready-by time. NULL when we have no duration to work from — an ETC equal to
-- the start time would read as "ready immediately", which is worse than absent.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS estimated_completion_at TIMESTAMPTZ
    GENERATED ALWAYS AS (
      CASE
        WHEN estimated_duration_mins IS NULL THEN NULL
        ELSE COALESCE(started_at, scheduled_at)
             + make_interval(mins => estimated_duration_mins)
      END
    ) STORED;

COMMENT ON COLUMN public.bookings.estimated_duration_mins IS
  'Provider-committed service duration in minutes. Phase 0 backfills this from the services JSONB snapshot; later phases let the provider set it during quoting.';
COMMENT ON COLUMN public.bookings.actual_duration_mins IS
  'Wall-clock minutes from started_at to completed_at, stamped on completion. Feeds duration calibration.';
COMMENT ON COLUMN public.bookings.estimated_completion_at IS
  'Generated ready-by time: (started_at, else scheduled_at) + estimated_duration_mins. NULL when no duration is known.';

-- ── Backfill: duration from the services snapshot ────────────────────────
-- bookings.services is the JSONB snapshot written at booking time; each entry
-- carries the duration_mins of the service package as it was priced. Summing
-- them reproduces what the review screen displayed to the customer, which is
-- the best estimate available for historical rows.
WITH summed AS (
  SELECT b.id,
         SUM(COALESCE((svc ->> 'duration_mins')::INT, 0)) AS total_mins
  FROM public.bookings b
  CROSS JOIN LATERAL jsonb_array_elements(b.services) AS svc
  WHERE jsonb_typeof(b.services) = 'array'
  GROUP BY b.id
)
UPDATE public.bookings b
SET estimated_duration_mins = summed.total_mins
FROM summed
WHERE b.id = summed.id
  AND summed.total_mins > 0
  AND b.estimated_duration_mins IS NULL;

-- ── Backfill: actual duration for already-completed jobs ─────────────────
UPDATE public.bookings
SET actual_duration_mins = GREATEST(
      0,
      ROUND(EXTRACT(EPOCH FROM (completed_at - started_at)) / 60.0)::INT
    )
WHERE actual_duration_mins IS NULL
  AND started_at IS NOT NULL
  AND completed_at IS NOT NULL
  AND completed_at >= started_at;

-- ── Stamp actual duration on completion ──────────────────────────────────
-- Kept in the database rather than the completion handler so it holds for every
-- write path (the app's Complete Job button, the Edge Function's
-- completeAndQueuePayout, and any future ops correction).
CREATE OR REPLACE FUNCTION public.stamp_actual_duration()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL
     AND NEW.started_at IS NOT NULL
     AND NEW.completed_at >= NEW.started_at
     AND NEW.actual_duration_mins IS NULL
  THEN
    NEW.actual_duration_mins := GREATEST(
      0,
      ROUND(EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) / 60.0)::INT
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_actual_duration ON public.bookings;
CREATE TRIGGER trg_stamp_actual_duration
  BEFORE INSERT OR UPDATE OF completed_at, started_at ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_actual_duration();

-- ── Index for the schedule views ─────────────────────────────────────────
-- The provider day view (Phase 1) reads a provider's bookings inside a date
-- window; the ready-by ordering follows scheduled_at.
CREATE INDEX IF NOT EXISTS idx_bookings_provider_scheduled
  ON public.bookings (provider_id, scheduled_at)
  WHERE status IN ('pending_provider_approval', 'confirmed', 'en_route', 'in_progress');
