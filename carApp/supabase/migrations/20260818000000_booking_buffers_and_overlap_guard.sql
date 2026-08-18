-- Phase 1 of the quote-first booking redesign: a booking occupies a real range
-- of the provider's day, and the database refuses to hand the same range to two
-- customers.
--
-- Before: there is no conflict check anywhere in this codebase — not in the
-- client, not in RLS, not in the Edge Functions. `DateTimePicker` accepts any
-- instant after `now`, and nothing consults the provider's existing jobs. Two
-- customers can confirm the same provider for the same minute today. Phase 0
-- gave a booking a duration; this gives it an extent, and makes overlap
-- structurally impossible rather than merely unlikely.
--
-- Three pieces:
--   1. Buffers — a job costs the provider more than its service duration.
--      Travel, setup and pack-up live in buffer_before/buffer_after. There is
--      no routing API in the MVP (Google Maps is out), so these are flat
--      per-provider defaults, snapshotted onto the booking at insert. Distance-
--      aware buffers are post-MVP; the snapshot is what makes that upgrade
--      non-breaking, since historical rows keep the buffers they were booked
--      under.
--   2. occupied_range — a GENERATED tstzrange over [start - before,
--      start + duration + after).
--   3. An EXCLUDE constraint over (provider_id, occupied_range) for the
--      statuses that represent a committed slot.
--
-- Idempotent — safe to re-run. Apply with: supabase db push.

-- ── 0. btree_gist ────────────────────────────────────────────────────────
-- A GiST exclusion constraint can compare occupied_range with && on its own,
-- but provider_id WITH = needs btree semantics inside the same GiST index.
-- That is exactly what btree_gist adds. Supabase keeps extensions in the
-- `extensions` schema, which is on the default search_path for the roles that
-- run migrations; the constraint below resolves gist_uuid_ops from there once,
-- at DDL time, and stores the opclass by OID thereafter.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ── 1. Provider buffer defaults ──────────────────────────────────────────
-- 15 before / 30 after is a starting posture, not a finding: arrive-and-set-up
-- is short, while pack-up plus the drive to the next address is not. Providers
-- tune both in More -> Manage. They are NOT NULL with defaults so the snapshot
-- trigger below always has something concrete to copy.
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS default_buffer_before_mins INT NOT NULL DEFAULT 15
    CHECK (default_buffer_before_mins >= 0 AND default_buffer_before_mins <= 480),
  ADD COLUMN IF NOT EXISTS default_buffer_after_mins INT NOT NULL DEFAULT 30
    CHECK (default_buffer_after_mins >= 0 AND default_buffer_after_mins <= 480);

COMMENT ON COLUMN public.provider_profiles.default_buffer_before_mins IS
  'Minutes reserved before a job starts (arrival, setup). Snapshotted onto each booking at insert.';
COMMENT ON COLUMN public.provider_profiles.default_buffer_after_mins IS
  'Minutes reserved after a job ends (pack-up, travel to the next address). Snapshotted onto each booking at insert. Distance-aware travel time is post-MVP.';

-- ── 2. Booking buffer snapshot columns ───────────────────────────────────
-- Nullable, unlike the provider defaults: NULL is the signal the snapshot
-- trigger looks for. After the trigger runs, every new row carries integers.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS buffer_before_mins INT
    CHECK (buffer_before_mins IS NULL OR buffer_before_mins >= 0),
  ADD COLUMN IF NOT EXISTS buffer_after_mins INT
    CHECK (buffer_after_mins IS NULL OR buffer_after_mins >= 0);

-- Existing rows get 0, NOT the new provider defaults. Those bookings were
-- placed under a no-buffer regime and the parties agreed to those times;
-- retroactively widening them by 45 minutes would invent conflicts that never
-- existed and could block the EXCLUDE constraint below from being created at
-- all. COALESCE keeps this idempotent — a re-run never overwrites a real
-- snapshot.
UPDATE public.bookings
   SET buffer_before_mins = COALESCE(buffer_before_mins, 0),
       buffer_after_mins  = COALESCE(buffer_after_mins, 0)
 WHERE buffer_before_mins IS NULL
    OR buffer_after_mins IS NULL;

COMMENT ON COLUMN public.bookings.buffer_before_mins IS
  'Minutes reserved before scheduled_at, snapshotted from the provider default at insert. Legacy rows are 0.';
COMMENT ON COLUMN public.bookings.buffer_after_mins IS
  'Minutes reserved after the job ends, snapshotted from the provider default at insert. Legacy rows are 0.';

-- ── 3. occupied_range ────────────────────────────────────────────────────
-- Deliberately keyed off scheduled_at, NOT COALESCE(started_at, scheduled_at)
-- the way estimated_completion_at is. They answer different questions and the
-- divergence is the point:
--
--   estimated_completion_at answers "when will this car be ready?", which the
--   customer wants measured from reality — a job that starts 20 minutes late
--   finishes 20 minutes late.
--
--   occupied_range answers "what has this provider committed to?", which is a
--   property of the schedule. Keying it off started_at would make the range
--   move when the provider taps Start Job, so starting two hours late could
--   slide the range into the next booking and make the status transition fail
--   with 23P01 — the provider would be locked out of starting a job they are
--   physically standing in front of. Overruns are Phase 4's cascade
--   (notify, shift, shorten, reschedule); they are not the constraint's job.
--
-- The immutability dance is the same one estimated_completion_at documents:
-- `timestamptz + interval` is only STABLE because an interval carrying month or
-- day parts resolves against the session TimeZone, and generated columns
-- require IMMUTABLE. Converting to UTC first makes every step immutable, and
-- UTC has no DST for the wall-clock addition to trip over. Do not "simplify"
-- this back to a bare `+`.
--
-- Bounds are '[)' — half-open, so a job ending at 11:00 and one starting at
-- 11:00 do not overlap. With a zero duration and zero buffers the range is
-- empty, and an empty range conflicts with nothing; that is the honest reading
-- of "we do not know how long this takes", and new rows avoid it because the
-- provider defaults are non-zero.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS occupied_range TSTZRANGE
    GENERATED ALWAYS AS (
      tstzrange(
        timezone(
          'UTC',
          timezone('UTC', scheduled_at)
            - make_interval(mins => COALESCE(buffer_before_mins, 0))
        ),
        timezone(
          'UTC',
          timezone('UTC', scheduled_at)
            + make_interval(
                mins => COALESCE(estimated_duration_mins, 0)
                        + COALESCE(buffer_after_mins, 0)
              )
        ),
        '[)'
      )
    ) STORED;

COMMENT ON COLUMN public.bookings.occupied_range IS
  'Generated [scheduled_at - buffer_before, scheduled_at + duration + buffer_after). The provider''s committed slot; keyed off scheduled_at, not started_at, so a late start cannot invalidate the schedule.';

-- ── 4. Snapshot the provider's buffers at insert ─────────────────────────
-- Separate from derive_booking_amounts on purpose: that one early-returns for
-- service_role, because Edge Functions and seeds price themselves. Buffers are
-- not a price — an Edge-Function-created booking occupies the provider's day
-- exactly as much as an app-created one, so this runs for every writer and only
-- fills in what the caller left NULL.
--
-- SECURITY INVOKER (the default). Unlike enforce_booking_status_transition and
-- derive_booking_amounts, this reads no current_user and makes no trust
-- decision, so there is nothing for DEFINER rights to silently disable. Under
-- invoker rights "provider_profiles: read approved" already exposes the two
-- integers to any customer who can book the provider at all.
CREATE OR REPLACE FUNCTION public.snapshot_booking_buffers()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.buffer_before_mins IS NOT NULL AND NEW.buffer_after_mins IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NEW.buffer_before_mins, pp.default_buffer_before_mins),
         COALESCE(NEW.buffer_after_mins,  pp.default_buffer_after_mins)
    INTO NEW.buffer_before_mins, NEW.buffer_after_mins
    FROM public.provider_profiles pp
   WHERE pp.id = NEW.provider_id;

  -- No provider row, or none visible to this caller: occupy the stated time and
  -- nothing more. SELECT ... INTO leaves both NULL when it finds no row, so
  -- this is also what runs for a booking with a NULL provider_id.
  NEW.buffer_before_mins := COALESCE(NEW.buffer_before_mins, 0);
  NEW.buffer_after_mins  := COALESCE(NEW.buffer_after_mins, 0);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.snapshot_booking_buffers() IS
  'Copies the provider''s default buffers onto a new booking when the caller did not state them, freezing them for the life of the row.';

DROP TRIGGER IF EXISTS trg_snapshot_booking_buffers ON public.bookings;
CREATE TRIGGER trg_snapshot_booking_buffers
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_booking_buffers();

-- ── 5. The overlap guard ─────────────────────────────────────────────────
-- Only committed statuses participate. pending and pending_provider_approval
-- are deliberately excluded: several customers may request the same window and
-- the first accept wins (spec §7). The guard therefore bites at the moment of
-- acceptance, which is where the commitment is actually made.
--
-- ADD CONSTRAINT has no IF NOT EXISTS, hence the catalog check. The pre-scan
-- exists because a bare failure here is illegible: Postgres reports only the
-- one row it could not insert, and on an already-overlapping table that names
-- an arbitrary victim rather than the actual double-bookings. Anything it finds
-- is a real double-booking that exists in production right now — the bug this
-- constraint prevents, already committed — and a human has to decide which
-- customer keeps the slot.
DO $$
DECLARE
  conflict_list TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bookings_no_provider_overlap'
       AND conrelid = 'public.bookings'::regclass
  ) THEN
    RAISE NOTICE 'bookings_no_provider_overlap already present, skipping';
    RETURN;
  END IF;

  SELECT string_agg(
           format('  provider %s: %s (%s) overlaps %s (%s)',
                  a.provider_id, a.id, a.status, b.id, b.status),
           E'\n' ORDER BY a.provider_id, a.id)
    INTO conflict_list
    FROM public.bookings a
    JOIN public.bookings b
      ON b.provider_id = a.provider_id
     AND b.id > a.id
     AND b.occupied_range && a.occupied_range
   WHERE a.status IN ('confirmed', 'en_route', 'in_progress')
     AND b.status IN ('confirmed', 'en_route', 'in_progress');

  IF conflict_list IS NOT NULL THEN
    RAISE EXCEPTION E'Existing bookings already overlap; cannot add bookings_no_provider_overlap:\n%', conflict_list
      USING HINT = 'These are live double-bookings. Cancel or reschedule one side of each pair, then re-run this migration.';
  END IF;

  EXECUTE $ddl$
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_no_provider_overlap
      EXCLUDE USING gist (
        provider_id WITH =,
        occupied_range WITH &&
      ) WHERE (status IN ('confirmed', 'en_route', 'in_progress'))
  $ddl$;
END $$;

COMMENT ON CONSTRAINT bookings_no_provider_overlap ON public.bookings IS
  'A provider cannot hold two committed bookings whose occupied ranges overlap. Raises 23P01; the client surfaces it as "That time was just taken."';

-- ── 6. Nothing to grant ──────────────────────────────────────────────────
-- Stated explicitly because it is easy to add a column and assume the client
-- can use it. 20260817140000 replaced the blanket INSERT/UPDATE privileges on
-- bookings with explicit column allowlists, so buffer_before_mins,
-- buffer_after_mins and occupied_range are unwritable by anon and authenticated
-- the moment they exist, with no REVOKE needed. The client's write surface is
-- unchanged by this migration: it still cannot state a price, and it now also
-- cannot state how much of a provider's day it takes. The buffers come from the
-- provider's own defaults and the range is generated from them.
