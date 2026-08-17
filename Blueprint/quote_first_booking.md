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

### Security fix (do this before providers can set prices) — ✅ DONE
`"bookings: update own"` was `FOR UPDATE` with no `WITH CHECK` and **no column
restriction**, so Postgres reused its `USING` clause as the check: either party
could write `total_amount`, `provider_payout`, or set `status` straight to
`'completed'` — collecting the service without the balance ever being captured.

Closed by `20260817120000_bookings_update_column_guard.sql`, in two layers,
because RLS has no column-level granularity and neither layer suffices alone:

1. **Column privileges.** `REVOKE UPDATE … FROM anon, authenticated`, then
   `GRANT UPDATE (scheduled_at, status, started_at) TO authenticated`. Postgres
   checks column privileges independently of RLS, so a future policy bug cannot
   reopen this.
2. **Status-transition trigger.** The allowlist has to leave `status` writable
   (the provider drives the lifecycle from the app), so
   `enforce_booking_status_transition` pins the client to the only three
   transitions the app performs — customer `pending → cancelled`, provider
   `confirmed → en_route → in_progress` — and reserves `started_at` to the
   assigned provider, since it feeds `estimated_completion_at` and the
   `actual_duration_mins` stamp.

⚠️ The trigger must stay **SECURITY INVOKER**. As `SECURITY DEFINER` it would
run as its owner, making `current_user` `'postgres'` for every caller, so the
trusted-role early return would match on every write and silently disable the
whole guard.

Verified by `__tests__/bookings_update_column_guard.test.sql` — 12 checks, all
passing, covering both the blocked exploits and the three flows that must keep
working. Edge Functions are untouched: they connect with
`SUPABASE_SERVICE_ROLE_KEY`, which is already where accept/decline, both
captures, the cancellation policy, and completion live.

### The same hole on INSERT — ✅ DONE

Fixing UPDATE only stopped a customer *rewriting* a price. It did nothing about
them *setting* it: `"bookings: customer insert"` only checks
`auth.uid() = customer_id`, and the client computed every money column itself.
`create_deposit_intent` also took its `amount` straight from the request body.

The dangerous variant is not underpaying — the provider notices a wrong price on
the job card. It is a **normal-looking `total_amount` with `platform_fee = 0`
and `provider_payout = total_amount`**: the customer pays what they expect, the
provider is paid in full and has no reason to look, and the platform's cut
silently goes to zero.

Closed by `20260817140000_bookings_server_derived_pricing.sql`. The client now
states *intent* — which provider, which packages — and never a price:

1. **`derive_booking_amounts`** (BEFORE INSERT) recomputes every money column
   from `service_packages`, mirroring `src/utils/money.ts` in integer cents so
   the floors land identically. It also **rebuilds the services snapshot** from
   the same rows, so a forged `base_price` cannot survive even as display text,
   and derives `estimated_duration_mins` from the same authoritative source.
2. **Column privileges on INSERT** remove the money columns from the client's
   vocabulary, so a stale or hostile client gets a hard 403 rather than having
   its numbers quietly overwritten.
3. **`create_deposit_intent` charges `booking.deposit_amount`** off the row.
   `body.amount` is still accepted for older clients and deliberately discarded.

Also SECURITY INVOKER, for the same `current_user` reason as the status guard —
and invoker rights are what make the lookup correct, since
`"service_packages: read public"` limits it to active, approved packages, so an
unbookable package fails rather than being priced.

Verified by `__tests__/bookings_server_derived_pricing.test.sql` — 15 checks.

⚠️ Two traps that fixture hit, worth knowing before writing similar tests:
- `id` **must** be in the INSERT grant list. Postgres reports INSERT column
  denials at *table* level (`permission denied for table bookings`), so one
  ungranted column looks like a blanket failure.
- The **Founding Provider Program trigger** (migration `20260622140000`)
  rewrites `platform_fee_rate` to 0% for the first 100 approved providers,
  overriding whatever the fixture seeds. Set the rate *after* insert, or every
  `platform_fee` assertion passes trivially against zero.

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

### Phase 0 — complete

**Database.** `20260817000000_booking_duration.sql` is written **and applied**;
`supabase migration list` aligns on every row. It adds
`estimated_duration_mins`, `actual_duration_mins`, the generated
`estimated_completion_at`, the `stamp_actual_duration` trigger, and the
provider/schedule index. The migration is idempotent end to end — it was
re-applied via `migration repair --status reverted` + `db push` and skipped
every existing object cleanly.

Backfill landed on all 26 existing bookings (26 with a duration, 26 with an
ETC, 3 completed jobs stamped with an actual duration).

Two things were wrong in the migration as originally written, both fixed:

- **`timestamptz + interval` is only STABLE**, so Postgres rejected it in a
  generated column (`42P17 generation expression is not immutable`) — an
  interval carrying month/day parts has to be resolved against the session
  TimeZone. The column now converts to UTC first: `timezone(text, timestamptz)`
  and `timestamp + interval` are both IMMUTABLE, and UTC has no DST for the
  addition to trip over. Do not "simplify" it back to a bare `+`.
- `stamp_actual_duration` tripped the `function_search_path_mutable` advisor;
  it now carries `SET search_path = public`, matching the other functions in
  this repo. Advisors report nothing new from this migration.

**Types.** `src/types/supabase.ts` regenerated — diff was exactly the three new
columns. ⚠️ Codegen lists `estimated_completion_at` in `Insert` and `Update`
even though it is `GENERATED ALWAYS`; writing it raises a Postgres error the
type system will not catch. Nothing writes it today. Keep it that way.

**Application code.**
- `src/utils/duration.ts` — `formatDuration`, `sumServiceDurationMins`,
  `resolveDurationMins`, `computeCompletionAt`, `resolveCompletionAt`,
  `formatReadyBy`, `formatBookingReadyBy`. Reads the committed column and falls
  back to the services snapshot for rows that predate it. Unknown duration
  resolves to `null`, never `0`, so "ready by" is absent rather than "ready
  immediately".
- **`insertBooking` now persists `estimated_duration_mins`.** This was the gap
  that made the rest inert: the review screen computed a duration, displayed
  it, and discarded it, so without this every *new* booking would have had a
  NULL duration and no ready-by — the display would have worked only for
  backfilled legacy rows.
- Booking detail renders `Est. 1 hr 30 min · ready by ~4:00 PM`.
- Three identical copies of `formatDuration` (booking detail, provider detail,
  booking flow) collapsed into the shared util.

**Tests.** 72 suites / 879 tests green, up from the 71 / 843 baseline.
`src/utils/__tests__/duration.test.ts` covers the util; `e2e/booking-flow.yaml`
asserts the ready-by line on the detail screen after checkout.

⚠️ **Jest now pins `TZ=UTC`** via `jest.globalSetup.js`. It was unpinned, so
every wall-clock assertion silently depended on the developer's zone — which is
why `date.test.ts` asserts times with regexes like `/\d{1,2}:\d{2}\s?(AM|PM)/`
instead of real values. New date/time tests can assert exact times. The
existing regex assertions still pass and were left alone.

### Phase 1 — in progress

**Done: the §4 RLS security fix**, which gated Phase 3, *and* its INSERT
sibling found while reviewing it. See §4 for both designs and the SECURITY
INVOKER warning. Applied and green:

| Migration | Test | Checks |
|---|---|---|
| `20260817120000_bookings_update_column_guard` | `bookings_update_column_guard.test.sql` | 12/12 |
| `20260817140000_bookings_server_derived_pricing` | `bookings_server_derived_pricing.test.sql` | 15/15 |

`stripe-webhook` redeployed for the deposit-derivation change.

The client's entire write surface on `bookings` is now: insert a row naming a
provider, packages, time and place; reschedule it; and three status
transitions. **It cannot state a price at any point.** Anything Phase 3 adds —
quote submission, price approval, duration adjustment — must go through an Edge
Function or be added deliberately to both layers. That is the intended
friction, and it is also exactly the shape Phase 3 already assumes in §5.

**Next:** buffers, working hours, `provider_profiles.timezone`, time-off,
DayTimeline, and the `EXCLUDE` constraint. Start with the schema — the
`btree_gist` + `EXCLUDE` pair needs `occupied_range`, which needs the buffer
columns — and give it a `__tests__/*.test.sql` as §8 calls for. Note that
`estimated_completion_at` already proves the duration half of `occupied_range`
works; the buffers extend the same generated-column approach, and the same
IMMUTABLE constraint will apply to the range expression.

### Environment notes
- `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` must be exported in the
  shell that launches Claude Code. Appending them to `~/.bashrc` alone is not
  enough — Ubuntu's `.bashrc` returns early for non-interactive shells, so tool
  invocations won't see them unless the parent process already has them.
- The Supabase MCP server runs `--read-only` (see `.mcp.json`), so it can read
  the DB but cannot apply migrations. Use the CLI for DDL.
