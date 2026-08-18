# Quote-First Booking — Session Handoff

**Written:** 2026-08-17 · **Updated:** 2026-08-17 (macOS session)
**Branch:** `feature/quote-first-booking`
**Head:** see `git log` — the EXCLUDE-constraint work is committed but its
migration is **written, not applied**. Read §2 and §4 before anything else.
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This file is the *operational* handoff: how to pick the work back up on another
machine, what is verified versus merely written, and what to do first. The
design and the per-phase state live in the spec — this does not duplicate them.

---

## 1. Pick up where it left off

```bash
git clone git@github.com:EM-T-Shells/CarApp.git   # or: git fetch && git checkout
git checkout feature/quote-first-booking
cd CarApp/carApp && npm ci
```

Verify you have everything:

```bash
git log --oneline -6
# feat(booking): Phase 1 — buffers, occupied_range, overlap guard
# test(booking): add checkout verification script for server-derived pricing
# docs: add quote-first booking session handoff
# 2cf778b fix(security): derive booking prices server-side
# 48b8af3 fix(security): close the booking UPDATE hole
# 3efc6aa feat(booking): Phase 0 — durations and ready-by time
```

> **Note:** commits appeared on `origin` in this environment without an
> explicit `git push` — most likely a VSCode `git.postCommitCommand` user
> setting. Don't rely on it. Run `git ls-remote origin <branch>` before you
> trust that work has left a machine.

### Environment

| Thing | WSL2 box | macOS box |
|---|---|---|
| Node | v20.20.0 | v24.15.0 |
| Supabase CLI | 2.90.0 | 2.107.0, **not logged in** |
| Docker / `psql` | — | **neither installed** |
| Maestro + simulator | unavailable | **not installed** |
| Supabase project ref | `apbubklogxgqkokbctwz` | same |

**Shell exports — required before launching Claude Code, not after:**

```bash
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_DB_PASSWORD=...
```

Appending these to `~/.bashrc` is **not enough** — Ubuntu's `.bashrc` returns
early for non-interactive shells, so tool invocations won't see them unless the
parent process already has them. (Same note as spec §9.)

**This is the binding constraint, not a footnote.** Without those two exports
the CLI cannot `link`, so it cannot `db push`, `migration list`, `db query`, or
`gen types` — and with no Docker and no `psql` there is no local fallback
either. That is exactly why `20260818000000` is written but unapplied. Anything
needing only the anon/service-role keys (`.env.local`) still works, which is why
`npm run verify:checkout` and the seed script do run.

`carApp/.env.local` is gitignored and must be recreated. See `.env.example`;
the app reads `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. For cloud
builds these must also be set on EAS, not just locally, or the app crashes on
launch.

The Supabase MCP server runs `--read-only` (see `.mcp.json`), so it can read the
DB but **cannot apply migrations**. Use the CLI for all DDL.

---

## 2. State of the database

| Migration | What it does | Applied? |
|---|---|---|
| `20260817000000_booking_duration` | Phase 0 duration columns, generated `estimated_completion_at`, backfill, `stamp_actual_duration` | ✅ |
| `20260817120000_bookings_update_column_guard` | Column allowlist + status-transition trigger on UPDATE | ✅ |
| `20260817140000_bookings_server_derived_pricing` | Server-side pricing on INSERT + column allowlist | ✅ |
| `20260818000000_booking_buffers_and_overlap_guard` | Buffers, generated `occupied_range`, `bookings_no_provider_overlap` EXCLUDE constraint | ❌ **PENDING** |
| `20260818120000_provider_profiles_column_guard` | Column allowlist on `provider_profiles` (the confirmed fee/self-approval hole, §6) | ❌ **PENDING** |
| `20260819000000_provider_working_hours_and_time_off` | Timezone, per-day working hours, `max_jobs_per_day`, `provider_time_off` | ❌ **PENDING** |

### ⚠️ The pending one

None could be applied from the machine that wrote them: no Docker, no `psql`,
the Supabase CLI not logged in, and the MCP server is `--read-only`. So all
three are **written, parsed, and reviewed — but never executed**, as are their
`__tests__/*.test.sql`. Treat all six files as unproven until §4 step 1.

What *was* established without a database connection:

- Both files parse clean against libpg_query (`pglast`). Statement-level only —
  that catches syntax, not semantics.
- A dry run of the migration's overlap pre-scan against the live project, using
  the same arithmetic the generated column will use, found **no existing
  overlaps** (26 bookings; 20 cancelled, 3 completed, 2 pending, 1 confirmed).
  So the constraint should create cleanly rather than tripping the pre-scan.

`stripe-webhook` also has an **undeployed change**: `accept_booking` now maps
`23P01` to a 409 `{ code: 'slot_conflict' }` instead of a 500. Deploy it with
the migration, not before — the constraint has to exist for the branch to ever
run, and shipping the branch early is harmless but pointless.

`stripe-webhook` was previously **redeployed** for the deposit-derivation
change. If you roll the DB back you must also redeploy the previous function, or
`create_deposit_intent` will read a `deposit_amount` that isn't being set.

---

## 3. What is verified, and what is not

Be precise about this — it decides what to do first.

### Verified

- **Jest: 75 suites / 966 tests** green (was 72 / 879 at the start of the macOS session). `npx tsc --noEmit` clean.
- **`bookings_update_column_guard.test.sql` — 12/12.**
- **`bookings_server_derived_pricing.test.sql` — 15/15.**
- **`npm run verify:checkout` — 23/23 against the live project.** This closed
  the gap the previous session flagged as the open risk. It signs in as the
  seeded customer with the **anon** key and fires the exact payload
  `handleConfirm()` sends, so it covers client payload → column privileges →
  trigger → row, the forged-price rejections, and the abandon path. Re-run it
  after any change to the booking screen's payload or to the INSERT grant list.

Run the SQL tests any time (they wrap in a transaction and `ROLLBACK`, so they
never touch real data):

```bash
cd carApp
supabase db query --linked -f supabase/migrations/__tests__/bookings_update_column_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/bookings_server_derived_pricing.test.sql
# expect every row's pass = t
```

### ⚠️ NOT verified

**1. Everything in `20260818000000` and its test.** Never executed — see §2.
This is now the open risk and the reason for §4.

**2. Stripe, still.** `verify-checkout.mjs` deliberately stops at the database:
no `create_deposit_intent`, no PaymentSheet, no `stripe-events` promotion
`pending → pending_provider_approval`. A green run does **not** mean checkout
works end to end.

E2E (`e2e/run-e2e.sh`, `booking-flow.yaml`) needs **macOS + a booted iOS
Simulator + Maestro**. The macOS box has neither Maestro nor a simulator booted
(`brew install maestro`), so this is still the untested half.

**3. The 409 → provider UI path.** `acceptBooking` in `src/lib/stripe/index.ts`
now reads the Edge Function's error body off the `FunctionsHttpError` `context`
Response, because `invoke()` otherwise collapses every non-2xx to "Edge Function
returned a non-2xx status code" and the provider would be told nothing. That is
unit-tested against a synthetic `Response`, not against a real 409.

---

## 4. Do this first

### 1. Apply `20260818000000` and run its test

Nothing else on this branch should be built on top of an unapplied constraint.
From a shell that already has the two exports:

```bash
cd carApp
supabase link --project-ref apbubklogxgqkokbctwz
supabase migration list --linked          # expect the first three applied, the fourth not
supabase db push
supabase db query --linked -f supabase/migrations/__tests__/booking_buffers_and_overlap_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/provider_profiles_column_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/provider_working_hours_and_time_off.test.sql
# expect every row's pass = t (14 checks, then 15, then 16)
```

Re-run `npm run verify:checkout` afterwards — it exercises `provider_profiles`
reads under the anon key and will catch an allowlist that came out too tight.

Then, in order:

```bash
supabase gen types typescript --project-id apbubklogxgqkokbctwz > src/types/supabase.ts
npx tsc --noEmit && npm test
npm run verify:checkout                    # buffers now land on every insert
supabase functions deploy stripe-webhook   # the 23P01 -> 409 mapping
```

**The types are stale until you run `gen types`.** No app code reads the new
columns yet, so `tsc` is clean either way — but a DayTimeline that reads
`occupied_range` will not typecheck before that regeneration. Expect the same
codegen quirk §5 documents: `occupied_range` will appear in `Insert`/`Update`
despite being `GENERATED ALWAYS`. Nothing writes it. Keep it that way.

**If `db push` fails on the pre-scan**, it will name the conflicting booking
pairs. Those are live double-bookings — the bug the constraint prevents,
already committed — so a human decides which customer keeps the slot. A dry run
found none, but the data may have moved since.

**If it fails on `btree_gist`**, the extension did not resolve. Check
`select * from pg_extension where extname = 'btree_gist'` and which schema it
landed in; the constraint needs `gist_uuid_ops` visible at DDL time.

### 2. Then the Stripe half, on this Mac

Still the oldest untested path. `brew install maestro`, boot a simulator, then
`./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. This is the only thing that
covers `create_deposit_intent`, the PaymentSheet, and the `stripe-events`
promotion to `pending_provider_approval`. `booking-flow.yaml` asserts the Phase
0 ready-by line on the detail screen.

Two failure modes to expect, both intended, both new ways for the seed to break
loudly:

- A seeded package that is `is_active = false` or `is_approved = false` now
  makes the booking **fail at insert** rather than silently pricing to zero.
- Seeded bookings now occupy real ranges with buffers. A seed that places two
  committed jobs close together for one provider will now be **refused**, where
  before it inserted happily.

### 3. Then wire up Phase 1's UI — this is what `gen types` unblocks

Phase 1's schema and its pure layers are done. What is left is the thin data
layer between them, and it is blocked for one specific reason: the client is
`createClient<Database>`, so **`.from('provider_time_off')` and
`profile.working_hours` do not typecheck until `gen types` has run**. That is
why this session stopped where it did rather than leaving a red `tsc`.

Built and green today (no database types involved):

| File | What it is |
|---|---|
| `src/utils/schedule.ts` | Working-hours parsing + timezone projection. 36 tests |
| `src/components/provider/DayTimeline.tsx` | The day drawn to scale, buffers and conflicts. 24 tests |
| `src/components/provider/WorkingHoursEditor.tsx` | Per-day window editor. 20 tests |
| `AvailabilityCalendar.availabilityFromJson` | Now reads both shapes |

Still to write, all mechanical once the types exist:

1. **Queries** — `getProviderDaySchedule(providerId, date)` returning the
   provider's bookings for a local day plus their `timeZone`, `working_hours`
   and `provider_time_off` rows. `DayTimeline` already takes exactly this shape
   (`TimelineJob[]`, `TimelineBlock[]`), so this is a mapping function.
2. **Mutations** — `insertProviderTimeOff` / `deleteProviderTimeOff`, and
   `updateProviderProfile` calls for `timezone`, `working_hours`,
   `max_jobs_per_day` and the two `default_buffer_*_mins`. Watch for `23P01`
   on the time-off insert: `provider_time_off_no_overlap` fires on a double
   submit, and `SlotUnavailableError` is the wrong message there — it needs its
   own.
3. **Screens** — `DayTimeline` into `app/(provider-tabs)/jobs/index.tsx`;
   `WorkingHoursEditor`, a timezone field, buffer fields and a time-off list
   into `app/(provider-tabs)/more/manage.tsx`.

**Nothing in the UI writes the buffers or the hours yet**, so until step 3 every
provider sits on the 15/30 defaults and their backfilled 08:00–18:00 week.

### 4. Then phases 2–4

Per spec §8. Phase 3 is rated highest-risk and resequences payments (SetupIntent
at request, deposit at approval) on top of the pricing trigger — do not start it
against unapplied migrations.

---

## 5. Traps already paid for — don't rediscover these

**`occupied_range` and `estimated_completion_at` deliberately disagree.** One
keys off `scheduled_at`, the other off `COALESCE(started_at, scheduled_at)`, and
making them consistent breaks the app. Occupancy is a property of the schedule;
if it followed `started_at`, tapping Start Job two hours late would slide the
range into the next booking and `23P01` the provider out of a job they are
standing in front of. The ready-by time *should* follow reality. Both halves are
asserted in `booking_buffers_and_overlap_guard.test.sql`.

**`supabase.functions.invoke` throws away Edge Function error bodies.** Every
non-2xx collapses to "Edge Function returned a non-2xx status code"; the real
message sits on `error.context`, a `Response`. `acceptBooking` in
`src/lib/stripe/index.ts` now reads it back out — the other wrappers in that
file do not, and still surface the generic string. If a message you wrote in an
Edge Function never reaches the UI, this is why.

**`schema.sql` had drifted three migrations behind** and is now current for the
bookings/provider_profiles columns, the generated columns, the EXCLUDE
constraint and the booking GRANT lists. The triggers and functions still live
only in the migrations, which is deliberate — but it means reading `schema.sql`
alone will not tell you that inserts are priced server-side. The trigger names
are listed in a comment there.

**`timestamptz + interval` is only STABLE.** Postgres rejects it in a generated
column (`42P17`), because an interval carrying month/day parts must resolve
against the session TimeZone. Convert to UTC first — `timezone(text,
timestamptz)` and `timestamp + interval` are both IMMUTABLE, and UTC has no DST
for the addition to trip over. **The same constraint will apply to
`occupied_range` in Phase 1.**

**Trigger functions here must be SECURITY INVOKER.** Both
`enforce_booking_status_transition` and `derive_booking_amounts` read
`current_user` to decide whether the caller is a client. As `SECURITY DEFINER`
that always reads `'postgres'`, so the trusted-role early return matches every
write and **silently disables the entire guard** while still looking correct.

**`id` must be in an INSERT grant list.** Postgres reports INSERT column denials
at *table* level (`permission denied for table bookings`), so a single
ungranted column looks like a blanket failure. Cost an hour.

**The Founding Provider Program trigger** (migration `20260622140000`) rewrites
`platform_fee_rate` to 0% for the first 100 approved providers, overriding
whatever a test fixture seeds. Set the rate *after* insert, or every
`platform_fee` assertion passes trivially against zero.

**Migrations here are idempotent by construction.** To amend one that is already
applied: `supabase migration repair --status reverted <version>` then
`supabase db push`. Used twice already; the skip notices confirm it is safe.

**Jest now pins `TZ=UTC`** via `carApp/jest.globalSetup.js`. It was unpinned, so
wall-clock assertions silently depended on the developer's zone — which is why
`src/utils/__tests__/date.test.ts` matches times with regexes instead of real
values. New date/time tests can assert exact times.

**Generated-column codegen quirk:** `src/types/supabase.ts` lists
`estimated_completion_at` in `Insert` and `Update` even though it is `GENERATED
ALWAYS`. Writing it raises a Postgres error TypeScript will not catch. Nothing
writes it today.

---

## 6. Security invariant to preserve

The client's entire write surface on `bookings` is now:

- **INSERT** — `id`, `customer_id`, `provider_id`, `vehicle_id`, `package_id`,
  `services`, `status`, `scheduled_at`, `service_address`, `location_lat`,
  `location_lng`, `notes`
- **UPDATE** — `scheduled_at`, `status`, `started_at`
- **Status transitions** — customer `pending → cancelled`; provider
  `confirmed → en_route → in_progress`

**It cannot state a price at any point**, and after `20260818000000` it cannot
state how much of a provider's day it takes either — `buffer_before_mins`,
`buffer_after_mins` and `occupied_range` are outside both grant lists the moment
they exist, with no REVOKE needed. Anything Phase 3 adds — quote submission,
price approval, duration adjustment — must go through an Edge Function or be
added deliberately to both layers. That friction is the point, and it is the
shape spec §5 already assumes.

Edge Functions are unaffected throughout: they connect with
`SUPABASE_SERVICE_ROLE_KEY`. So does `scripts/seed-e2e.mjs`.

### ⚠️ The same hole is still open on `provider_profiles` — confirmed live

`"provider_profiles: write own"` is `FOR ALL USING (auth.uid() = user_id)` with
**no `WITH CHECK` and no column restriction**, so Postgres reuses the `USING`
clause as the check. That is the exact shape of the two bookings holes this
branch already closed, on a table nobody re-examined.

Probed against the live project as `provider@carapp.dev` with the **anon** key,
which is the key that ships in the binary:

```
original platform_fee_rate: 0
  write accepted; value is now 0.999
✖ CONFIRMED: a provider can rewrite their own platform_fee_rate.
restored to 0
```

A customer attempting the same write is correctly blocked, so the policy scopes
to the owner — it simply lets the owner write *everything*. In the same policy:

- **`platform_fee_rate`** — set it to 0 and the platform's cut disappears. The
  quiet version of the exploit §4 of the spec describes, one table over.
- **`verification_status`** — a `pending` provider can set `'approved'`,
  bypassing all six vetting steps and becoming bookable. This also re-fires the
  Founding Provider enrollment trigger (`20260622140000`), which is why the
  probe above deliberately did **not** test it on the real project.
- **`is_founding_provider`**, **`founding_provider_expires_at`**,
  **`stripe_account_id`**, **`total_jobs`**, **`avg_gear_rating`**,
  **`kudos_count`** — reputation and payout routing, all self-writable.

**Fixed in `20260818120000_provider_profiles_column_guard.sql` — written, not
applied.** The policy is left alone: `FOR ALL` with no `WITH CHECK` reuses
`USING` as the check, so the *row* predicate was correct all along. The missing
piece is that RLS has no column-level granularity at all, which is why this is a
column-privilege fix and not a policy rewrite.

The allowlist is what the app actually writes, from reading every caller of
`insertProviderProfile`/`updateProviderProfile`:

| | Columns |
|---|---|
| INSERT | `id`, `user_id`, `provider_type_id` |
| UPDATE | `bio`, `coverage_area`, `mile_radius`, `base_lat`, `base_lng`, `availability`, `default_buffer_before_mins`, `default_buffer_after_mins` |
| DELETE | revoked outright |

Three judgement calls in that list:

- **`provider_type_id` is INSERT-only.** It is chosen at opt-in and nothing in
  the app changes it afterwards. Switching type post-approval should re-enter
  vetting rather than being a profile edit, since the six steps are
  type-specific.
- **DELETE is revoked with nothing granted back.** No mutation deletes a
  provider profile, and the row is the FK target for bookings (`ON DELETE SET
  NULL`), payouts and service packages — a self-delete would quietly orphan a
  provider's job history. Account deletion belongs to the service role.
- **The reputation counters are service-role only.** Checked first that nothing
  updates `avg_gear_rating` / `total_jobs` / `kudos_count` from a client role —
  no rating or kudos trigger writes them, so revoking breaks nothing.

`admin-review-provider`, the Connect onboarding function and the founding-fee
sweep all use the service role and are unaffected; the test asserts that
explicitly. Verified by `__tests__/provider_profiles_column_guard.test.sql` —
15 checks, covering both the blocked exploits and every edit the UI performs.
