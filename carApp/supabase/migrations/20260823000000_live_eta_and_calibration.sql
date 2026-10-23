-- 20260823000000_live_eta_and_calibration.sql
--
-- Phase 4 of the quote-first booking redesign (Blueprint/quote_first_booking.md
-- §3 "Job day", §7, §8): live ETC, the overrun cascade, early finish and
-- calibration reporting.
--
--   1. running_late_mins — how far behind the agreed plan the provider says a
--      job is. Server-only, written by stripe-webhook's report_delay
--   2. estimated_completion_at includes it, so every reader of the ready-by
--      time (both booking screens, the notify functions) follows the delay
--      without being taught about it
--   3. Starting the job clears it: started_at records the real start, so a
--      delay declared on the way there is already inside the new ETC
--   4. eta_notified_* — what the customer was last told, so a burst of
--      reports does not become a burst of pushes
--   5. bookings joins the Realtime publication, so the customer's screen
--      follows the provider's reports live
--   6. get_duration_calibration() — suggested vs committed vs actual
--      duration, late starts, and quoted vs advertised price, per provider
--   7. The provider timezone check stops scanning pg_timezone_names
--
-- Deliberately NOT changed: occupied_range. It stays keyed off scheduled_at and
-- estimated_duration_mins (20260818000000 explains why). A delay is news for
-- the customer, not a change to what the provider committed to, so reporting
-- one can never fail on the overlap guard. Moving a job is still a proposal
-- (propose_reschedule), and the knock-on for later jobs is planned and
-- communicated by report_delay rather than written into anybody's slot.
--
-- Idempotent — safe to re-run.

-- ── 1. Columns ───────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS running_late_mins INT NOT NULL DEFAULT 0;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS eta_notified_at TIMESTAMPTZ;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS eta_notified_completion_at TIMESTAMPTZ;

DO $$
BEGIN
  -- Twelve hours matches the longest job a quote may commit to
  -- (MAX_QUOTE_DURATION_MINS). A delay longer than that is a reschedule, and
  -- the app offers one instead.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_running_late_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_running_late_check
      CHECK (running_late_mins BETWEEN 0 AND 720);
  END IF;

  -- Both or neither: a notification time with no ETA to compare the next
  -- report against would make every later report look material.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_eta_notified_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_eta_notified_check CHECK (
        (eta_notified_at IS NULL) = (eta_notified_completion_at IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.bookings.running_late_mins IS
  'Minutes behind the agreed plan, as reported by the provider (report_delay). Before the job starts it delays the expected arrival; after, the finish. Cleared when started_at is set. Service-role writable only.';
COMMENT ON COLUMN public.bookings.eta_notified_at IS
  'When the customer was last pushed an ETA change. Paired with eta_notified_completion_at for the materiality and dedupe rules in _shared/eta.ts.';
COMMENT ON COLUMN public.bookings.eta_notified_completion_at IS
  'The ready-by time the customer was last told about. NULL until the first ETA push; the planned ready-by is the baseline until then.';

-- ── 2. The ready-by time follows the delay ───────────────────────────────
-- PG 17's SET EXPRESSION, so the column keeps its position and its dependants.
-- Same immutability dance as 20260817000000 (convert to UTC, add, convert
-- back): `timestamptz + interval` is only STABLE. Do not "simplify" it.
--
-- Recomputed only when the stored expression does not already mention the
-- delay: SET EXPRESSION rewrites the table, and a re-run should not.
DO $$
DECLARE
  current_expr TEXT;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO current_expr
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.bookings'::regclass
     AND a.attname = 'estimated_completion_at';

  IF current_expr IS NOT NULL AND current_expr LIKE '%running_late_mins%' THEN
    RETURN;
  END IF;

  ALTER TABLE public.bookings
    ALTER COLUMN estimated_completion_at SET EXPRESSION AS (
      CASE
        WHEN estimated_duration_mins IS NULL THEN NULL
        ELSE timezone(
               'UTC',
               timezone('UTC', COALESCE(started_at, scheduled_at))
                 + make_interval(mins => estimated_duration_mins + running_late_mins)
             )
      END
    );
END $$;

COMMENT ON COLUMN public.bookings.estimated_completion_at IS
  'Generated ready-by time: (started_at, else scheduled_at) + estimated_duration_mins + running_late_mins. NULL when no duration is known.';

-- ── 3. Starting the job clears the delay ─────────────────────────────────
-- A delay reported on the way ("running 30 minutes late") is about the start.
-- Once started_at is set it records the real start, which already contains
-- that delay; keeping running_late_mins would count it twice. A delay reported
-- after the start is about the finish, and stays until completion.
--
-- The client's UPDATE never names running_late_mins (it is not granted), and
-- does not need to: column privileges are checked against the statement's SET
-- list, not against what a trigger changes on NEW.
--
-- SECURITY INVOKER, like every guard here, though this one makes no trust
-- decision: anyone allowed to set started_at may have the delay cleared.
CREATE OR REPLACE FUNCTION public.reset_running_late_on_start()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF OLD.started_at IS NULL AND NEW.started_at IS NOT NULL THEN
    NEW.running_late_mins := 0;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reset_running_late_on_start() IS
  'Clears running_late_mins when the job starts: started_at then carries any delay to the start, and the generated ETC would otherwise count it twice.';

DROP TRIGGER IF EXISTS trg_reset_running_late_on_start ON public.bookings;
CREATE TRIGGER trg_reset_running_late_on_start
  BEFORE UPDATE OF started_at ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_running_late_on_start();

-- ── 4. The client's write surface ────────────────────────────────────────
-- None of the new columns is granted. Stated rather than relied upon, because
-- GRANT is additive and a later convenience grant would undo it silently. A
-- delay is a statement to the customer about the provider's day; it goes
-- through report_delay, which checks that the provider is the one saying it.
REVOKE INSERT (running_late_mins, eta_notified_at, eta_notified_completion_at)
  ON public.bookings FROM anon, authenticated;
REVOKE UPDATE (running_late_mins, eta_notified_at, eta_notified_completion_at)
  ON public.bookings FROM anon, authenticated;

-- ── 5. Realtime ──────────────────────────────────────────────────────────
-- The customer's booking screen subscribes to its own row (channel
-- booking:{id}) so a reported delay, a start or a completion shows up without
-- a refresh. postgres_changes applies the subscriber's RLS, so "bookings: read
-- own" decides who hears about which row, exactly as it decides who can read
-- it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'bookings'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;

-- ── 6. Calibration reporting ─────────────────────────────────────────────
-- §2 dropped the price cap in favour of "monitoring quoted-vs-advertised ratio
-- in reporting", and suggested_duration_mins was added (20260820000000) for
-- calibration. This is that report: per provider, over jobs scheduled since
-- p_since,
--   • durations — what the engine suggested, what the provider committed to
--     and what it took, on completed jobs that carry all of it
--   • late starts — started_at against scheduled_at
--   • quotes — the surcharge itemised on top of the advertised price
--
-- The advertised price is recovered from the row itself: quoted_total_amount
-- is the derived base plus the line items (submit_quote, respond_adjustment),
-- so subtracting the items gives the price the provider's menu showed.
--
-- SECURITY DEFINER because admins have no read policy on bookings and a
-- provider's report needs only aggregates. The WHERE clause is the guard: an
-- admin (is_admin) sees every provider, a provider sees their own profile, and
-- anyone else sees nothing.
CREATE OR REPLACE FUNCTION public.get_duration_calibration(
  p_since TIMESTAMPTZ DEFAULT now() - INTERVAL '90 days'
)
  RETURNS TABLE (
    provider_id            UUID,
    provider_name          TEXT,
    completed_jobs         INT,
    timed_jobs             INT,
    avg_suggested_mins     NUMERIC,
    avg_estimated_mins     NUMERIC,
    avg_actual_mins        NUMERIC,
    avg_overrun_mins       NUMERIC,
    within_estimate_jobs   INT,
    over_estimate_jobs     INT,
    under_estimate_jobs    INT,
    late_start_jobs        INT,
    avg_start_delay_mins   NUMERIC,
    quoted_jobs            INT,
    surcharged_jobs        INT,
    avg_quote_markup_pct   NUMERIC,
    max_quote_markup_pct   NUMERIC
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  WITH visible AS (
    SELECT b.*
      FROM public.bookings b
      JOIN public.provider_profiles pp ON pp.id = b.provider_id
     WHERE b.scheduled_at >= p_since
       AND (public.is_admin(auth.uid()) OR pp.user_id = auth.uid())
  ),
  measured AS (
    SELECT v.provider_id,
           v.status,
           v.suggested_duration_mins,
           v.estimated_duration_mins,
           v.actual_duration_mins,
           v.quoted_total_amount,
           -- Minutes late to start; NULL when the job never started.
           CASE WHEN v.started_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (v.started_at - v.scheduled_at)) / 60.0
           END AS start_delay_mins,
           -- The completed job's overrun against what the provider committed.
           CASE WHEN v.status = 'completed'
                 AND v.actual_duration_mins IS NOT NULL
                 AND v.estimated_duration_mins IS NOT NULL
                THEN v.actual_duration_mins - v.estimated_duration_mins
           END AS overrun_mins,
           s.surcharge
      FROM visible v
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM((li ->> 'amount_cents')::NUMERIC), 0) / 100 AS surcharge
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(v.quote_line_items) = 'array'
                      THEN v.quote_line_items ELSE '[]'::JSONB END
               ) AS li
      ) s ON TRUE
  ),
  quoted AS (
    SELECT m.*,
           CASE WHEN m.quoted_total_amount IS NOT NULL
                 AND m.quoted_total_amount - m.surcharge > 0
                THEN m.surcharge / (m.quoted_total_amount - m.surcharge) * 100
           END AS markup_pct
      FROM measured m
  )
  SELECT q.provider_id,
         u.full_name::TEXT,
         (count(*) FILTER (WHERE q.status = 'completed'))::INT,
         (count(*) FILTER (WHERE q.overrun_mins IS NOT NULL))::INT,
         round(avg(q.suggested_duration_mins) FILTER (WHERE q.overrun_mins IS NOT NULL), 1),
         round(avg(q.estimated_duration_mins) FILTER (WHERE q.overrun_mins IS NOT NULL), 1),
         round(avg(q.actual_duration_mins) FILTER (WHERE q.overrun_mins IS NOT NULL), 1),
         round(avg(q.overrun_mins), 1),
         -- 15 minutes either way: the same materiality threshold the ETA
         -- notifications use (ETA_MATERIALITY_MINS).
         (count(*) FILTER (WHERE abs(q.overrun_mins) <= 15))::INT,
         (count(*) FILTER (WHERE q.overrun_mins > 15))::INT,
         (count(*) FILTER (WHERE q.overrun_mins < -15))::INT,
         (count(*) FILTER (WHERE q.start_delay_mins > 15))::INT,
         round(avg(q.start_delay_mins)::NUMERIC, 1),
         (count(*) FILTER (WHERE q.markup_pct IS NOT NULL))::INT,
         (count(*) FILTER (WHERE q.markup_pct > 0))::INT,
         round(avg(q.markup_pct), 1),
         round(max(q.markup_pct), 1)
    FROM quoted q
    JOIN public.provider_profiles pp ON pp.id = q.provider_id
    LEFT JOIN public.users u ON u.id = pp.user_id
   GROUP BY q.provider_id, u.full_name
   ORDER BY u.full_name NULLS LAST, q.provider_id;
$$;

COMMENT ON FUNCTION public.get_duration_calibration(TIMESTAMPTZ) IS
  'Per-provider calibration over jobs scheduled since p_since: suggested vs committed vs actual duration, late starts, and quoted vs advertised price. Admins see every provider, a provider sees only their own.';

REVOKE ALL ON FUNCTION public.get_duration_calibration(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_duration_calibration(TIMESTAMPTZ) TO authenticated;

-- ── 7. A timezone check that does not scan the catalog ───────────────────
-- validate_provider_schedule checked NEW.timezone against pg_timezone_names,
-- which reads every zone file on disk: 835 ms on a healthy instance on
-- 2026-10-12, and 17 to 100+ seconds on the starved one in September — past
-- the authenticated role's statement_timeout, so saving working hours from
-- More -> Manage could simply fail.
--
-- AT TIME ZONE resolves one name and raises 22023 for an unknown one. On its
-- own it is looser than the catalog, because it also accepts abbreviations
-- (PDT) and POSIX offsets (+05), which are fixed offsets and would silently
-- ignore DST. The shape check keeps it to IANA Area/Location names (and UTC),
-- which is what TimezoneField offers.
--
-- Everything below the timezone check is unchanged from 20260819000000.
CREATE OR REPLACE FUNCTION public.validate_provider_schedule()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public, pg_catalog
AS $$
DECLARE
  day_key TEXT;
  win     JSONB;
  zone_ok BOOLEAN := FALSE;
BEGIN
  IF NEW.timezone IS NOT NULL
     AND (NEW.timezone = 'UTC'
          OR NEW.timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$')
  THEN
    BEGIN
      PERFORM now() AT TIME ZONE NEW.timezone;
      zone_ok := TRUE;
    EXCEPTION WHEN invalid_parameter_value THEN
      zone_ok := FALSE;
    END;
  END IF;

  IF NOT zone_ok THEN
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
  'Rejects an unknown or non-IANA timezone or a malformed working_hours object, so every reader can trust the stored shape. Resolves the one zone with AT TIME ZONE rather than scanning pg_timezone_names.';
