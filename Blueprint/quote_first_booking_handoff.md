# Quote-First Booking — Session Handoff

**Updated:** 2026-10-12 (eighth session) · **Branch:** `feature/quote-first-booking`
**Head:** `afe2b4b` ("phase 3 booking done") + this session's uncommitted work
(nothing committed — the user has not asked for a commit). **Phase 4 is
complete in code and verified against the live project**: migration
`20260823000000` applied, `stripe-webhook` v27 + `notify-eta-changed` v1
deployed, all three live verifiers green, Jest **105 suites / 1480 tests**,
`tsc` clean, admin Playwright **6/6**.
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state, including "Phase 4 — complete")

This is the *operational* handoff: environment, what is proven versus merely
written, and what to do first. The design and per-phase state live in the spec;
this does not duplicate them.

> **One-line summary:** Phases 0–4 are **applied, deployed and green**. The
> provider can report running late (+15/+30/+60, back down), the customer's
> arrival / ready-by time follows live and they are pushed when it moves
> materially, later jobs the delay reaches are listed for the provider to
> tell / reschedule / leave, finishing early offers the next customer an
> earlier start, and calibration is reported to providers and admins —
> `verify:job-day` **20/20**, `verify:quote-flow` **22/22**, `verify:checkout`
> **38/38**, SQL **9 suites / 179 checks**. What has still never run is
> **anything on a device**: a real card, and every screen (Phase 4's included).
>
> **To resume: §5.** On a new machine, §1 first.

### Decisions made in session 8 (by the user: "build it fully; tweaks after")

The defaults recommended at the start of the session were taken:

1. **A delay moves the ETA, not the slot.** `running_late_mins` feeds the
   generated `estimated_completion_at`; `occupied_range` is untouched, so a
   report can never fail on the overlap guard.
2. **A later customer is told, not moved.** The cascade is a list for the
   provider (tell / propose a new time / leave it); early finish offers an
   earlier start as a proposal.
3. **Calibration for both audiences.** Providers see their own (More →
   Manage), admins everyone (admin panel → Calibration).
4. **Dedupe window 10 min** (not in the spec), bypassed by a ≥30 min change;
   materiality 15 min as the spec says. Both constants are in
   `_shared/eta.ts` and easy to tune.

Also fixed in the same pass, because the user asked for the booking feature to
be fully functional: §4 open issues #2 (timezone check), #3 (money units on
the list screens) and #4 (ownership checks on the older actions).

### Where the whole plan stands

| Phase | Scope | State |
|---|---|---|
| **0** | Duration columns, backfill, ready-by display | ✅ complete |
| **1** | Buffers, working hours, timezone, time-off, `EXCLUDE` constraint, RLS tightening | ✅ complete |
| **2** | Vehicle size, condition questions, modifier table, suggestion engine | ✅ complete |
| **3** | Quote flow, payment resequencing, quote UI | ✅ complete in code, live-verified except a real card (§4) |
| **4** | Live ETC, overrun cascade, early-finish, calibration reporting | ✅ complete, live-verified except on a device (§4) |

---

## 1. Restarting on a new machine

```bash
git clone git@github.com:EM-T-Shells/CarApp.git
cd CarApp && git checkout feature/quote-first-booking
cd carApp && npm ci
npx tsc --noEmit && npm test          # expect 105 suites / 1480 tests, all green
```

If that is green, the JavaScript half of the project is fully restored.

### What must exist before you launch Claude Code

| # | Thing | Why | How to check |
|---|---|---|---|
| 1 | `carApp/.env.local` | gitignored, recreated by hand | `npm run verify:checkout` fails loudly without it |
| 2 | `admin/.env.local` | **easy to forget** — the admin panel is a separate Vite app with its own env file. **Missing on the WSL2 box as of 2026-10-12**; only `npm run dev` against the live project needs it — `npm run test:e2e` brings its own dummy env | `cd admin && npm run dev` |
| 3 | `.mcp.json` (repo root) | the hosted Supabase MCP | `/mcp` in an interactive session |
| 4 | `SUPABASE_ACCESS_TOKEN` | every CLI command that talks to the API | `supabase projects list` |
| 5 | `SUPABASE_DB_PASSWORD` | applying migrations | `supabase db push` |

**Nothing in that table is in git.** All five are gitignored, so a fresh clone
gets you the code and none of the access. Recreating them is the whole cost of
a machine switch — budget for it before assuming something is broken.

✅ **Both credentials were replaced on 2026-09-23 and the WSL2 box is working.**
The token that expired 2026-09-16 (`claude-cli-token`) was replaced, and the
**database password was reset the same day** — the stored one had gone stale
and every `--linked` command failed `SASL auth (SQLSTATE 28P01)`. Both now live
in `~/.bashrc` (one export line each; there were previously two conflicting
`SUPABASE_ACCESS_TOKEN` lines, and the second silently won).

If you need to redo this on another machine: mint at Dashboard → Account →
Access Tokens and revoke the old row while you are there — generating a new
token does **not** revoke the old one; they coexist. Then update `.mcp.json`
too: the Supabase MCP entry carries its own copy of the credential and fails
independently of the CLI.

Two failure modes worth recognising, because neither says what it means:

- A **dead token** surfaces as `Unauthorized` from the API and, in some CLI
  paths, as a misleading `Cannot find project ref`. That same "cannot find
  project ref" line also appears harmlessly when you run from the repo root
  instead of `carApp/` — the link state lives in `carApp/supabase/.temp/`.
- A **stale DB password** surfaces as `failed SASL auth (SQLSTATE 28P01)` and
  blocks `migration list`, `db query` and `db push` while leaving every
  API-based command (including `functions deploy`) working perfectly. The two
  credentials fail independently.

⚠️ **Never check a credential with `${VAR:-fallback}`** — that prints the value
when the variable is set, which is how §2's exposure happened and how it
happened *twice more* on 2026-09-23. Use `${VAR:+set}`, which answers the same
question without echoing anything.

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

Sessions 1–8 have all run on the same Windows/WSL2 box, last confirmed
working there on 2026-10-12. The macOS column is from a machine that has not
been used since:

| | Windows/WSL2 box (sessions 1–8) | macOS box |
|---|---|---|
| Node | v20.20.0 (npm 11.12.0) | v24.15.0 |
| Supabase CLI | 2.90.0 — token and DB password both working (2026-10-12) | 2.107.0, not logged in |
| Docker / `psql` / Deno | none | none |
| Maestro + simulator | unavailable | not installed |
| DB access | ✅ `db push`, `db query`, `gen types` all worked 2026-10-12 | ✗ IPv6-only route |
| Playwright (admin) | ✅ Chromium headless shell installed 2026-10-12; `admin/node_modules` via `npm ci` | — |

**Everything gated on macOS is still gated** (§4, "NOT proven"): a real card
through the quote flow, the real-409 path, and `Intl` under Hermes. No session
has yet run on a machine with macOS *and* a booted simulator *and* Maestro at
the same time, and CLI 2.118.0 is now current if you are installing fresh.

### Establish these five facts on the new box before trusting anything below

Each one changes what a command does, and each is cheap to check. Fill in a
column above once you know them.

```bash
node -v && supabase --version && supabase projects list   # logged in?
docker info >/dev/null 2>&1 && echo docker || echo "no docker → deploy needs --use-api"
cd carApp && supabase migration list --linked --workdir "$PWD"   # DB route works?
command -v maestro || echo "no maestro → §5 step 2 stays blocked"
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
   "NOT proven" list has been waiting on since the beginning — a real card
   through the quote flow, the 409 → provider UI path, `Intl` under Hermes,
   and now every Phase 4 screen and the first Realtime event. If the new box
   has them, that is the most valuable thing to do (§5 step 2).
5. **Node major version.** Sessions 1–8 were on Node 20. Nothing is known to
   need it; if the new box is on 22/24 and something odd appears in Jest, this
   is the variable that changed.

The IPv4 DNS pin (`scripts/lib/ipv4-dns.mjs`, §2) is committed and imported by
all three Node scripts (`seed-e2e`, `verify-checkout`, `verify-quote-flow`). It is a no-op on machines without the WSL2 resolver
behaviour, so leave it in place regardless of where you land.

---

## 2. API keys — resolved, but know the shape of it

> ⚠️ **It happened again on 2026-09-28.** The `sb_secret_…` key in
> `carApp/.env.local` had been deleted from the project (the project listed one
> secret key; its prefix matched nothing local), so `seed:e2e` failed with
> `Unregistered API key`. The fix is a key from **Project Settings → API Keys →
> "Publishable and secret API keys" → Secret keys**. The first replacement
> pasted from the **"Legacy API keys"** tab instead — an `eyJ…` JWT — which is
> disabled and fails `401 Legacy API keys are disabled`. Check a key without
> printing it: compare its first 15 characters against
> `supabase projects api-keys` programmatically, or call
> `/auth/v1/admin/users?per_page=1` with it and read only the status code.

**Legacy API keys were disabled on this project on 2026-06-24T01:28:08Z.** The
publishable key (`EXPO_PUBLIC_SUPABASE_KEY`) was migrated at the same time, but
`SUPABASE_SERVICE_ROLE_KEY` in `carApp/.env.local` was missed and sat on the old
`eyJ…` JWT until this session, returning:

```
401 {"message":"Legacy API keys are disabled", "hint":"…disabled on 2026-06-24…"}
```

**Resolved on 2026-09-23** — a new `sb_secret_…` key went into `.env.local`
(then `verify:checkout` 30/30). That key was itself gone from the project by
2026-09-28 (the box at the top of this section); a fresh one is in place and
`verify:checkout` is 38/38.

Worth knowing if it recurs:

- The symptom is confined to `seed:e2e`, `verify:checkout` and
  `verify:quote-flow`, the only things that use the service role locally. **Deployed Edge Functions are
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

It then happened **twice more on 2026-09-23**, in the same way, for the same
reason — `${VAR:-UNSET}` and `${VAR:-NO}` used as presence checks. The trap is
easy to fall into precisely because the command *looks* like it only reports
yes/no. It does not. **Use `${VAR:+set}` and nothing else.**

**Status: both exposed values are now dead**, and neither was retired because
of the exposure:

- The token expired 2026-09-16 and was replaced 2026-09-23.
- The database password was reset 2026-09-23 because it had gone stale and was
  failing `28P01` — the leak and the fix coincided by luck, not by plan.

The original "not rotated, on evidence" reasoning, kept because it governs any
future exposure:

- The transcript is `~/.claude/projects/-home-getaskale-CarApp/<uuid>.jsonl`,
  mode `-rw-------`, on the WSL2 VM's own ext4 disk — **not** a `/mnt/c`
  Windows mount, so OneDrive and File History cannot reach it. No sync folders
  in `$HOME`.
- Anyone able to read it can already read `carApp/.env.local` on the same
  filesystem with the same ownership, which holds the service role, Stripe and
  Firebase keys. The transcript duplicates an existing local secret rather than
  widening the blast radius.

**Rotate if any of these become true:** a transcript is pasted into an issue,
bug report or support ticket; backup/sync starts reaching the WSL filesystem;
or the machine becomes shared or is handed on. Then revoke the token row
outright (Dashboard → Account → Access Tokens → ⋮ → Revoke — *generating a new
token does not revoke the old one*, they coexist) and reset the database
password under Project Settings → Database.

> ⚠️ Unrelated to the above and easy to conflate: the **service role key** WAS
> replaced on 2026-09-23 (legacy keys disabled) and again on 2026-09-28 (the
> stored key had been deleted from the project) — neither time because it
> leaked.

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

All ten Phase 0–4 migrations applied; `supabase migration list --linked`
aligns on every row (17 rows in total, including the seven that predate this
work). Nine of the ten carry a `.test.sql` suite, all green on 2026-10-12
(179 checks).

| Migration | SQL test | Checks |
|---|---|---|
| `20260817000000_booking_duration` | — | — |
| `20260817120000_bookings_update_column_guard` | ✅ | 12/12 |
| `20260817140000_bookings_server_derived_pricing` | ✅ | 15/15 |
| `20260818000000_booking_buffers_and_overlap_guard` | ✅ | 18/18 |
| `20260818120000_provider_profiles_column_guard` | ✅ | 15/15 |
| `20260819000000_provider_working_hours_and_time_off` | ✅ | 21/21 |
| `20260820000000_intake_vehicle_size_and_modifiers` | ✅ | 25/25 |
| `20260821000000_quote_statuses_and_arrival_windows` | ✅ | 21/21 |
| `20260822000000_quote_flow_completion` | ✅ | 29/29 |
| `20260823000000_live_eta_and_calibration` | ✅ | 23/23 |

`20260823000000` (Phase 4) adds `running_late_mins` (0–720) and
`eta_notified_at` / `eta_notified_completion_at` (both-or-neither), all
server-only; redefines `estimated_completion_at` to add `running_late_mins`
(PG 17 `SET EXPRESSION`); adds `trg_reset_running_late_on_start`; adds
`bookings` to the `supabase_realtime` publication; adds
`get_duration_calibration(p_since)` (SECURITY DEFINER, `authenticated` only);
and replaces the `pg_timezone_names` scan in `validate_provider_schedule()`.
It was dry-run first (migration + suite in one rolled-back transaction with
`lock_timeout`/`statement_timeout`), then pushed: the whole thing took about a
second on a healthy instance.


`20260822000000` adds `pending_adjustment_approval` (inside the overlap guard),
eight server-only booking columns (`stripe_setup_intent_id`,
`info_request_note`, `proposed_scheduled_at`, `reschedule_proposed_by`,
`adjustment_*`), revokes the client's UPDATE on `scheduled_at`, extends the
line-item grammar to `adjustment_line_items`, and adds package tiers, duration
ranges and add-ons (`parent_package_id`) with two triggers:
`trg_validate_service_package_hierarchy` and `trg_validate_booking_addons`. It
recategorised the three live `'addon'` packages to `detailing` and narrowed the
CHECK. `bookings_update_column_guard.test.sql` was updated to expect the revoked
reschedule. All suites wrap in a transaction and `ROLLBACK`:

```bash
cd carApp
for f in bookings_update_column_guard bookings_server_derived_pricing \
         booking_buffers_and_overlap_guard provider_profiles_column_guard \
         provider_working_hours_and_time_off intake_vehicle_size_and_modifiers \
         quote_statuses_and_arrival_windows quote_flow_completion \
         live_eta_and_calibration; do
  supabase db query --linked -f supabase/migrations/__tests__/$f.test.sql
done
# expect every row's pass = t
```

`quote_flow_completion.test.sql` and `live_eta_and_calibration.test.sql` borrow
two existing provider profiles rather than inserting one — see §7 on
`pg_timezone_names` for why. (That trigger is fast now, but the suites were not
rewritten.)

`carApp/supabase/schema.sql` carries the Phase 0, 1 and 4 booking columns and
says so; the Phase 2–3 columns and grants are only in their migrations, which
are the source of truth for this work.

---

## 4. What is proven, and what is not

### Seven test systems, and they do not substitute for each other

Worth knowing before reading the numbers below, because the obvious reading of
"Jest is green" is wrong:

| System | Scope | How to run |
|---|---|---|
| **Jest** — 105 suites / 1480 tests | Logic only. **Every test mocks Supabase.** | `npm test` (runs all) |
| **`.test.sql`** — 9 files, 179 checks | Triggers, constraints, grants, against the live DB | `supabase db query --linked -f …` |
| **`verify-checkout.mjs`** — 38 checks | The real client payload against the real grants | `npm run verify:checkout` |
| **`verify-quote-flow.mjs`** — 22 checks | The Phase 3 Edge Function actions, called as the real customer and provider | `npm run verify:quote-flow` |
| **`verify-job-day.mjs`** — 20 checks | Phase 4: running late, the ETA push and its dedupe, the knock-on, start/overrun, the older actions' owner checks, the calibration report's visibility | `npm run verify:job-day` |
| **Admin Playwright** — 6 specs | The admin panel, hermetic (every Supabase call intercepted) | `cd admin && npm run test:e2e` |
| **Maestro** — `quote-flow*.yaml`, `job-day-provider.yaml` | The app in a simulator | needs macOS + simulator |

A Jest test **cannot** prove that Postgres refuses a forged column, or that an
Edge Function refuses the wrong party: `supabase` is a mock. That is why the
guard assertions live in the SQL suites and the two verifiers.

### Proven (2026-10-12)

- **Jest 105 / 1480, `tsc` clean.** New: `_shared/__tests__/eta.test.ts` (41 —
  the shipping cascade, dedupe, early-finish and message code), the job-day
  wrappers, the Realtime/calibration queries, `RunningLateCard` /
  `DelayKnockOn` / `EstimateAccuracyCard`, and the job, booking, list and
  approval screens' Phase 4 behaviour.
- **SQL: 9 suites / 179 checks green**, including `live_eta_and_calibration`
  (23): a delay moves the ready-by and not the slot, a start clears it, neither
  party can write it, the report shows each party only what it should, the
  timezone check refuses what the catalog scan refused in well under a second.
- **`verify:job-day` 20/20 — the first live run of every Phase 4 action**, plus
  `verify:checkout` 38/38 and `verify:quote-flow` 22/22 still green after the
  deploy (so the new owner checks broke nothing on the Phase 3 path).
- **Deployed** with `--use-api`: `stripe-webhook` v27, `notify-eta-changed` v1,
  both `verify_jwt: true` (`stripe-events` untouched, still `false`). Source
  mtimes confirm nothing was edited after the deploy.
- **The Edge Function bodies type-check** under the scratch shim (§7),
  including `stripe-webhook`, `stripe-events` and `notify-eta-changed`.
- **Admin Playwright 6/6** (3 new calibration specs, 3 existing vetting specs).

Still true from 2026-09-28: the Phase 3 bullets (SetupIntent recorded,
`stripe-webhook` reaches the notify functions, and so on).

### ⚠️ NOT proven

**1. A real card, still.** No SetupIntent has been *completed* (the verifier
creates one but cannot attach a card), so none of these has run: the setup-mode
PaymentSheet, `confirm_setup_intent` on a succeeded intent (and the
`notify-quote-requested` it fires), `accept_quote`'s off-session charge
(`next: 'deposit_processing'`), the 3-D Secure / decline fallback to the
PaymentSheet, `stripe-events` confirming a quote-first booking, and its new
refund-if-cancelled branch. Needs macOS + a booted simulator + Maestro, test
card 4242…, and 4000 0027 6000 3184 for the 3-D Secure fallback.

**2. The 409 → provider UI path, and `Intl` under Hermes.** Unchanged from
earlier sessions.

**3. No screen has been seen running.** Everything UI is Jest + `tsc` only,
including all of Phase 4's: the running-late card, the knock-on panel, the
early-finish alert, the customer's running-late card and its live update, the
accuracy card and the above-advertised note.

**3a. Realtime has never delivered an event to a device.** The publication is
proven (SQL suite) and the subscription's shape is unit-tested, but no client
has received a `postgres_changes` event yet. Until it has, assume the
customer's screen updates on pull-to-refresh and on the push.

**3b. No push has been seen on a device.** The in-app `notifications` rows prove
each notify function ran; FCM delivery needs a device with a token.

**4. The Maestro flows are written but have never run.** `booking-flow.yaml`
and the reschedule step of `bookings-management.yaml` are **stale** — they drive
the deposit-first screen and the direct reschedule that no longer exist (noted
in `e2e/README.md`).

### Open issues — each needs a decision

1. **`service_packages` has no column allowlist** — a provider can very likely
   set `is_approved` on their own package (§8). Unchanged; it needs a decision
   on which columns an admin owns.
2. **The inbox's Realtime subscription has never worked.** `supabase_realtime`
   was empty until `20260823000000` added `bookings`; `messages` is still not
   in it, so `inbox/[threadId].tsx`'s `thread:{id}` channel receives nothing
   and new messages appear only on reload. One line (`ALTER PUBLICATION
   supabase_realtime ADD TABLE public.messages`) — not done because it is
   outside the booking feature.

Fixed in session 8 (were #2–#4 here): the working-hours timeout (the
`pg_timezone_names` scan is gone), the list screens showing dollars as cents,
and the older `stripe-webhook` actions with no ownership check.

---

## 5. Do this first, in this order

0. **Confirm you are where this says.**

   ```bash
   cd CarApp && git status --short         # this session's work, uncommitted
   cd carApp && npx tsc --noEmit && npm test   # expect 105 suites / 1480 tests
   supabase migration list --linked --workdir "$PWD"   # expect 17 aligned rows
   npm run verify:checkout                 # expect 38/38
   npm run verify:quote-flow               # expect 22/22
   npm run verify:job-day                  # expect 20/20
   ```

   If a verifier fails at sign-in with `Unregistered API key` or `Legacy API
   keys are disabled`, it is the service key again — §2. `verify:job-day`
   creates its jobs two hours out; a `23P01` on its fixtures means the seeded
   provider already has a real job in that slot.

1. **Commit**, when asked — nothing from session 8 is committed. It spans the
   migration + its suite, `stripe-webhook` (report_delay + owner checks),
   `notify-eta-changed`, `_shared/eta.ts`, the regenerated types, three new
   provider components, five screens, the admin Calibration page + spec, a
   verifier, a Maestro flow and the docs.
2. **On a Mac: the card, and now the job day.** `brew install maestro`, boot a
   simulator, then the Phase 3 sequence (`quote-flow.yaml` first half →
   `quote-flow-provider.yaml` → second half, then the 3-D Secure card), then
   `job-day-provider.yaml`. Watch for: the customer's booking screen updating
   **without a refresh** when the provider taps +15 (that is the first time
   Realtime will have delivered anything — §4 3a), the push arriving, and the
   early-finish alert after Complete Job.
3. **Rewrite the stale Maestro steps** (`booking-flow.yaml`, the reschedule
   step in `bookings-management.yaml`) against the quote-first screens.
4. **Decide the two open issues** (§4): the `service_packages` allowlist, and
   whether to publish `messages` to Realtime.
5. **Tweaks the user deferred**: the dedupe window and thresholds
   (`_shared/eta.ts`), the calibration flag thresholds
   (`admin/src/pages/Calibration.tsx`), and copy.

## 6. What was built

### Phase 4 (session 8)

| Piece | Where |
|---|---|
| Rules: delay grammar, horizon, ETA push materiality + dedupe, cascade, early finish, push copy | `supabase/functions/_shared/eta.ts` (+ `__tests__/eta.test.ts`) |
| `report_delay` action; owner checks on every older action; `capture_balance` from `in_progress` only | `supabase/functions/stripe-webhook/index.ts` |
| Push to the customer, times on the provider's clock | `supabase/functions/notify-eta-changed/index.ts` |
| Schema, trigger, Realtime, calibration report, timezone check | `supabase/migrations/20260823000000_live_eta_and_calibration.sql` |
| `reportDelay` wrapper; older wrappers now surface the server's reason | `src/lib/stripe/index.ts` |
| `subscribeToBookingChanges` (channel `booking:{id}`), `getDurationCalibration` | `src/lib/supabase/queries.ts` |
| Lateness wording: `resolveRunningLateMins`, `resolveExpectedArrival`, `formatLateness` | `src/utils/duration.ts` |
| `quoteAboveAdvertised` | `src/utils/packages.ts` |
| Running late (+15/+30/+60, −15, back on time), knock-on panel + its reschedule sheet, ready-by line, early-finish alert | `app/(provider-tabs)/jobs/[bookingId].tsx`, `RunningLateCard`, `DelayKnockOn` |
| Running-late card, live via Realtime | `app/(tabs)/bookings/[id].tsx` |
| Lateness line on the customer's list; dollars-as-cents fixed on both lists | `app/(tabs)/bookings/index.tsx`, `app/(provider-tabs)/jobs/index.tsx` |
| "Above the $X–$Y Dana lists" note | `app/(tabs)/bookings/quote/[bookingId].tsx` |
| Provider's own estimate accuracy | `EstimateAccuracyCard` on `app/(provider-tabs)/more/manage.tsx` |
| Admin calibration report (largest markup first, flags) | `admin/src/pages/Calibration.tsx`, `/calibration`, link from the queue |
| `eta_changed` → `/bookings/[id]` | `src/lib/notifications/push.ts` |

Three design points worth not re-deriving:

- **A delay is absolute, not an increment.** The client sends current + 15, so
  a retried request restates the same delay instead of stacking another 15.
- **The ETA push is decided by `report_delay`, not by the notify function.**
  The baseline is what the customer was last *told*
  (`eta_notified_completion_at`, or the plan), so drift that was held back by
  the dedupe window accumulates until it is material; the claim on
  `eta_notified_at` is a guarded write so two racing reports push once.
- **The early-finish planner only looks at today.** Offering to pull
  tomorrow's first job forward to this afternoon is not an early finish, so the
  job screen filters the day schedule to the provider's local day.

### Phase 3

The spec's Phase 3 list is done. Canonical per-action behaviour is
`.claude/rules/edge-functions.md`; this is the map.

**Server (`stripe-webhook`)** — every new action resolves which side of the
booking the caller is on (`requireParty`) before writing:

| Action | Who | Does |
|---|---|---|
| `create_setup_intent` / `confirm_setup_intent` | customer | Save a card for the request; Stripe confirms it, then the provider is notified |
| `accept_quote` (changed) | customer | Writes the amounts, then charges the deposit off-session to the saved card; PaymentSheet fallback via `next: 'requires_deposit'` + `charge_error` |
| `request_more_photos` / `provide_customer_info` | provider / customer | Send an unpriced request back with a note, and return it |
| `adjust_job_duration` / `withdraw_adjustment` | provider | Propose / withdraw a longer or dearer confirmed job |
| `respond_adjustment` | customer | Approve (deposit kept, charges itemised) or decline (cancel, full refund, no fee) |
| `propose_reschedule` / `respond_reschedule` | either | Propose a new start; only the other party accepts; the proposer withdraws |
| `cancel_booking` / `provider_cancel_booking` (changed) | customer / provider | Now owner-checked, cover unpriced and adjustment states, fees only on committed bookings |
| `capture_balance` (changed) | provider | Counts only before/after photos; refuses while an adjustment is pending |

`stripe-events` now refunds a deposit that succeeds on a booking already
cancelled (the customer cancelled while the off-session charge was in flight —
cancel_booking finds no succeeded deposit to refund at that moment).

Pure logic lives in `_shared/quote.ts` (`prepareAdjustment`,
`appendLineItems`, `validateRescheduleStart`, `rescheduleResponseAllowed`,
`validateInfoRequestNote`) and the new `_shared/bookingPolicy.ts`
(`CANCELLABLE_STATUSES`, `cancellationFeeApplies`, `planDepositCollection`).

**Client:**

| Piece | Where |
|---|---|
| Booking screen: `PackageSelector`, intake photos, card setup, abandon on dismiss | `app/(tabs)/search/book/[providerId].tsx` |
| `PackageSelector` (tiers, price + duration ranges, nested add-ons) | `src/components/booking/PackageSelector.tsx`, `src/utils/packages.ts` |
| `IntakePhotoUploader` + `uploadIntakePhoto` | `src/components/booking/IntakePhotoUploader.tsx` |
| Approval screen: `deposit_processing` / `requires_deposit` / `none` | `app/(tabs)/bookings/quote/[bookingId].tsx` |
| Customer detail: more-info card, intake photos, adjustment review, reschedule proposal, cancel request | `app/(tabs)/bookings/[id].tsx`, `AdjustmentReviewCard`, `RescheduleProposal` |
| Provider quote screen: photos, surcharges pre-filled from `delta_price`, ask for more, decline | `app/(provider-tabs)/jobs/quote/[bookingId].tsx`, `surchargeLineItems` in `src/utils/suggestion.ts` |
| Provider job screen: Adjust Job (QuoteBuilder, no window), withdraw, New Time, answer proposals | `app/(provider-tabs)/jobs/[bookingId].tsx` |
| Package editor: tier, duration range, add-on parent; `'addon'` category gone | `src/components/provider/ServiceMenuEditor.tsx` |
| Customer bookings list shows unpriced requests ("Awaiting quote") | `getUpcomingBookingsForCustomer` |
| Push routes for the new notification types | `src/lib/notifications/push.ts` |

Three design points worth not re-deriving:

- **Surcharges and the advertised range are surcharge-only.** `QuoteBuilder`'s
  amount entry is deliberately unsigned (its test says so), so a discount
  modifier is neither pre-filled nor shown as the bottom of a price range —
  the range runs from the base price up to what the modifiers could add.
- **The deposit PaymentIntent is created, recorded, then confirmed.**
  Confirming in the create call would let `payment_intent.succeeded` reach
  `stripe-events` before the payments row exists, leaving the deposit
  `pending` forever.
- **`bookings_adjustment_state_check` ties the adjustment columns to the
  status.** Every exit from `pending_adjustment_approval` — approve, withdraw,
  decline, *and any cancel* — must null them in the same UPDATE, or it fails.
  The cancel actions spread `CLEARED_PROPOSALS` for exactly this.

---

## 7. Traps already paid for — don't rediscover these

**The Realtime publication was empty.** `supabase_realtime` existed with no
tables in it, so `postgres_changes` subscriptions (the inbox's included)
received nothing, silently. `20260823000000` added `bookings`. Check
`pg_publication_tables` before assuming a subscription works.

**PG 17 can change a generated column in place.** `ALTER COLUMN … SET
EXPRESSION` keeps the column and its dependants and rewrites the table; check
`pg_depend` first (only its own `pg_attrdef` depended on
`estimated_completion_at`). Guard a re-run by reading `pg_get_expr` of the
`pg_attrdef`, or it rewrites the table every time.

**A count-based SQL assertion over "the future" is fragile.** There is a real
cancelled booking dated 2035 (another provider), so "admin sees 2 providers
since 2031" saw 3. Assert on the fixture rows, not on totals.

**`supabase db push --yes`** answers the confirmation prompt; `--dry-run`
lists what would be pushed. Both work non-interactively from Claude Code.

**Test files that mock `src/utils/date` must keep `parseISO`.** The lateness
helpers in `utils/duration.ts` call it, and a mock returning only the two
formatters crashes the card with "unmounted component". Spread
`jest.requireActual` and override the formatters.

**The admin panel runs React StrictMode in dev**, so a mount effect fires
twice and Playwright sees the initial request twice. Assert on the request you
expect to appear, not on a count or an order.

**A schema change can take the REST API down on a starved instance.**
On 2026-09-28 the project was already I/O-starved (`pg_cron` had logged "job
startup timeout" every few minutes since ~13:40 UTC; counting `pg_class` took
~4s). Applying the migration made PostgREST reload its schema cache, the reload
query hit the `authenticator` role's 8s `statement_timeout`, and every REST call
returned `503 PGRST002` — from about 17:30 to 18:11 UTC — until the user
restarted the project. After the restart the same catalog query took 26ms. Before DDL, time a trivial catalog query; if
it is slow, restart first. Diagnose with `mcp__supabase__query_logs` on
`postgrest_logs` / `postgres_logs`.

**`pg_timezone_names` is extremely slow on the hosted project** — 835 ms on a
healthy instance, ~17s to over 100s on the starved one. It reads every zone
file on disk. `trg_validate_provider_schedule` used to scan it on every
`provider_profiles` insert and timezone / working-hours update, which pushed a
SQL suite past the management API's 100s gateway limit (`HTTP 524`, output
lost, the transaction still running server-side holding its locks) and could
time out a provider saving working hours. **Fixed in `20260823000000`**: the
trigger now resolves the one zone with `AT TIME ZONE` (22023 if unknown) behind
an IANA `Area/Location` shape check, because `AT TIME ZONE` alone also accepts
abbreviations (`PDT`) and POSIX offsets (`+05`) that ignore DST. Don't put the
catalog scan back.

**Dry-run a migration with timeouts.** `BEGIN; SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s'; <migration>; <test body>; ROLLBACK;` via
`supabase db query --linked -f`. Without the timeouts a slow statement holds the
migration's ACCESS EXCLUSIVE locks on `bookings` for as long as it runs.

**`NULL IN (…)` makes a CHECK pass.** `bookings_reschedule_proposal_check` first
read `… AND reschedule_proposed_by IN ('customer','provider')`, which is NULL —
and therefore passes — when the proposer is NULL. The SQL test caught it; the
fix states `IS NOT NULL` explicitly.

**Regenerate types with `--schema public`.** Without it the CLI adds a
`graphql_public` schema the committed file never had. The remaining diff is
the generator parenthesising its helper types — cosmetic.

**Type-checking the Edge Functions without Deno.** `tsconfig.json` excludes
`supabase/functions/*/index.ts` (remote imports), so `npx tsc` says nothing
about the action bodies. A throwaway check that worked: a scratch `tsconfig`
with `moduleResolution: bundler`, `allowImportingTsExtensions`, `noEmit`, and a
`shims.d.ts` that declares `Deno.env.get`, re-exports
`'https://esm.sh/@supabase/supabase-js@2'` from the installed
`@supabase/supabase-js`, and stubs the Stripe and `std/http/server.ts` modules
(Stripe as `any` plus the handful of `Stripe.*` types the files name). Rows come
back untyped (no generated DB types in Deno), so it catches syntax, local types
and select strings, not column names. It is not committed; rebuild it in the
scratchpad when a function changes.

**Build a supabase-js select list as ONE string literal.** Concatenating it
(`'a, b, ' + 'c'`) makes the type-level parser give up and every row types as
`GenericStringError` — invisible in Deno, which does not type-check the deploy.

**`Card` takes no `testID`.** Wrap it in a `View` when a test needs to find it.

**A `jest.mock` factory runs before the test's `const mock… = jest.fn()`.**
Referencing the mock inside the factory body at definition time captures
`undefined`; read it lazily (`() => mockX`) instead.

**`verify_jwt` lived only in a command-line flag, and now lives in
`config.toml`.** `stripe-events` must stay `verify_jwt: false` or every live
Stripe delivery 401s before the handler runs. Until 2026-09-23 nothing in the
repo recorded that — it depended on whoever deployed remembering
`--no-verify-jwt`. Both Stripe functions are now declared in
`supabase/config.toml`; do not remove those blocks, and do not trust
`supabase functions list` to tell you the flag (it does not show it —
`mcp__supabase__list_edge_functions` does).

**`supabase functions download` writes into `supabase/functions/` and will
overwrite your local source.** Always download into a scratch workdir with its
own throwaway `config.toml`, never the repo. It is the only reliable way to
learn what is actually deployed, and the dashboard's `UPDATED_AT` is not — a
bundle containing code committed 2026-09-22 reported an update time of
2026-09-03.

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

**Trigger ordering is load-bearing.** `trg_derive_booking_suggestion` and
`trg_validate_booking_addons` must both run after `trg_derive_booking_amounts`,
which rebuilds `NEW.services`. Postgres fires same-timing triggers
alphabetically: `'trg_derive_booking_amounts' < 'trg_derive_booking_suggestion'
< 'trg_validate_booking_addons'`. Renaming any of them could silently read the
client's unvalidated array.

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
message sits on `error.context`, a `Response`. `readFunctionError` reads it back
out, and `acceptBooking`, `submitQuote`, `acceptQuote`, `createSetupIntent` and
every Phase 3 wrapper (through `invokeAction`) use it, and since session 8 so
do the older wrappers (`cancelBooking`, `providerCancelBooking`,
`captureBalance`, `declineBooking`, `markNoShow`, `refundDeposit`,
`createDepositPaymentIntent`) — without it the new 403/409 reasons would read
as "non-2xx status code".

**`id` must be in an INSERT grant list.** Postgres reports INSERT column denials
at *table* level (`permission denied for table bookings`), so a single ungranted
column looks like a blanket failure. Cost an hour.

**The Founding Provider Program trigger** (migration `20260622140000`) rewrites
`platform_fee_rate` to 0% for the first 100 approved providers, overriding
whatever a test fixture seeds. Set the rate *after* insert.

**`service_packages.category`** is `CHECK IN ('detailing','mechanical')` since
`20260822000000` — `'addon'` is retired (add-ons are `parent_package_id` now)
and not free text either. A fixture using `'interior'` or `'addon'` fails with
23514.

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
  `location_lng`, `notes`, `vehicle_size_class`, `condition_answers`,
  `requested_window_start`, `requested_window_end`
- **UPDATE** — `status`, `started_at`, `vehicle_size_class`,
  `condition_answers`, `requested_window_start`, `requested_window_end`.
  **`scheduled_at` was removed in `20260822000000`** — a start moves only by
  `propose_reschedule` + `respond_reschedule`
- **Status transitions** — customer `pending → cancelled`; either party
  cancelling an unpriced request (`pending_provider_quote`,
  `pending_customer_approval`, `awaiting_customer_info` → `cancelled`);
  provider `confirmed → en_route → in_progress`
- **Intake columns** — customer only, and frozen once the booking leaves
  `pending` / `pending_provider_approval`

**It cannot state a price, a duration, how much of a provider's day it takes,
which card is charged, a proposal, or a delay.** Outside both grant lists:
`buffer_before_mins`, `buffer_after_mins`, `occupied_range`,
`estimated_duration_mins`, `suggested_duration_mins`, every money column,
`quote_line_items`, `quoted_total_amount`, `stripe_setup_intent_id`,
`info_request_note`, `proposed_scheduled_at`, `reschedule_proposed_by`, the
four `adjustment_*` columns, `running_late_mins`, `eta_notified_at` and
`eta_notified_completion_at`. `quote_flow_completion.test.sql` and
`live_eta_and_calibration.test.sql` assert none of them is ever granted. The
one way a client write changes `running_late_mins` is indirect and intended:
setting `started_at` clears it (`trg_reset_running_late_on_start`).

Every `stripe-webhook` action that touches a booking or a provider profile now
checks the caller (`requireParty`, `requireBookingProvider`,
`requireProfileOwner`); `verify:job-day` checks the wrong party is refused on
each of the older ones. `get_duration_calibration` is SECURITY DEFINER and
filters to the caller's own provider profile unless `is_admin`; `anon` has no
EXECUTE.

On `provider_profiles`: INSERT `id`, `user_id`, `provider_type_id`; UPDATE
`bio`, `coverage_area`, `mile_radius`, `base_lat`, `base_lng`, `availability`,
the two `default_buffer_*_mins`, `timezone`, `working_hours`,
`max_jobs_per_day`. DELETE revoked outright. `platform_fee_rate` and
`verification_status` are **not** writable.

On `booking_photos`: INSERT `id`, `booking_id`, `photo_type`, `storage_url`,
with the customer route restricted to `photo_type = 'intake'`. UPDATE and DELETE
revoked — the before/after pair is dispute evidence. `capture_balance` counts
only `before`/`after` toward the completion minimum.

⚠️ **`service_packages` has no column allowlist.** `"service_packages: write
own"` is `FOR ALL` with no column restriction, so a provider can very likely set
`is_approved` on their own package — the same hole class `provider_profiles`
had. Not changed in this work (it needs a decision on which columns an admin
owns); flagged for the next security pass.

Edge Functions are unaffected throughout: they connect with the service role.
So do `scripts/seed-e2e.mjs` and the two verifiers' setup and cleanup.
