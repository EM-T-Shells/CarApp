# Quote-First Booking — Session Handoff

**Updated:** 2026-08-18 · **Branch:** `feature/quote-first-booking`
**Head:** `06587dd` — **pushed; working tree clean, no stashes, nothing local-only.**
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This is the *operational* handoff: how to restart on another machine, what is
proven versus merely written, and what to do first. The design and per-phase
state live in the spec; this does not duplicate them.

> **One-line summary:** Phases 0 and 1 are written and the app code is green
> (75 suites / 966 tests, `tsc` clean). **Three migrations are written but have
> never been executed.** Everything downstream is blocked behind applying them,
> and applying them needs one credential — see §2.

---

## 1. Restarting on a new machine

```bash
git clone git@github.com:EM-T-Shells/CarApp.git
cd CarApp && git checkout feature/quote-first-booking   # should land on 06587dd
cd carApp && npm ci
npx tsc --noEmit && npm test          # expect 75 suites / 966 tests, all green
```

If that is green, the JavaScript half of the project is fully restored. Nothing
else in this file matters until it is.

### What must exist before you launch Claude Code

| # | Thing | Why | How to check |
|---|---|---|---|
| 1 | `carApp/.env.local` | gitignored, must be recreated by hand. See `.env.example` | `npm run verify:checkout` fails loudly without it |
| 2 | `SUPABASE_ACCESS_TOKEN` | every CLI command that talks to the API | `supabase projects list` |
| 3 | `SUPABASE_DB_PASSWORD` **or** the IPv4 pooler URL | applying migrations. **This is the current blocker** | see §2 |
| 4 | IPv4 pooler connection string | direct `db.<ref>.supabase.co` is IPv6-only | Dashboard → Connect → Transaction pooler |

`.env.local` needs `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`
(anon), `SUPABASE_SERVICE_ROLE_KEY` and `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
For cloud builds these must also be set on EAS, or the app crashes on launch.

**Export 2 and 3 in the shell that launches Claude Code, not after.** Appending
them to a shell profile is not enough — a profile that returns early for
non-interactive shells means tool invocations never see them, and every DDL
command fails with a misleading "Cannot find project ref".

### Machines this has run on

| | WSL2 box | macOS box (this session) |
|---|---|---|
| Node | v20.20.0 | v24.15.0 |
| Supabase CLI | 2.90.0, logged in | 2.107.0, **not logged in** |
| Docker / `psql` | — | **neither installed** |
| Maestro + simulator | unavailable | **not installed** |
| IPv6 | — | **no route** (blocks direct DB connections) |

Project ref `apbubklogxgqkokbctwz`. The Supabase MCP server runs `--read-only`
(see `.mcp.json`), so it can read the DB but never apply migrations. Use the CLI
for all DDL.

> **Note:** commits once appeared on `origin` in the WSL2 environment without an
> explicit `git push` — most likely a VSCode `git.postCommitCommand`. Don't rely
> on it. Run `git ls-remote origin <branch>` before trusting that work has left a
> machine. (Verified for `06587dd`: local and remote match.)

---

## 2. State of the database — and the blocker

| Migration | What it does | Applied? |
|---|---|---|
| `20260817000000_booking_duration` | Phase 0 duration columns, generated `estimated_completion_at`, backfill, `stamp_actual_duration` | ✅ |
| `20260817120000_bookings_update_column_guard` | Column allowlist + status-transition trigger on UPDATE | ✅ |
| `20260817140000_bookings_server_derived_pricing` | Server-side pricing on INSERT + column allowlist | ✅ |
| `20260818000000_booking_buffers_and_overlap_guard` | Buffers, generated `occupied_range`, `bookings_no_provider_overlap` EXCLUDE constraint | ❌ **PENDING** |
| `20260818120000_provider_profiles_column_guard` | Column allowlist on `provider_profiles` (the confirmed fee / self-approval hole, §6) | ❌ **PENDING** |
| `20260819000000_provider_working_hours_and_time_off` | Timezone, per-day working hours, `max_jobs_per_day`, `provider_time_off` | ❌ **PENDING** |

### Why the three are pending

They could not be executed from the macOS box. All four routes were tried and
closed — don't re-derive this:

1. **CLI login** — not authenticated. `supabase projects list` → `Unauthorized`.
   OAuth needs an interactive session.
2. **Direct connection** — the ref *is* linked
   (`supabase/.temp/linked-project.json` exists), but
   `db.apbubklogxgqkokbctwz.supabase.co` resolves IPv6-only and the network has
   no route. The CLI says so itself and tells you to use the IPv4 pooler.
3. **service_role over PostgREST** — DML only, no DDL. Probed for an
   `exec_sql`-style RPC under six plausible names; none exists, which is
   correct — one would be a security hole.
4. **Local Postgres** — no Docker, no `psql`, and `supabase start` needs Docker.

**The single missing credential is the database password.** With it,
`supabase db push --db-url …` works *without logging in at all* — a dry run got
all the way to the connection attempt and failed only on the IPv6 route. So on
the next machine, the fastest unblock is the **IPv4 transaction-pooler
connection string** from Dashboard → Connect.

### What was established without a database connection

- All six SQL files (3 migrations + 3 `.test.sql`) **parse clean** against
  libpg_query via `pglast`. Statement-level only — that catches syntax, not
  semantics. (`parse_plpgsql` reports a JSON error on *every* `CREATE FUNCTION`
  in this repo including the three already applied and green, so that warning is
  a parser quirk, not a signal.)
- A dry run of the overlap pre-scan against live data, using the same arithmetic
  the generated column will use, found **no existing overlaps** — 26 bookings:
  20 cancelled, 3 completed, 2 pending, 1 confirmed. The EXCLUDE constraint
  should create cleanly rather than tripping the pre-scan.
- The `provider_profiles` hole was **confirmed live** before being fixed. See §6.

### Undeployed Edge Function change

`stripe-webhook`'s `accept_booking` now maps `23P01` to a 409
`{ code: 'slot_conflict' }` instead of a 500. Deploy it **with** the migrations,
not before — the constraint has to exist for the branch to ever run.

`stripe-webhook` was previously redeployed for the deposit-derivation change. If
you roll the DB back you must also redeploy the previous function, or
`create_deposit_intent` will read a `deposit_amount` that is not being set.

---

## 3. What is proven, and what is not

Be precise about this — it decides what to do first.

### Proven

- **Jest: 75 suites / 966 tests** green. `npx tsc --noEmit` clean.
- **`npm run verify:checkout` — 23/23 against the live project.** Signs in as
  the seeded customer with the **anon** key and fires the exact payload
  `handleConfirm()` sends: client payload → column privileges → trigger → row,
  the forged-price rejections, and the abandon path. Re-run after any change to
  the booking screen's payload or the INSERT grant list.
- **`bookings_update_column_guard.test.sql`** — 12/12.
- **`bookings_server_derived_pricing.test.sql`** — 15/15.

The SQL tests wrap in a transaction and `ROLLBACK`, so they never touch real
data:

```bash
cd carApp
supabase db query --linked -f supabase/migrations/__tests__/bookings_update_column_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/bookings_server_derived_pricing.test.sql
# expect every row's pass = t
```

### ⚠️ NOT proven

**1. The three pending migrations and their tests.** Never executed. This is the
open risk and the reason for §4.

**2. Stripe, still — the oldest untested path.** `verify-checkout.mjs`
deliberately stops at the database: no `create_deposit_intent`, no PaymentSheet,
no `stripe-events` promotion `pending → pending_provider_approval`. A green run
does **not** mean checkout works end to end. E2E (`e2e/run-e2e.sh`,
`booking-flow.yaml`) needs macOS + a booted iOS Simulator + Maestro; no machine
so far has had all three.

**3. The 409 → provider UI path.** `acceptBooking` reads the Edge Function's
error body off the `FunctionsHttpError` `context` Response, because `invoke()`
otherwise collapses every non-2xx to a generic string. Unit-tested against a
synthetic `Response`, never against a real 409.

**4. `Intl` timezone support on device.** `src/utils/schedule.ts` uses
`Intl.DateTimeFormat` with an IANA `timeZone`, which works in Jest (Node has
full ICU) and should work under Hermes on both platforms. It has never run on a
device. The failure is graceful by construction — an unresolvable zone falls
back to the device offset and caches the null so it does not re-throw per
frame — but "graceful" means *silently wrong for a provider in another zone*,
so check it on the first simulator run.

---

## 4. Do this first, in this order

### Step 1 — apply the migrations

Everything else is downstream of this. From a shell with the exports (§1):

```bash
cd carApp
# If logged in:
supabase db push
# If not logged in, the pooler URL alone is enough:
supabase db push --db-url "postgresql://postgres.apbubklogxgqkokbctwz:<PASSWORD>@<pooler-host>:5432/postgres"

supabase migration list --linked      # all six rows should align
```

Then run the three new test files:

```bash
supabase db query --linked -f supabase/migrations/__tests__/booking_buffers_and_overlap_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/provider_profiles_column_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/provider_working_hours_and_time_off.test.sql
# expect every row's pass = t — 14 checks, then 15, then 16
```

**Two failure modes worth recognising:**

- *Pre-scan exception listing booking pairs.* Those are live double-bookings —
  the bug the constraint prevents, already committed. A human decides which
  customer keeps the slot. A dry run found none, but data moves.
- *`btree_gist` unresolved.* Check
  `select * from pg_extension where extname = 'btree_gist'` and which schema it
  landed in; the constraint needs `gist_uuid_ops` visible at DDL time.

### Step 2 — regenerate types, re-verify, redeploy

```bash
supabase gen types typescript --project-id apbubklogxgqkokbctwz > src/types/supabase.ts
npx tsc --noEmit && npm test
npm run verify:checkout                    # buffers now land on every insert
supabase functions deploy stripe-webhook   # the 23P01 -> 409 mapping
```

Expect the same codegen quirk §5 documents: `occupied_range` and
`blocked_range` will appear in `Insert`/`Update` despite being
`GENERATED ALWAYS`. Nothing writes them. Keep it that way.

### Step 3 — the UI wiring that `gen types` unblocks

This is where the last session stopped, and the reason is specific: the client
is `createClient<Database>`, so **`.from('provider_time_off')` and
`profile.working_hours` cannot typecheck until the generated types know they
exist**. Everything on the near side of that line is built and green:

| File | What it is | Tests |
|---|---|---|
| `src/utils/schedule.ts` | Working-hours parsing + timezone projection | 36 |
| `src/components/provider/DayTimeline.tsx` | The day drawn to scale, buffers and conflicts | 24 |
| `src/components/provider/WorkingHoursEditor.tsx` | Per-day window editor | 20 |
| `AvailabilityCalendar.availabilityFromJson` | Now reads both shapes | +2 |

Still to write, all mechanical once the types exist:

1. **Queries** — `getProviderDaySchedule(providerId, date)` returning the
   provider's bookings for a local day plus their `timezone`, `working_hours`
   and `provider_time_off` rows. `DayTimeline` already takes exactly this shape
   (`TimelineJob[]`, `TimelineBlock[]`), so this is a mapping function.
2. **Mutations** — `insertProviderTimeOff` / `deleteProviderTimeOff`, and
   `updateProviderProfile` for `timezone`, `working_hours`, `max_jobs_per_day`
   and the two `default_buffer_*_mins`. ⚠️ `provider_time_off_no_overlap` also
   raises `23P01` on a double submit, and `SlotUnavailableError`'s "that time
   was just taken" is the **wrong** message for a duplicated vacation — give it
   its own.
3. **Screens** — `DayTimeline` into `app/(provider-tabs)/jobs/index.tsx`;
   `WorkingHoursEditor`, a timezone field, buffer fields and a time-off list
   into `app/(provider-tabs)/more/manage.tsx`.

Until step 3 lands, **nothing in the UI writes the buffers or the hours**: every
provider sits on the 15/30 buffer defaults and their backfilled 08:00–18:00
week.

### Step 4 — the Stripe half, on a Mac

`brew install maestro`, boot a simulator, then
`./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. Two new seed failure modes,
both intended:

- A seeded package that is `is_active = false` or `is_approved = false` now
  makes the booking **fail at insert** rather than silently pricing to zero.
- Seeded bookings now occupy real ranges with buffers, so a seed placing two
  committed jobs close together for one provider will be **refused**.

### Step 5 — phases 2–4

Per spec §8. Phase 3 is rated highest-risk and resequences payments (SetupIntent
at request, deposit at approval) on top of the pricing trigger. Do not start it
against unapplied migrations.

---

## 5. Traps already paid for — don't rediscover these

**Supabase grants ALL on every new public table by default.** `ALTER DEFAULT
PRIVILEGES … GRANT ALL ON TABLES TO anon, authenticated, service_role` is part
of the stock project setup, so a freshly created table starts **wide open at the
column level** — the exact condition that produced the `provider_profiles` hole
in §6. Every `CREATE TABLE` on this branch is therefore followed by a
`REVOKE INSERT, UPDATE, DELETE` and an explicit column allowlist. Do the same
for any new table; forgetting it is silent.

**`GRANT` is additive, and that is a live regression risk.** Migration
`20260819000000` grants three more columns on `provider_profiles`, and a
careless re-grant would hand back `platform_fee_rate`.
`provider_working_hours_and_time_off.test.sql` asserts the fee column is *still*
blocked after the new grants, specifically to catch that.

**A `CHECK` constraint cannot validate a timezone or a JSON shape.** The IANA
list lives in a catalog view (`pg_timezone_names`) and a working-hours object
needs iteration. `trg_validate_provider_schedule` does both in a BEFORE trigger
instead, so a bad value fails at write time rather than being something every
reader has to defend against.

**Working hours are wall-clock strings, never instants.** Storing a timestamp
would bake in a UTC offset and shift every window twice a year at the DST
boundary. `src/utils/__tests__/schedule.test.ts` asserts both sides of
2026-03-08 (−300 at 06:30Z, −240 at 07:30Z). The same reasoning is why
`provider_profiles.timezone` is `NOT NULL` rather than inferred from the
provider's coordinates.

**Negating a zero timezone offset yields `-0`**, which fails `Object.is` against
`0` and therefore fails a Jest `toBe(0)`. `zoneOffsetMinutes` normalises it. If
you write another offset helper, do the same.

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

### The same hole on `provider_profiles` — confirmed live, then closed

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
