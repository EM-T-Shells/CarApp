-- Phase 1, second half: give a provider a real calendar.
--
-- Before: provider_profiles.availability is a weekly {mon: true, …} boolean map
-- that app/(provider)/profile.tsx writes and **nothing ever reads**. It cannot
-- say when a day starts or ends, so nothing can answer "is 7pm on a Tuesday
-- bookable?" — and there is no way at all to say "I'm away next week".
--
-- This adds:
--   1. provider_profiles.timezone — required before working hours mean
--      anything, because they are wall-clock and DST would silently shift them.
--   2. provider_profiles.working_hours — real per-day windows, backfilled from
--      the day booleans so no provider loses what they already set.
--   3. provider_profiles.max_jobs_per_day — a volume ceiling independent of
--      clock time (spec §4).
--   4. provider_time_off — one-off blocks, with the same EXCLUDE treatment
--      bookings got in 20260818000000.
--
-- Deliberately NOT enforced: a booking outside working hours or inside a
-- time-off block is not refused. Working hours are the provider's stated
-- preference, not a database invariant — 26 existing bookings predate them, and
-- refusing on a preference would turn a scheduling hint into an outage. Phase
-- 1's DayTimeline surfaces the conflict and the provider decides; the EXCLUDE
-- constraint stays reserved for the one thing that is genuinely impossible
-- (two jobs at once).
--
-- Idempotent — safe to re-run.

-- ── 1. Timezone ──────────────────────────────────────────────────────────
-- Not nullable and not "figure it out from the coordinates". Working hours are
-- wall-clock: "I work 8-6" means 8am local, and local is a different UTC offset
-- in March than in January. Without this column every working-hours comparison
-- would be right for half the year. The default matches the launch market
-- (Northern Virginia / DC Metro).
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

-- ── 2. Working hours ─────────────────────────────────────────────────────
-- Shape: { "mon": [{"start":"08:00","end":"18:00"}], "sat": [] }
--
-- An array per day rather than one window, because a split day is real — a
-- detailer who breaks for lunch, or works mornings and evenings. An empty array
-- means closed; a missing key also means closed, so a partial object is legal
-- and the client only sends the days it wants open.
--
-- Times are local wall-clock strings, deliberately not timestamps: "08:00"
-- survives a DST boundary and a stored offset does not.
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS working_hours JSONB;

-- A ceiling on volume rather than clock time. NULL means no limit, which is the
-- current behaviour, so this changes nothing until a provider sets it.
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS max_jobs_per_day INT
    CHECK (max_jobs_per_day IS NULL OR max_jobs_per_day > 0);

COMMENT ON COLUMN public.provider_profiles.timezone IS
  'IANA timezone the provider works in. Working hours are wall-clock and are meaningless without it.';
COMMENT ON COLUMN public.provider_profiles.working_hours IS
  'Per-day local windows: {"mon":[{"start":"08:00","end":"18:00"}],"sat":[]}. Empty or missing day = closed. Supersedes the availability boolean map, which is kept for older clients.';
COMMENT ON COLUMN public.provider_profiles.max_jobs_per_day IS
  'Optional ceiling on jobs accepted per local day. NULL = no limit.';

-- ── 3. Validation ────────────────────────────────────────────────────────
-- A CHECK constraint cannot do either of these: the timezone list lives in a
-- catalog view, and the working_hours shape needs iteration. A BEFORE trigger
-- can, and it fails the write rather than storing something the app will later
-- have to defend against on every read.
--
-- SECURITY INVOKER (the default). It reads no current_user and makes no trust
-- decision — unlike enforce_booking_status_transition and
-- derive_booking_amounts, there is nothing here for DEFINER rights to silently
-- disable. pg_timezone_names is world-readable.
CREATE OR REPLACE FUNCTION public.validate_provider_schedule()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
AS $$
DECLARE
  day_key TEXT;
  win     JSONB;
BEGIN
  IF NEW.timezone IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone)
  THEN
    RAISE EXCEPTION 'Unknown timezone: %', COALESCE(NEW.timezone, '(null)')
      USING ERRCODE = '22023',
            HINT = 'Use an IANA name such as America/New_York.';
  END IF;

  IF NEW.working_hours IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.working_hours) <> 'object' THEN
    RAISE EXCEPTION 'working_hours must be an object keyed by day'
      USING ERRCODE = '22023';
  END IF;

  FOR day_key IN SELECT jsonb_object_keys(NEW.working_hours) LOOP
    IF day_key NOT IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') THEN
      RAISE EXCEPTION 'working_hours has an unknown day key: %', day_key
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(NEW.working_hours -> day_key) <> 'array' THEN
      RAISE EXCEPTION 'working_hours.% must be an array of windows', day_key
        USING ERRCODE = '22023';
    END IF;

    FOR win IN SELECT jsonb_array_elements(NEW.working_hours -> day_key) LOOP
      IF (win ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR (win ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      THEN
        RAISE EXCEPTION
          'working_hours.% needs HH:MM start and end, got %', day_key, win
          USING ERRCODE = '22023';
      END IF;

      -- Zero-padded HH:MM sorts correctly as text, so this needs no casting.
      IF (win ->> 'end') <= (win ->> 'start') THEN
        RAISE EXCEPTION
          'working_hours.% window ends before it starts: %', day_key, win
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_provider_schedule() IS
  'Rejects an unknown IANA timezone or a malformed working_hours object, so every reader can trust the stored shape.';

DROP TRIGGER IF EXISTS trg_validate_provider_schedule ON public.provider_profiles;
CREATE TRIGGER trg_validate_provider_schedule
  BEFORE INSERT OR UPDATE OF timezone, working_hours ON public.provider_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_provider_schedule();

-- ── 4. Backfill working hours from the day booleans ──────────────────────
-- The fallback mirrors availabilityFromJson() in
-- src/components/provider/AvailabilityCalendar.tsx exactly: a NULL availability
-- means "not set", and the picker has always rendered that as weekdays-on,
-- weekend-off. Backfilling NULL to "closed all week" would silently take every
-- such provider off the calendar. 08:00-18:00 is the working default the
-- booleans never carried; providers narrow it from More -> Manage.
UPDATE public.provider_profiles p
   SET working_hours = (
     SELECT jsonb_object_agg(
              d.key,
              CASE
                WHEN COALESCE((p.availability ->> d.key)::BOOLEAN, d.default_open)
                THEN jsonb_build_array(
                       jsonb_build_object('start', '08:00', 'end', '18:00'))
                ELSE '[]'::JSONB
              END)
       FROM (VALUES
               ('mon', TRUE), ('tue', TRUE), ('wed', TRUE), ('thu', TRUE),
               ('fri', TRUE), ('sat', FALSE), ('sun', FALSE)
            ) AS d(key, default_open)
   )
 WHERE p.working_hours IS NULL;

-- ── 5. Time off ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.provider_profiles(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT provider_time_off_ends_after_start CHECK (ends_at > starts_at),
  -- Same generated-range shape as bookings.occupied_range, so both sides of a
  -- conflict check speak the same language. No timezone dance is needed here:
  -- these are absolute instants the provider picked, not wall-clock rules.
  blocked_range TSTZRANGE GENERATED ALWAYS AS (
    tstzrange(starts_at, ends_at, '[)')
  ) STORED
);

COMMENT ON TABLE public.provider_time_off IS
  'One-off blocks on a provider''s calendar. Advisory in Phase 1 — surfaced by DayTimeline, not enforced against bookings.';

-- Overlapping time-off rows are always a mistake (a duplicate submit, a double
-- tap), never a meaningful state. Cheap to forbid now that btree_gist is
-- installed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_time_off_no_overlap'
       AND conrelid = 'public.provider_time_off'::regclass
  ) THEN
    EXECUTE $ddl$
      ALTER TABLE public.provider_time_off
        ADD CONSTRAINT provider_time_off_no_overlap
        EXCLUDE USING gist (provider_id WITH =, blocked_range WITH &&)
    $ddl$;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_provider_time_off_provider_range
  ON public.provider_time_off USING gist (provider_id, blocked_range);

ALTER TABLE public.provider_time_off ENABLE ROW LEVEL SECURITY;

-- Provider-only for now. The customer-facing availability query
-- (getAvailableWindows, spec §5) arrives with ArrivalWindowPicker in Phase 3
-- and will need its own read path — one that does NOT expose `reason`, which is
-- the provider's private note and can say things like "surgery".
DROP POLICY IF EXISTS "provider_time_off: manage own" ON public.provider_time_off;
CREATE POLICY "provider_time_off: manage own" ON public.provider_time_off
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.provider_profiles pp
       WHERE pp.id = provider_time_off.provider_id
         AND pp.user_id = auth.uid()
    )
  );

-- ── 6. Column allowlists ─────────────────────────────────────────────────
-- Supabase's default privileges grant ALL on every new public table to anon and
-- authenticated, so a fresh table starts wide open on columns. Narrowing it
-- here rather than later is the whole lesson of 20260818120000.
REVOKE INSERT, UPDATE, DELETE ON public.provider_time_off FROM anon, authenticated;
GRANT INSERT (id, provider_id, starts_at, ends_at, reason)
  ON public.provider_time_off TO authenticated;
GRANT UPDATE (starts_at, ends_at, reason)
  ON public.provider_time_off TO authenticated;
-- DELETE is granted: cancelling time off is a normal provider action, and the
-- row is nothing else's FK target. (Contrast provider_profiles, where DELETE
-- would orphan a job history.)
GRANT DELETE ON public.provider_time_off TO authenticated;

-- provider_id is INSERT-only. The policy's WITH CHECK already pins it to a
-- profile the caller owns, so re-pointing an existing block at another provider
-- would fail anyway — but leaving it out of UPDATE means it fails at the
-- privilege layer, which does not depend on the policy staying correct.

-- Extend the provider_profiles allowlist from 20260818120000 with the three
-- new columns. GRANT is additive, so the existing list is untouched.
GRANT UPDATE (
  timezone,
  working_hours,
  max_jobs_per_day
) ON public.provider_profiles TO authenticated;
