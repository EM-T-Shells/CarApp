# Quote-First Booking — Design Spec & Implementation Plan

**Status:** design closed, implementation started
**Branch:** `feature/quote-first-booking` (off `dev`)
**Last updated:** 2026-08-17

---

## 1. Problem

The current booking model can't express a variable-length job. A professional
detailer's real workflow is: *request photos → assess the vehicle → block a
slot sized to the work → tell the customer when the car will be ready.* Larger
vehicles and family cars take materially longer — an interior detail ranges from
1 to 3 hours.

What the code actually does today (observed, not inferred):

- `bookings.scheduled_at` is a single `TIMESTAMPTZ` with **no duration and no
  end**. A booking occupies zero time.
- `service_packages.duration_mins` exists but is **display-only** — summed in
  `selectEstimatedDuration` (`src/state/bookingDraft.ts`), shown on the review
  card, then discarded. It never reaches the booking row.
- The customer picks an arbitrary instant via a raw native picker
  (`src/components/booking/DateTimePicker.tsx`, `minimumDate = now`). There is
  **no slot grid, no availability query, and no conflict check anywhere.**
- `provider_profiles.availability` is a weekly `{mon: true, …}` boolean map that
  `app/(provider)/profile.tsx` writes and **nothing ever reads.**
- The provider's only lever is binary Accept/Decline inside a 2-hour window.
- `bookings.package_id` exists and is **dead** — `insertBooking` never sets it.
- `vehicles` has no size class and no condition fields.
- `booking_photos.photo_type` is `CHECK IN ('before','after')`, FKs to a
  booking, and its RLS INSERT policy is **provider-only** — so a customer
  cannot attach a photo to anything, ever. Pre-booking photos are structurally
  impossible.
- The 15% deposit is captured **before** the provider sees the job;
  `captureBalance` computes `total_amount − deposit_amount`, so any re-quote
  silently breaks the deposit math.

---

## 2. Locked product decisions

| Decision | Outcome |
|---|---|
| Time input | Customer picks a **day + arrival window**; provider sets the exact start inside it |
| Duration | Provider owns it — system suggests from modifiers, provider adjusts |
| Pricing | Provider quotes. **No cap.** Itemization mandatory |
| Charging | **Nothing charged until the customer approves the final price** |
| Card collection | Saved at request (SetupIntent — no hold, no charge); deposit charges at approval; balance at completion |
| Expiry timers | **None**, either side. Cancel-from-either-end is the release valve |
| Overruns | Notify affected customers above a ~15 min materiality threshold; provider chooses shift / shorten / reschedule |
| Fan-out to other providers | **Deferred.** One provider at a time |
| Legacy rows | Left as-is. Old statuses stay valid in the CHECK constraint |

### Rejected along the way, and why

- **Price cap (was 20%).** Dropped — mandatory customer review of the final
  price already provides the protection, and a cap made genuinely heavy jobs
  unquotable. Replaced by: itemization + monitoring quoted-vs-advertised ratio
  in reporting.
- **Manual-capture PaymentIntent.** Was recommended while capture happened
  unattended; once the customer taps approve at the moment of charge there is
  nothing to guarantee in advance, and with no expiry the window is unbounded
  (card auths die at ~7 days). SetupIntent is correct instead.
- **Quote/response deadlines.** Dropped per above.

---

## 3. Target workflow

```
pending_provider_quote → pending_customer_approval → confirmed
  → en_route → in_progress → completed
```

**Customer request (no charge).** Package tier (+ add-ons) → vehicle with
`size_class` pre-filled and confirmable → 3 condition questions (soil level,
kids/pets, stains/smoke/pet hair) → guided photo upload → day + arrival window
→ card saved, explicitly labelled *"you won't be charged until you approve your
final price."*

**Provider quote.** Request card leads with the photos. App suggests a duration
(`package base + size modifier + condition modifiers + add-ons`) which the
provider overrides with a stepper. Day timeline shows existing jobs with
buffers and highlights conflicts; provider places the start inside the
customer's window. Optional itemized surcharges. Send quote.

**Confirmation.** Customer sees final price, start time, and ready-by time, with
any surcharge itemized ("SUV +$30, heavy pet hair +$25"). Taps Approve →
**deposit charges here** (15% of final) → `confirmed`.

**Job day.** Ready-by recalculates from real `started_at`. Provider has
+15/+30/+60 "running late" and "finished early" controls. Completion stamps
`actual_duration_mins`, charges the 85% balance, queues payout.

Buffers: a booking occupies `[start − buffer_before, start + duration +
buffer_after]`. Travel time lives in `buffer_after` — there is no routing API
(Google Maps is out for MVP), so distance-aware buffers are post-MVP.

---

## 4. Schema changes

### `bookings`
```
requested_window_start / requested_window_end  TIMESTAMPTZ
suggested_duration_mins                       INT   -- engine proposal (calibration)
estimated_duration_mins                       INT   -- provider commitment
actual_duration_mins                          INT   -- stamped on completion
estimated_completion_at                       TIMESTAMPTZ GENERATED
buffer_before_mins / buffer_after_mins        INT   -- snapshot at accept
vehicle_size_class                            VARCHAR
condition_answers                             JSONB
quote_line_items                              JSONB
quoted_total_amount                           NUMERIC(10,2)
occupied_range                                tstzrange GENERATED
```
Stop stamping `approval_expires_at` — the existing sweep then no-ops on its own
(its query requires a non-null value), so no code is removed.

**Overlap prevention** — `btree_gist` + `EXCLUDE USING gist (provider_id WITH =,
occupied_range WITH &&) WHERE status IN ('confirmed','en_route','in_progress')`.
Double-booking becomes impossible at the DB level regardless of client
behaviour. Surface `23P01` as *"That time was just taken."*

### `provider_profiles`
`default_buffer_before_mins`, `default_buffer_after_mins`, `max_jobs_per_day`,
`timezone` (required — working hours are local wall-clock and break across DST
without it), `working_hours JSONB` upgrading the day-booleans to real windows.
Extend `availabilityFromJson()` to read both shapes.

### `service_packages`
`duration_min_mins`, `duration_max_mins` (so a package advertises "2–3 hrs"),
`tier`, `parent_package_id` for add-ons.

⚠️ Note: migration `20260725200513` **retired the `'addon'` category** from
`service_catalog`, folding add-ons into the provider type's primary category.
`service_packages.category` still allows `'addon'`. Reconcile before building
the add-on model.

### New tables
- `service_duration_modifiers` — provider-owned `(factor_type, factor_value,
  delta_mins, delta_price)`; drives the suggestion engine.
- `provider_time_off` — one-off blocks.

### `vehicles`
`size_class VARCHAR CHECK IN ('compact','sedan','suv','truck','van','oversized')`

### `booking_photos`
Extend `photo_type` to `('intake','before','after')` and add a **customer**
INSERT policy for `'intake'` only. Intake photos attach to the
`pending_provider_quote` row, which reuses the existing
`booking-photos/{bookingId}/` bucket path and both storage policies unchanged.

### Security fix (do this before providers can set prices)
`"bookings: update own"` is `FOR UPDATE` with **no column restriction** — either
party can currently write `total_amount`, `provider_payout`, or `status`
directly. Tighten to a column allowlist, or route all state/price writes through
the Edge Function.

---

## 5. API changes

**Payments.** SetupIntent at request (validates card, no hold).
`create_deposit_intent` moves from request time to post-approval and charges
off-session against the saved card so approval is one tap. `captureBalance` is
unchanged.

**New `stripe-webhook` actions:** `submit_quote`, `accept_quote`,
`request_more_photos`, `adjust_job_duration`, `propose_reschedule` /
`respond_reschedule`. Follow the existing guarded-transition pattern
(`.eq('status', …)` + 409 on mismatch) used by `acceptBooking`.

**New queries:** `getProviderDaySchedule(providerId, date)`,
`getAvailableWindows(providerId, dateRange, durationMins)`.

**New notifications:** `notify-quote-ready`, `notify-eta-changed` (needs a
dedupe window and the ~15 min materiality threshold).

**Cancellation policy interaction:** the $15/$25 24h rules key off
`scheduled_at`. They must fire only for `confirmed`+ bookings — cancelling an
unapproved request is free and is just a status change, with no deposit to
deduct from.

---

## 6. UI changes

**Customer** — `PackageSelector` (tiers + add-ons, shows a *range* not a single
price), `VehicleConditionForm`, `IntakePhotoUploader`, `ArrivalWindowPicker`
replacing `DateTimePicker`, a quote review screen with itemized pricing, and
"ready by ~11:45" on booking detail.

**Provider** — a Requests section in `app/(provider-tabs)/jobs/index.tsx`;
`QuoteBuilder` (photo strip + `DurationAdjuster` stepper + `DayTimeline` with
buffers and conflict highlighting + surcharge entry); running-late / finished-
early controls on the active job; buffers, working hours and duration modifiers
in More → Manage.

---

## 7. Edge cases

- Two customers requesting the same window — EXCLUDE constraint decides; first
  accept wins.
- Provider's duration overlaps his next job — show the collision before Accept.
- Job finishes early — release the buffer, **offer** the next customer an
  earlier slot, never auto-move them.
- Photos unusable — `request_more_photos` → `awaiting_customer_info`.
- Vehicle worse than declared on arrival — `adjust_job_duration` + price delta
  requiring in-app customer approval before capture.
- DST / timezones — `scheduled_at` is `timestamptz` (correct), but working hours
  are wall-clock and need `provider_profiles.timezone`.
- Stalled requests — no expiry; either side cancels. Provider queue needs an age
  label ("waiting 2 days").
- Bait pricing — not capped; monitor quoted-vs-advertised ratio in reporting and
  surface "this is above the $180–$240 Marcus lists" on the customer's screen.

---

## 8. Phase plan

| Phase | Scope | Risk |
|---|---|---|
| **0** | Duration columns + backfill + "ready by" display. No flow change | Low |
| **1** | Buffers, working hours, timezone, time-off, DayTimeline, EXCLUDE constraint, RLS tightening | Low–med |
| **2** | Intake photos, vehicle size, condition questions, modifier table, suggestion engine | Medium |
| **3** | Quote statuses, ArrivalWindowPicker, QuoteBuilder, payment resequencing | Highest |
| **4** | Live ETC, overrun cascade, early-finish, calibration reporting | Medium |

Each phase carries adjacent Jest tests plus Maestro flows in `carApp/e2e/`.
Phase 1's EXCLUDE constraint wants a `__tests__/*.test.sql` like the existing
migration tests. Phase 3 needs a `quote-flow.yaml` alongside `booking-flow.yaml`.

---

## 9. Current state (2026-08-17)

**Done:**
- Branch `feature/quote-first-booking` created off `dev`.
- Baseline test suite green: **71 suites / 843 tests**.
- Supabase CLI initialized (`supabase/config.toml` created — it never existed;
  migrations had been applied by hand) and linked to `apbubklogxgqkokbctwz`.
- **Migration history reconciled.** Local and remote had drifted:
  - `20260624120000_admin_panel.sql` → renamed to `20260625023803_admin_panel.sql`
  - `20260713000000_storage_buckets.sql` → renamed to `20260713215620_storage_buckets.sql`
    (both had been applied via the SQL editor under different timestamps)
  - Recovered two migrations that existed only on the remote with no file in the
    repo: `20260722200103_add_provider_base_coordinates.sql` and
    `20260725200513_recategorize_addon_services_by_provider_type.sql`
  - `supabase migration list` now aligns on every row.
- Phase 0 migration written: `20260817000000_booking_duration.sql`
  (duration columns, generated `estimated_completion_at`, backfill from the
  services JSONB, `stamp_actual_duration` trigger, provider/schedule index).

**Not yet done:**
- Phase 0 migration is written but **NOT applied** (`supabase db push` pending).
- `src/types/supabase.ts` needs regenerating after the push.
- No application code changed yet. `src/utils/duration.ts` was drafted but not
  written to disk.
- Nothing committed — all of the above is uncommitted working-tree state.

**Next action:** `supabase db push`, regenerate types, then build
`src/utils/duration.ts` + tests and wire the "ready by" display.

### Environment notes
- `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` must be exported in the
  shell that launches Claude Code. Appending them to `~/.bashrc` alone is not
  enough — Ubuntu's `.bashrc` returns early for non-interactive shells, so tool
  invocations won't see them unless the parent process already has them.
- The Supabase MCP server runs `--read-only` (see `.mcp.json`), so it can read
  the DB but cannot apply migrations. Use the CLI for DDL.
