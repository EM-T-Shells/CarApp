# Quote-First Booking — Session Handoff

**Updated:** 2026-09-02 (fourth session) · **Branch:** `feature/quote-first-booking`
**Head:** `d0768db` — working tree clean. `submit_quote` is **committed, not
deployed** (§4.5).
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This is the *operational* handoff: environment, what is proven versus merely
written, and what to do first. The design and per-phase state live in the spec;
this does not duplicate them.

> `dev` was merged into this branch at `8b6f0e0`, after the Phase 2/3 work. It
> touched **documentation and Claude config only** — `.claude/rules/`,
> `CLAUDE.md`, `CONTRIBUTING.md`, `docs/business-rules.md`,
> `docs/troubleshooting.md`, `.gitignore`, `.claudeignore`. No source, no
> migrations, no tests. Verified green after the merge: 82 suites / 1111 tests,
> `tsc` clean. Note `Claude.md` was replaced by `CLAUDE.md`, and `.claude/rules/`
> now carries path-scoped rules that only activate via the native Read tool —
> not Bash `cat`/`head`/`sed`.

> **One-line summary:** Phases 0, 1 and 2 are **applied and green**, and Phase
> 3's additive foundation is in — seven migrations on the live project, all SQL
> suites passing, `verify:checkout` 30/30, Jest 83 suites / 1165 tests, `tsc`
> clean. The first Phase 3 action, `submit_quote`, is written and tested but
> **not deployed** (§4.5). Nothing is blocked except Stripe, which needs a
> Mac (§4).
>
> **To resume: run §5 step 0 to confirm the state, then deploy (§4.5) and
> continue §6.** `submit_quote` is committed and unit-tested but neither
> deployed nor compiled. `accept_quote` is the natural next action, and it is
> where the deposit resequencing and the `total_amount − deposit_amount` trap
> land.
>
> **On a new machine, do §1 before §5.** The clone gives you the code and none
> of the access — five gitignored credentials have to be recreated by hand, and
> the CLI access token expires 2026-09-16.

### Where the whole plan stands

Spec §8 lists five phases. The overall position, because it is easy to read a
green test count as "nearly done" and it is not:

| Phase | Scope | State |
|---|---|---|
| **0** | Duration columns, backfill, ready-by display | ✅ complete |
| **1** | Buffers, working hours, timezone, time-off, `EXCLUDE` constraint, RLS tightening | ✅ complete |
| **2** | Vehicle size, condition questions, modifier table, suggestion engine | ✅ complete, minus two pieces deliberately moved to Phase 3 |
| **3** | Quote flow, payment resequencing, quote UI | 🟡 schema foundation applied; **1 of ~6 Edge Function actions written, not deployed** |
| **4** | Live ETC, overrun cascade, early-finish, calibration reporting | ⬜ not started |

**Phase 3 is roughly a fifth done, and the hard part is not the part that is
done.** The payment resequencing (§6 item 2) is rated the highest-risk item in
the entire plan and is untouched; the quote UI does not exist at all. Phase 4
has not been begun.

Independently of all of it: **Stripe has still never run end to end** — see
§4, "NOT proven". The payment path Phase 3 is about to rewrite has never been
observed working in the first place.

---

## 1. Restarting on a new machine

```bash
git clone git@github.com:EM-T-Shells/CarApp.git
cd CarApp && git checkout feature/quote-first-booking
cd carApp && npm ci
npx tsc --noEmit && npm test          # expect 83 suites / 1165 tests, all green
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

**Nothing in that table is in git.** All five are gitignored, so a fresh clone
gets you the code and none of the access. Recreating them is the whole cost of
a machine switch — budget for it before assuming something is broken.

⚠️ **`SUPABASE_ACCESS_TOKEN` (`claude-cli-token`) expires 2026-09-16.** If the
new box is set up after that, every `supabase` CLI command fails on arrival and
the failure looks like a project-ref problem, not an expiry. Mint a fresh token
(Dashboard → Account → Access Tokens) rather than copying the old one across.
Generating a new token does **not** revoke the old one; they coexist.

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

Sessions 1–4 ran on the WSL2 box. Both rows are history, not a description of
wherever you are now:

| | WSL2 box (sessions 1–4) | macOS box |
|---|---|---|
| Node | v20.20.0 | v24.15.0 |
| Supabase CLI | 2.90.0, **logged in** | 2.107.0, not logged in |
| Docker / `psql` | neither | neither |
| Maestro + simulator | unavailable | not installed |
| DB access | ✅ `db push` works | ✗ IPv6-only route |

### Establish these five facts on the new box before trusting anything below

Each one changes what a command does, and each is cheap to check. Fill in a
column above once you know them.

```bash
node -v && supabase --version && supabase projects list   # logged in?
docker info >/dev/null 2>&1 && echo docker || echo "no docker → deploy needs --use-api"
cd carApp && supabase migration list --linked --workdir "$PWD"   # DB route works?
command -v maestro || echo "no maestro → §5 step 3 stays blocked"
```

1. **Supabase CLI logged in?** `supabase login` if not. Separate from
   `SUPABASE_ACCESS_TOKEN`, and both matter.
2. **Docker present?** Without it the CLI cannot bundle an Edge Function
   locally — add `--use-api` to `functions deploy` to bundle server-side. The
   WSL2 box had no Docker and this is how the deploy was expected to run.
3. **Is there a working route to the database?** The macOS box failed here on
   an IPv6-only route, which is why `db push` never ran from it. If
   `migration list --linked` aligns, the route is fine.
4. **macOS + booted simulator + Maestro?** All three together are what §4's
   "NOT proven" list has been waiting on since the beginning — Stripe end to
   end, the 409 → provider UI path, and `Intl` under Hermes. If the new box has
   them, that backlog opens up and is worth doing before more of Phase 3 is
   written on top of an unobserved payment path.
5. **Node major version.** Sessions 1–4 were on Node 20. Nothing is known to
   need it; if the new box is on 22/24 and something odd appears in Jest, this
   is the variable that changed.

The IPv4 DNS pin (`scripts/lib/ipv4-dns.mjs`, §2) is committed and imported by
both Node scripts. It is a no-op on machines without the WSL2 resolver
behaviour, so leave it in place regardless of where you land.

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
| **Jest** — 83 suites / 1165 tests | Logic only. **Every test mocks Supabase.** | `npm test` (runs all) |
| **`.test.sql`** — 7 files | Triggers, constraints, grants, against the live DB | `supabase db query --linked -f …` |
| **`verify-checkout.mjs`** — 30 checks | The real client payload against the real grants | `npm run verify:checkout` |
| **Maestro** — `booking-flow.yaml` | The app in a simulator | needs macOS + simulator |

A Jest test **cannot** prove that Postgres refuses a forged column: `supabase`
is a mock, so such a test would assert that a fake returns the error it was told
to return, and would pass just as happily against a database with the column
wide open. That is why the guard assertions live in the other two systems, and
why adding checks there does not move the Jest count.

### Proven

- **Jest: 83 suites / 1165 tests.** `npx tsc --noEmit` clean.
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

**5. `submit_quote` has never executed.** Two distinct gaps, and the second is
the easy one to miss:

- **It is not deployed.** The live function still has no `submit_quote` action.
  The deploy *was* approved and attempted at the end of the third session and
  was **blocked by Claude Code's auto-mode permission classifier**, not by
  Supabase and not by anything wrong with the code. Nothing was sent to the
  project. Re-run it by hand, or grant a Bash permission rule for
  `supabase functions deploy` and let the session do it:

  ```bash
  supabase functions deploy stripe-webhook --workdir /path/to/CarApp/carApp
  ```

  **Never add `--no-verify-jwt`** — this function must keep JWT verification
  (`.claude/rules/stripe-payments.md`). `supabase/config.toml` has no
  `[functions.stripe-webhook]` block, so the default of `true` is what applies;
  verified in that session.

  This box has no Docker. If the CLI tries to bundle locally and fails on that,
  add `--use-api` to bundle server-side instead.
- **Its Edge Function half is not type-checked by anything on the WSL2 box.**
  `tsconfig.json` excludes `supabase/functions/*/index.ts` (the remote imports
  would not resolve) and Deno is not installed, so `npx tsc --noEmit` says
  nothing about the action body. `_shared/quote.ts` *is* covered — it is
  outside the exclude list precisely because it carries no remote imports, and
  its 54 tests exercise the shipping code rather than a re-implementation. The
  uncovered part is the Supabase plumbing: the selects, the guarded update, the
  ownership check. **The deploy is the first thing that compiles it**, so treat
  a deploy failure as the expected first signal, not a surprise.

  The line to watch in the deploy output is the new
  `import { prepareQuote, QUOTABLE_STATUSES } from '../_shared/quote.ts';`. If
  that path fails to resolve, the function does not boot and **every** payment
  action goes down with it — not just the new one. Ten other functions already
  import from `../_shared/` the same way, so it should resolve; check
  `accept_booking` still works after the deploy regardless.

---

## 5. Do this first, in this order

0. **Confirm you are where this document says you are.** Two minutes, and it
   distinguishes "something drifted" from "something broke":

   ```bash
   cd CarApp && git log --oneline -1        # expect d0768db or later
   git status --short                       # expect empty
   cd carApp && npx tsc --noEmit && npm test # expect 83 suites / 1165 tests
   npm run verify:checkout                  # expect 30/30 against the live project
   supabase migration list --linked --workdir "$PWD"   # expect 15 aligned rows
   ```

   `verify:checkout` is the one worth running every time: it is the only check
   that exercises the real client payload against the real grants, so it catches
   a booking-screen change that no Jest test can (they all mock Supabase).

   **`submit_quote` is committed.** The third session left it in the working
   tree; `d0768db` carries all nine of those paths, so a clean `git status` is
   now the healthy state rather than a warning sign:

   ```
   carApp/supabase/functions/_shared/quote.ts                # the quote grammar
   carApp/supabase/functions/_shared/__tests__/quote.test.ts  # 54 tests
   carApp/supabase/functions/stripe-webhook/index.ts          # the submit_quote action
   carApp/src/lib/stripe/index.ts                             # submitQuote() wrapper
   carApp/src/lib/stripe/__tests__/index.test.ts
   .claude/rules/edge-functions.md
   ARCHITECTURE.md
   Blueprint/quote_first_booking.md
   Blueprint/quote_first_booking_handoff.md
   ```

   **Committed is not deployed.** The live function still has no `submit_quote`
   action — re-verified this session against project `apbubklogxgqkokbctwz`:
   `stripe-webhook` is at version 20, its action switch ends at `connect_status`,
   and it does not import `../_shared/quote.ts`. `verify_jwt` is still `true`.
   `git show --stat d0768db` if a fresh clone looks wrong.

1. **Deploy `stripe-webhook`** (§4.5). It is the only thing that compiles the
   `submit_quote` action, and everything else in Phase 3 builds on top of it.
2. **Then `accept_quote`.** See §6. It is the natural next action and the one
   that carries the `total_amount − deposit_amount` trap; nothing below the
   Stripe line is blocked.
3. **On a Mac:** `brew install maestro`, boot a simulator,
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

**`submit_quote` is done** — `stripe-webhook` action, grammar and totals in
`_shared/quote.ts`, client wrapper `submitQuote()`. No migration was needed.
Spec §9 has the four decisions behind it; the two that will bite elsewhere are
that it verifies caller ownership (**the older actions in that file still do
not**) and that it writes `quoted_total_amount` only, leaving `total_amount`
and `deposit_amount` to `accept_quote`.

**What is left, in rough dependency order:**

1. The remaining Edge Function actions — `accept_quote`,
   `request_more_photos`, `adjust_job_duration`, `propose_reschedule` /
   `respond_reschedule` — following the guarded-transition pattern
   (`.eq('status', …)` + 409 on mismatch) `acceptBooking` already uses.
   `notify-quote-ready` is also unbuilt and `submit_quote` already calls it.
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
- `service_duration_modifiers.delta_price` is stored and **still applied to
  nothing** — `submit_quote` did not change this, and it is easy to assume it
  did. That action takes `quote_line_items` exactly as the provider states them
  and validates the grammar; nothing reads `delta_price` to build them. Wiring
  it up belongs to `QuoteBuilder` (item 3), which should pre-fill the surcharges
  from the modifiers and let the provider edit them before sending. It must
  stay that way round — pre-filled on the client, validated and totalled on the
  server — because wiring a provider-writable table into `derive_booking_amounts`
  would hand the client an indirect route to the totals it was denied.
- `DayTimeline` already takes a `proposed` slot and flags collisions, so
  `QuoteBuilder` needs the mapping, not the geometry.
- `VehicleConditionForm` is presentational and controlled, so the provider's
  re-quote screen can reuse it with different plumbing.

**Carried over from Phase 2**, both deferred to Phase 3 deliberately:

- The **intake photo uploader**. Schema, CHECK and the customer INSERT policy
  are in place and tested; no UI writes an `'intake'` row yet.
- **Package tiers and ranges** — `duration_min_mins`, `duration_max_mins`,
  `tier`, `parent_package_id` (spec §4). These belong with `PackageSelector`,
  which is Phase 3's. **This is the only remaining Phase 3 item that needs a
  migration** — everything else in §6 writes columns that already exist, which
  is why `submit_quote` needed no DDL and no approval to build.

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
