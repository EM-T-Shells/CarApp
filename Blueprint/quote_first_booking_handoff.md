# Quote-First Booking — Session Handoff

**Updated:** 2026-08-18 (second session) · **Branch:** `feature/quote-first-booking`
**Head:** `d227500` — **pushed; working tree clean, nothing local-only.**
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This is the *operational* handoff: environment, what is proven versus merely
written, and what to do first. The design and per-phase state live in the spec;
this does not duplicate them.

> **One-line summary:** Phases 0, 1 and 2 are **applied and green**, and Phase
> 3's additive foundation is in — seven migrations on the live project, all SQL
> suites passing, `verify:checkout` 30/30, Jest 82 suites / 1111 tests, `tsc`
> clean. Nothing is blocked except Stripe, which needs a Mac (§4).
>
> **To resume: run §5 step 0 to confirm the state, then start on §6 item 1 —
> the `submit_quote` Edge Function action.** That is the smallest next piece
> that moves Phase 3, and everything it needs is already in place.

---

## 1. Restarting on a new machine

```bash
git clone git@github.com:EM-T-Shells/CarApp.git
cd CarApp && git checkout feature/quote-first-booking
cd carApp && npm ci
npx tsc --noEmit && npm test          # expect 82 suites / 1111 tests, all green
```

If that is green, the JavaScript half of the project is fully restored.

### What must exist before you launch Claude Code

| # | Thing | Why | How to check |
|---|---|---|---|
| 1 | `carApp/.env.local` | gitignored, recreated by hand | `npm run verify:checkout` fails loudly without it |
| 2 | `admin/.env.local` | **easy to forget** — the admin panel is a separate Vite app with its own env file | `cd admin && npm run dev` |
| 3 | `.mcp.json` (repo root) | the hosted Supabase MCP | `/mcp` in an interactive session |
| 4 | `SUPABASE_ACCESS_TOKEN` | every CLI command that talks to the API | `supabase projects list` |
| 5 | `SUPABASE_DB_PASSWORD` | applying migrations | `supabase db push` |

**Nothing in that table is in git.** All five are gitignored.

```
carApp/.env.local     EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_KEY (publishable),
                      SUPABASE_SERVICE_ROLE_KEY (see §2), EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
                      EXPO_PUBLIC_FIREBASE_*
admin/.env.local      VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

**Export 4 and 5 in the shell that launches Claude Code, not after.** A shell
profile that returns early for non-interactive shells means tool invocations
never see them, and every DDL command fails with a misleading "Cannot find
project ref".

`supabase` subcommands need `--workdir /path/to/carApp` (or a shell already in
it) — `functions deploy` and `db push` both resolve paths relative to the
working directory and fail confusingly otherwise.

Project ref `apbubklogxgqkokbctwz`. Use the CLI for all DDL — the MCP server
runs `--read-only`.

### Machines this has run on

| | WSL2 box (this session) | macOS box |
|---|---|---|
| Node | v20.20.0 | v24.15.0 |
| Supabase CLI | 2.90.0, **logged in** | 2.107.0, not logged in |
| Docker / `psql` | neither | neither |
| Maestro + simulator | unavailable | not installed |
| DB access | ✅ `db push` works | ✗ IPv6-only route |

---

## 2. API keys — resolved, but know the shape of it

**Legacy API keys were disabled on this project on 2026-06-24T01:28:08Z.** The
publishable key (`EXPO_PUBLIC_SUPABASE_KEY`) was migrated at the same time, but
`SUPABASE_SERVICE_ROLE_KEY` in `carApp/.env.local` was missed and sat on the old
`eyJ…` JWT until this session, returning:

```
401 {"message":"Legacy API keys are disabled", "hint":"…disabled on 2026-06-24…"}
```

**Resolved** — a new `sb_secret_…` key is in `.env.local` and
`verify:checkout` is 30/30 again.

Worth knowing if it recurs:

- The symptom is confined to `verify:checkout` and `seed:e2e`, the only two
  things that use the service role locally. **Deployed Edge Functions are
  unaffected** — Supabase rotates the value it injects into them, and a
  `SUPABASE_SECRET_KEYS` secret is present alongside it.
- **A secret key cannot be recovered.** Supabase shows it once at creation;
  `supabase projects api-keys` returns it with the tail masked
  (`sb_secret_XXXXX` + 26 `·`), and the MCP server exposes publishable keys
  only. Mint a new one rather than hunting for the old.

### Credential exposure — assessed, deliberately not rotated

A check early in the second session used `${VAR:-no}`, which prints the *value*
when the variable is set, so `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`
were both echoed into that session's transcript. (`${VAR:+set}` gives the same
yes/no answer without echoing anything — use that.)

**Decision: not rotated, on evidence.** Do not re-open this without new
information:

- The transcript is `~/.claude/projects/-home-getaskale-CarApp/<uuid>.jsonl`,
  mode `-rw-------`, on the WSL2 VM's own ext4 disk — **not** a `/mnt/c`
  Windows mount, so OneDrive and File History cannot reach it. No sync folders
  in `$HOME`.
- Anyone able to read it can already read `carApp/.env.local` on the same
  filesystem with the same ownership, which holds the service role, Stripe and
  Firebase keys. The transcript duplicates an existing local secret rather than
  widening the blast radius.
- The token (`claude-cli-token`) expires 2026-09-16 regardless.

**Rotate if any of these become true:** a transcript is pasted into an issue,
bug report or support ticket; backup/sync starts reaching the WSL filesystem;
or the machine becomes shared or is handed on. Then revoke the token row
outright (Dashboard → Account → Access Tokens → ⋮ → Revoke — *generating a new
token does not revoke the old one*, they coexist) and reset the database
password under Project Settings → Database.

> ⚠️ Unrelated to the above and easy to conflate: the **service role key** WAS
> rotated this session, because it was disabled, not because it leaked.

### The DNS trap that cost an hour — already fixed, don't rediscover it

On WSL2, `dns.lookup` waits for an **AAAA query that is never answered** for
hosts with no IPv6 record — about 11 seconds. undici's connect timeout is 10, so
every Node `fetch()` to the Supabase project died with
`UND_ERR_CONNECT_TIMEOUT`, reported as a *connection* failure rather than a DNS
stall. Measured:

```
net.connect({ host })            11091 ms
net.connect({ host, family: 4 })    64 ms
```

`curl`, `net.connect`, `tls.connect` and the Supabase CLI all worked against the
same host the whole time, which is what makes it look like anything but DNS.
Hosts *with* AAAA records (example.com) were fast, so it looks host-specific
rather than resolver-specific. It is neither — it is IPv4-only hosts.

`scripts/lib/ipv4-dns.mjs` pins `family: 4` and is imported first by both Node
scripts. Node-side only; React Native has its own networking stack.

---

## 3. State of the database

All seven migrations applied; `supabase migration list --linked` aligns on
every row.

| Migration | SQL test | Checks |
|---|---|---|
| `20260817000000_booking_duration` | — | — |
| `20260817120000_bookings_update_column_guard` | ✅ | 12/12 |
| `20260817140000_bookings_server_derived_pricing` | ✅ | 15/15 |
| `20260818000000_booking_buffers_and_overlap_guard` | ✅ | green |
| `20260818120000_provider_profiles_column_guard` | ✅ | green |
| `20260819000000_provider_working_hours_and_time_off` | ✅ | 21/21 |
| `20260820000000_intake_vehicle_size_and_modifiers` | ✅ | 25/25 |
| `20260821000000_quote_statuses_and_arrival_windows` | ✅ | 21/21 |

The overlap pre-scan found no existing double-bookings and `btree_gist` resolved
without intervention. All suites wrap in a transaction and `ROLLBACK`:

```bash
cd carApp
for f in bookings_update_column_guard bookings_server_derived_pricing \
         booking_buffers_and_overlap_guard provider_profiles_column_guard \
         provider_working_hours_and_time_off intake_vehicle_size_and_modifiers \
         quote_statuses_and_arrival_windows; do
  supabase db query --linked -f supabase/migrations/__tests__/$f.test.sql
done
# expect every row's pass = t
```

`stripe-webhook` is deployed with the `23P01 → 409 {code:'slot_conflict'}`
mapping.

---

## 4. What is proven, and what is not

### Four test systems, and they do not substitute for each other

Worth knowing before reading the numbers below, because the obvious reading of
"Jest is green" is wrong:

| System | Scope | How to run |
|---|---|---|
| **Jest** — 82 suites / 1111 tests | Logic only. **Every test mocks Supabase.** | `npm test` (runs all) |
| **`.test.sql`** — 7 files | Triggers, constraints, grants, against the live DB | `supabase db query --linked -f …` |
| **`verify-checkout.mjs`** — 30 checks | The real client payload against the real grants | `npm run verify:checkout` |
| **Maestro** — `booking-flow.yaml` | The app in a simulator | needs macOS + simulator |

A Jest test **cannot** prove that Postgres refuses a forged column: `supabase`
is a mock, so such a test would assert that a fake returns the error it was told
to return, and would pass just as happily against a database with the column
wide open. That is why the guard assertions live in the other two systems, and
why adding checks there does not move the Jest count.

### Proven

- **Jest: 82 suites / 1111 tests.** `npx tsc --noEmit` clean.
- **All seven SQL suites green against the live project.**
- **`npm run verify:checkout` — 30/30 against the live project.** Signs in as
  the seeded customer with the **anon** key and fires the exact payload
  `handleConfirm()` sends, including the Phase 2 intake fields: client payload →
  column privileges → trigger → row, the forged-price rejections, and the
  abandon path. It now also proves `suggested_duration_mins` comes back derived
  (so `trg_derive_booking_suggestion` ran and read the *rebuilt* services
  snapshot — a broken trigger order would show up here as a null), and that
  stating a suggested duration, a quoted total, an unknown size class, an
  invalid condition answer or an unknown condition key are all refused.
  **Re-run it after any change to the booking screen's payload or the INSERT
  grant list.**

### ⚠️ NOT proven

**1. Stripe, still — the oldest untested path.** No `create_deposit_intent`, no
PaymentSheet, no `stripe-events` promotion. Needs macOS + a booted simulator +
Maestro; no machine so far has had all three.

**2. The 409 → provider UI path.** `acceptBooking` reads the error body off the
`FunctionsHttpError` `context` Response. Unit-tested against a synthetic
`Response`, never a real 409.

**3. `Intl` timezone support on device.** `src/utils/schedule.ts` uses
`Intl.DateTimeFormat` with an IANA `timeZone`. Works in Jest (Node has full
ICU); never run under Hermes. The failure is graceful by construction — an
unresolvable zone falls back to the device offset — but "graceful" means
*silently wrong for a provider in another zone*, so check it on the first
simulator run.

**4. Nothing in the UI has been seen running.** Every screen change this session
is verified by Jest and `tsc` only.

---

## 5. Do this first, in this order

0. **Confirm you are where this document says you are.** Two minutes, and it
   distinguishes "something drifted" from "something broke":

   ```bash
   cd CarApp && git log --oneline -1        # expect d227500 or later
   git status --short                       # expect empty
   cd carApp && npx tsc --noEmit && npm test # expect 82 suites / 1111 tests
   npm run verify:checkout                  # expect 30/30 against the live project
   supabase migration list --linked --workdir "$PWD"   # expect seven aligned rows
   ```

   `verify:checkout` is the one worth running every time: it is the only check
   that exercises the real client payload against the real grants, so it catches
   a booking-screen change that no Jest test can (they all mock Supabase).

1. **Phase 3.** See §6. Everything below the Stripe line is unblocked.
2. **On a Mac:** `brew install maestro`, boot a simulator,
   `./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. Two seed failure modes are
   intended: an inactive/unapproved package now fails the booking at insert, and
   seeded bookings occupy real ranges with buffers, so two committed jobs close
   together for one provider will be refused.

---

## 6. Phase 3 — foundation in, flow to build

Rated highest-risk in spec §8, and nothing this session changed that. It
resequences payments (SetupIntent at request, deposit at approval) on top of the
pricing trigger.

**The additive half is already applied** (`20260821000000`, 21/21): the two
quote statuses plus `awaiting_customer_info`, `requested_window_start/end`,
`quote_line_items` / `quoted_total_amount`, and one new client transition —
either party cancelling an *unpriced* request. It changes no existing behaviour
and no row takes a new status until the Edge Function actions exist, which is
the point: the risky half can now be written and reverted against a schema
that is already in place and tested.

**What is left, in rough dependency order:**

1. Edge Function actions — `submit_quote`, `accept_quote`,
   `request_more_photos`, `adjust_job_duration`, `propose_reschedule` /
   `respond_reschedule` — following the guarded-transition pattern
   (`.eq('status', …)` + 409 on mismatch) `acceptBooking` already uses.
2. **Payment resequencing.** The highest-risk item in the plan. Note
   `captureBalance` computes `total_amount − deposit_amount`, so a re-quote
   silently breaks the deposit math (spec §1) — that is the thing to re-read
   first.
3. `ArrivalWindowPicker` replacing `DateTimePicker`; `PackageSelector` with
   tiers and ranges; `QuoteBuilder`; the customer quote-review screen.
4. The intake photo uploader.
5. `quote-flow.yaml` alongside `booking-flow.yaml`.

**What is already true and tested, which Phase 3 depends on:**

- The client's write surface on `bookings` cannot state a price *or* a duration.
  Anything Phase 3 adds — quote submission, price approval, duration adjustment
  — must go through an Edge Function or be added deliberately to **both** the
  column allowlist and the trigger layer. That friction is the point.
- `service_duration_modifiers.delta_price` is stored and applied to nothing.
  Phase 3 is where it becomes the itemised surcharge, **through an Edge
  Function** — not by wiring it into `derive_booking_amounts`, which would hand
  the client an indirect route to the totals it was denied.
- `DayTimeline` already takes a `proposed` slot and flags collisions, so
  `QuoteBuilder` needs the mapping, not the geometry.
- `VehicleConditionForm` is presentational and controlled, so the provider's
  re-quote screen can reuse it with different plumbing.

**Carried over from Phase 2**, both deferred to Phase 3 deliberately:

- The **intake photo uploader**. Schema, CHECK and the customer INSERT policy
  are in place and tested; no UI writes an `'intake'` row yet.
- **Package tiers and ranges** — `duration_min_mins`, `duration_max_mins`,
  `tier`, `parent_package_id` (spec §4). These belong with `PackageSelector`,
  which is Phase 3's.

⚠️ Reconcile before building the add-on model: migration `20260725200513`
retired the `'addon'` category from `service_catalog`, but
`service_packages.category` still allows `'addon'`.

---

## 7. Traps already paid for — don't rediscover these

**Supabase grants ALL on every new public table by default**, at *table* level.
A table-level grant covers every column, so adding a column-level `GRANT` on top
restricts **nothing** — the `REVOKE` is what makes an allowlist mean anything.
This bit `booking_photos` in Phase 2 and is the same lesson as the
`provider_profiles` hole.

**`GRANT` is additive, and that is a live regression risk.** Two migrations now
add columns to the `provider_profiles` and `bookings` allowlists. Both test
files assert the money columns are *still* blocked afterwards, specifically to
catch a careless re-grant.

**RLS has no column-level granularity, and the column allowlist has no notion of
*which participant*.** Customer and provider are both `authenticated`. So a
column granted for the customer's benefit is writable by the provider too unless
a trigger says otherwise — which is how a provider could have rewritten the
declared vehicle size. `trg_validate_booking_intake` closes it.
`enforce_booking_status_transition` does **not** help here: it only guards
`status` and `started_at`.

**A `CHECK` constraint cannot reject unknown JSON keys** without enumerating the
object, and cannot validate a timezone (the IANA list is a catalog view). Both
are triggers for that reason.

**A STORED generated column is computed before CHECK constraints run.** So
`provider_time_off_ends_after_start` is unreachable: `tstzrange()` raises
`22000` first. The CHECK is kept as documented intent, but `22000` is what a
client sees, which is why `insertProviderTimeOff` validates ordering
client-side.

**Trigger ordering is load-bearing.** `trg_derive_booking_suggestion` must run
after `trg_derive_booking_amounts`, which rebuilds `NEW.services`. Postgres
fires same-timing triggers alphabetically and `'amounts' < 'suggestion'`.
Renaming either would silently compute the suggestion from the client's
unvalidated array.

**Trigger functions here must be SECURITY INVOKER.** They read `current_user` to
decide whether the caller is a client. As `SECURITY DEFINER` that always reads
`'postgres'`, so the trusted-role early return matches every write and
**silently disables the entire guard** while still looking correct.

**`occupied_range` and `estimated_completion_at` deliberately disagree.** One
keys off `scheduled_at`, the other off `COALESCE(started_at, scheduled_at)`.
Occupancy is a property of the schedule; if it followed `started_at`, tapping
Start Job two hours late would slide the range into the next booking and
`23P01` the provider out of a job they are standing in front of.

**`timestamptz + interval` is only STABLE**, so Postgres rejects it in a
generated column (`42P17`). Convert to UTC first.

**Working hours are wall-clock strings, never instants.** Storing a timestamp
would bake in a UTC offset and shift every window twice a year.

**DST arithmetic, three ways it bites.** The offset at midday is not the offset
at midnight (so `startOfLocalDay` resolves it twice); a local day is 23, 24 or
25 hours (so `localDayRange` lands 36 hours out and snaps back, and `stepDay`
aims for the target's *midday*); and "not today" does not mean "yesterday" (so
`localDayOffset` is signed — this was a real bug in `placeJobs`).

**Negating a zero timezone offset yields `-0`**, which fails `Object.is` against
`0` and therefore a Jest `toBe(0)`. `zoneOffsetMinutes` normalises it.

**`supabase.functions.invoke` throws away Edge Function error bodies.** Every
non-2xx collapses to "Edge Function returned a non-2xx status code"; the real
message sits on `error.context`, a `Response`. Only `acceptBooking` reads it
back out — the other wrappers still surface the generic string.

**`id` must be in an INSERT grant list.** Postgres reports INSERT column denials
at *table* level (`permission denied for table bookings`), so a single ungranted
column looks like a blanket failure. Cost an hour.

**The Founding Provider Program trigger** (migration `20260622140000`) rewrites
`platform_fee_rate` to 0% for the first 100 approved providers, overriding
whatever a test fixture seeds. Set the rate *after* insert.

**`service_packages.category`** is `CHECK IN ('detailing','mechanical','addon')`
— not free text. A fixture using `'interior'` fails with 23514.

**Only TypeScript `type` aliases get an implicit index signature, not
`interface`.** `TimeWindow` had to become a type alias so `WorkingHours` could
be assigned to the generated `Json` column type without a cast at every call
site.

**Migrations here are idempotent by construction.** To amend one already
applied: `supabase migration repair --status reverted <version>` then
`supabase db push`.

**Jest pins `TZ=UTC`** via `carApp/jest.globalSetup.js`. New date/time tests can
assert exact times; the older regex assertions in `date.test.ts` predate this.

**Generated-column codegen quirk:** `occupied_range`, `blocked_range` and
`estimated_completion_at` appear in `Insert`/`Update` despite being `GENERATED
ALWAYS`. Writing them raises a Postgres error TypeScript will not catch.
Nothing writes them. Keep it that way.

**A React component under test that keys a `useCallback` on a mocked store
value** will loop forever if the mock returns a fresh object each render. The
manage screen's `load()` is keyed on `user`; a `selector({ user: { id: '…' } })`
mock never left the spinner. Return a stable module-level reference.

---

## 8. Security invariant to preserve

The client's entire write surface on `bookings`:

- **INSERT** — `id`, `customer_id`, `provider_id`, `vehicle_id`, `package_id`,
  `services`, `status`, `scheduled_at`, `service_address`, `location_lat`,
  `location_lng`, `notes`, `vehicle_size_class`, `condition_answers`
- **UPDATE** — `scheduled_at`, `status`, `started_at`, `vehicle_size_class`,
  `condition_answers`
- **Status transitions** — customer `pending → cancelled`; provider
  `confirmed → en_route → in_progress`
- **Intake columns** — customer only, and frozen once the booking leaves
  `pending` / `pending_provider_approval`

**It cannot state a price, a duration, or how much of a provider's day it
takes.** `buffer_before_mins`, `buffer_after_mins`, `occupied_range`,
`estimated_duration_mins` and `suggested_duration_mins` are all outside both
grant lists.

On `provider_profiles`: INSERT `id`, `user_id`, `provider_type_id`; UPDATE
`bio`, `coverage_area`, `mile_radius`, `base_lat`, `base_lng`, `availability`,
the two `default_buffer_*_mins`, `timezone`, `working_hours`,
`max_jobs_per_day`. DELETE revoked outright. `platform_fee_rate` and
`verification_status` are **not** writable — that hole was confirmed live with
the shipping anon key before being closed.

On `booking_photos`: INSERT `id`, `booking_id`, `photo_type`, `storage_url`,
with the customer route restricted to `photo_type = 'intake'`. UPDATE and DELETE
revoked — the before/after pair is dispute evidence.

Edge Functions are unaffected throughout: they connect with the service role.
So does `scripts/seed-e2e.mjs`.
