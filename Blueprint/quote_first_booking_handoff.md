# Quote-First Booking — Session Handoff

**Updated:** 2026-08-18 (second session) · **Branch:** `feature/quote-first-booking`
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This is the *operational* handoff: environment, what is proven versus merely
written, and what to do first. The design and per-phase state live in the spec;
this does not duplicate them.

> **One-line summary:** Phases 0, 1 and 2 are **applied and green** — six
> migrations on the live project, all SQL suites passing, Jest 82 suites / 1111
> tests, `tsc` clean. The previous session's blocker (three unapplied
> migrations) is gone. **The one live blocker now is a Supabase secret key**;
> see §2. Next work is Phase 3.

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

## 2. The one live blocker — a Supabase secret key

**Legacy API keys were disabled on this project on 2026-06-24.** The publishable
key (`EXPO_PUBLIC_SUPABASE_KEY`) was migrated then and is fine — the app works.
`SUPABASE_SERVICE_ROLE_KEY` in `carApp/.env.local` was **not**, and is still the
old `eyJ…` JWT, which now returns:

```
401 {"message":"Legacy API keys are disabled",
     "hint":"Your legacy API keys (anon, service_role) were disabled on 2026-06-24…"}
```

**What this blocks:** `npm run verify:checkout` and `npm run seed:e2e`, both of
which use the service role to mint a session for the seeded OTP-only accounts
and to clean up afterwards. Nothing else.

**What it does NOT block:** the deployed Edge Functions. Supabase rotated the
value it injects into them — the digest of the injected `SUPABASE_SERVICE_ROLE_KEY`
does not match the disabled legacy JWT, and a `SUPABASE_SECRET_KEYS` secret is
also present. Functions are fine.

**To fix:** reveal or re-create the secret key in
Dashboard → Project Settings → API Keys, and set it as
`SUPABASE_SERVICE_ROLE_KEY` in `carApp/.env.local`. There is already one named
`carapp_secret_key` (`sb_secret_OWrdi…`, created 2026-06-24) — but a secret key
is shown **once at creation** and both `supabase projects api-keys` and the MCP
return it masked, so it cannot be recovered from the CLI. Reveal it in the
dashboard or mint a new one.

> While you are there: this session printed `SUPABASE_ACCESS_TOKEN` and
> `SUPABASE_DB_PASSWORD` into a terminal transcript. Rotate both if that log is
> shared anywhere.

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

All six migrations applied; `supabase migration list --linked` aligns on every
row.

| Migration | SQL test | Checks |
|---|---|---|
| `20260817000000_booking_duration` | — | — |
| `20260817120000_bookings_update_column_guard` | ✅ | 12/12 |
| `20260817140000_bookings_server_derived_pricing` | ✅ | 15/15 |
| `20260818000000_booking_buffers_and_overlap_guard` | ✅ | green |
| `20260818120000_provider_profiles_column_guard` | ✅ | green |
| `20260819000000_provider_working_hours_and_time_off` | ✅ | 21/21 |
| `20260820000000_intake_vehicle_size_and_modifiers` | ✅ | 25/25 |

The overlap pre-scan found no existing double-bookings and `btree_gist` resolved
without intervention. All suites wrap in a transaction and `ROLLBACK`:

```bash
cd carApp
for f in bookings_update_column_guard bookings_server_derived_pricing \
         booking_buffers_and_overlap_guard provider_profiles_column_guard \
         provider_working_hours_and_time_off intake_vehicle_size_and_modifiers; do
  supabase db query --linked -f supabase/migrations/__tests__/$f.test.sql
done
# expect every row's pass = t
```

`stripe-webhook` is deployed with the `23P01 → 409 {code:'slot_conflict'}`
mapping.

---

## 4. What is proven, and what is not

### Proven

- **Jest: 82 suites / 1111 tests.** `npx tsc --noEmit` clean.
- **All six SQL suites green against the live project.**
- The Phase 2 insert path is proven *at the SQL layer*: a customer can state
  size and condition, the suggestion is derived server-side, and a forged
  `suggested_duration_mins` is refused.

### ⚠️ NOT proven

**1. `npm run verify:checkout` has not run this session** — blocked on §2. It
was 23/23 on the previous session, but the booking payload has **changed since**
(`vehicle_size_class` and `condition_answers` are now sent). Re-run it as the
first thing after fixing the key. The SQL test covers the same ground from the
database side, but not that `handleConfirm()` sends a payload the grants accept.

**2. Stripe, still — the oldest untested path.** No `create_deposit_intent`, no
PaymentSheet, no `stripe-events` promotion. Needs macOS + a booted simulator +
Maestro; no machine so far has had all three.

**3. The 409 → provider UI path.** `acceptBooking` reads the error body off the
`FunctionsHttpError` `context` Response. Unit-tested against a synthetic
`Response`, never a real 409.

**4. `Intl` timezone support on device.** `src/utils/schedule.ts` uses
`Intl.DateTimeFormat` with an IANA `timeZone`. Works in Jest (Node has full
ICU); never run under Hermes. The failure is graceful by construction — an
unresolvable zone falls back to the device offset — but "graceful" means
*silently wrong for a provider in another zone*, so check it on the first
simulator run.

**5. Nothing in the UI has been seen running.** Every screen change this session
is verified by Jest and `tsc` only.

---

## 5. Do this first, in this order

1. **Fix the secret key** (§2), then `npm run verify:checkout`. The payload
   changed; this is the highest-value single check available without a
   simulator.
2. **Consider extending `verify-checkout.mjs`** to assert
   `suggested_duration_mins` comes back derived, and that a forged one is
   refused through PostgREST rather than only through `db query`.
3. **Phase 3.** See §6.
4. **On a Mac:** `brew install maestro`, boot a simulator,
   `./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. Two seed failure modes are
   intended: an inactive/unapproved package now fails the booking at insert, and
   seeded bookings occupy real ranges with buffers, so two committed jobs close
   together for one provider will be refused.

---

## 6. Phase 3 — what it inherits

Rated highest-risk in spec §8, and nothing this session changed that. It
resequences payments (SetupIntent at request, deposit at approval) on top of the
pricing trigger.

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

**Still open from Phase 2**, both deferred to Phase 3 deliberately:

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
