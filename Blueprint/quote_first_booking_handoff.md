# Quote-First Booking — Session Handoff

**Updated:** 2026-09-23 (sixth session) · **Branch:** `feature/quote-first-booking`
**Head:** `49ea09d` — working tree carries the sixth session's `config.toml`
change (§4.5). `submit_quote`, `accept_quote`, `notify-quote-ready` and the
`stripe-events` quote-first promotion are now **all deployed and compiled**.
Every server-side piece of the quote flow is live; the UI is what is missing.
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
> 3's *server* side is now **deployed** — eight migrations on the live project,
> all SQL suites passing, Jest 83 suites / 1184 tests, `tsc` clean, and all
> four quote-flow pieces live and compiled (§4.5). The quote UI still does not
> exist, so nothing in the app can start a quote-first booking yet.
>
> **To resume: run §5 step 0 to confirm the state, then go straight to the UI
> (§6 item 3).** The deploy that dominated the last two sessions is done. The
> **UI is now the whole critical path**; the remaining Edge Function actions
> are smaller than they look.
>
> **On a new machine, do §1 before §5.** The clone gives you the code and none
> of the access — five gitignored credentials have to be recreated by hand.
> The `SUPABASE_ACCESS_TOKEN` that expired 2026-09-16 was replaced on
> 2026-09-23, and the **database password was reset the same day** because the
> stored one had gone stale (`28P01`). Both are in `~/.bashrc` on the WSL2 box;
> on any other machine they must be minted fresh.

### Where the whole plan stands

Spec §8 lists five phases. The overall position, because it is easy to read a
green test count as "nearly done" and it is not:

| Phase | Scope | State |
|---|---|---|
| **0** | Duration columns, backfill, ready-by display | ✅ complete |
| **1** | Buffers, working hours, timezone, time-off, `EXCLUDE` constraint, RLS tightening | ✅ complete |
| **2** | Vehicle size, condition questions, modifier table, suggestion engine | ✅ complete, minus two pieces deliberately moved to Phase 3 |
| **3** | Quote flow, payment resequencing, quote UI | 🟡 schema applied; **2 of ~6 Edge Function actions + the resequencing deployed and live**; UI not started |
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
npx tsc --noEmit && npm test          # expect 83 suites / 1184 tests, all green
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

Sessions 1–5 have all run on the same Windows/WSL2 box, re-measured there on
2026-09-22. The macOS column is from a machine that has not been used since:

| | Windows/WSL2 box (sessions 1–5) | macOS box |
|---|---|---|
| Node | v20.20.0 (npm 11.12.0) | v24.15.0 |
| Supabase CLI | 2.90.0 — **token expired**, see above | 2.107.0, not logged in |
| Docker / `psql` | neither | neither |
| Maestro + simulator | unavailable | not installed |
| DB access | ✅ `db push` worked until the token died | ✗ IPv6-only route |

**Everything gated on macOS is still gated** (§4, "NOT proven"): Stripe end to
end, the real-409 path, and `Intl` under Hermes. No session has yet run on a
machine with macOS *and* a booted simulator *and* Maestro at the same time, and
CLI 2.117.0 is now current if you are installing fresh.

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
5. **Node major version.** Sessions 1–5 were on Node 20. Nothing is known to
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

All eight Phase 0–3 migrations applied; `supabase migration list --linked`
aligns on every row (15 rows in total, including the four that predate this
work). Seven of the eight carry a `.test.sql` suite.

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
| **Jest** — 83 suites / 1184 tests | Logic only. **Every test mocks Supabase.** | `npm test` (runs all) |
| **`.test.sql`** — 7 files | Triggers, constraints, grants, against the live DB | `supabase db query --linked -f …` |
| **`verify-checkout.mjs`** — 30 checks | The real client payload against the real grants | `npm run verify:checkout` |
| **Maestro** — `booking-flow.yaml` | The app in a simulator | needs macOS + simulator |

A Jest test **cannot** prove that Postgres refuses a forged column: `supabase`
is a mock, so such a test would assert that a fake returns the error it was told
to return, and would pass just as happily against a database with the column
wide open. That is why the guard assertions live in the other two systems, and
why adding checks there does not move the Jest count.

### Proven

- **Jest: 83 suites / 1184 tests.** `npx tsc --noEmit` clean.
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
PaymentSheet, no `stripe-events` promotion has ever been observed running.
Needs macOS + a booted simulator + Maestro; no machine so far has had all
three. **The fifth session made this worse, not better:** the quote-first
promotion it added to `stripe-events` rewrites that same unobserved path, so
there is now a new branch inside it that has also never run. Do this on the
first machine that can.

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

**5. The quote flow is deployed, but has still never been *exercised*.** All
four pieces compiled and are live as of 2026-09-23. Verified by downloading each
live bundle and diffing it against the working tree — not by trusting the
dashboard:

| Piece | Where | Live version | Source matches HEAD |
|---|---|---|---|
| `submit_quote` | `stripe-webhook` action | 25 | ✅ byte-identical |
| `accept_quote` | `stripe-webhook` action | 25 | ✅ byte-identical |
| `notify-quote-ready` | new Edge Function | 1 | ✅ byte-identical |
| quote-first deposit promotion | `stripe-events` | 9 | ✅ byte-identical |

**Compiled is not exercised.** No request has ever reached any of them: no
screen calls `submitQuote()` or `acceptQuote()`, and no row has taken either
new status. The first real call will be the first test of the Supabase plumbing
— the selects, the guarded updates, the ownership checks.

> ⚠️ **The fifth-session handoff said none of this was deployed, and that was
> wrong.** `stripe-webhook` was already at v25 carrying both actions and
> `_shared/quote.ts`. Two sessions were planned around a deploy that had
> partly happened. **Verify live state by downloading and diffing the bundle**
> — `supabase functions list` timestamps are unreliable (v25 reported
> `2026-09-03` while containing code committed `2026-09-22`):
>
> ```bash
> mkdir -p /tmp/fncheck/supabase
> printf 'project_id = "apbubklogxgqkokbctwz"\n' > /tmp/fncheck/supabase/config.toml
> supabase functions download stripe-webhook --project-ref apbubklogxgqkokbctwz \
>   --use-api --workdir /tmp/fncheck
> diff /tmp/fncheck/supabase/functions/stripe-webhook/index.ts \
>      carApp/supabase/functions/stripe-webhook/index.ts
> ```
>
> Download into a scratch workdir, never the repo — `functions download` writes
> straight into `supabase/functions/` and will overwrite local source.

The import to watch resolved: `stripe-webhook`'s `../_shared/quote.ts` bundles
correctly, so the "every payment action goes down with it" risk is retired.

**`verify_jwt` is now declared in `config.toml`, and must stay that way.**
Previously neither Stripe function was declared, and `stripe-events` relied on
`--no-verify-jwt` being remembered at the command line. Forgetting it re-gates
the endpoint and 401s every live Stripe delivery before the handler runs —
which is exactly the bug `Blueprint/fixes.md` records as already fixed once.
Both are now pinned:

```toml
[functions.stripe-webhook]
verify_jwt = true
[functions.stripe-events]
verify_jwt = false
```

Confirmed after deploying: `stripe-events` v9 still reports `verify_jwt: false`.
Check it via `mcp__supabase__list_edge_functions`, which returns the flag;
`supabase functions list` does not show it.

This box has no Docker, so every deploy needs `--use-api` to bundle
server-side.

- **The Edge Function halves are type-checked by nothing.** `tsconfig.json`
  excludes `supabase/functions/*/index.ts` (the remote imports would not
  resolve) and Deno is not installed, so `npx tsc --noEmit` says nothing about
  any action body. `_shared/quote.ts` *is* covered — it sits outside the
  exclude list precisely because it carries no remote imports, and its tests
  exercise the shipping code rather than a re-implementation, including
  `computeAcceptedAmounts`. The uncovered part is the Supabase plumbing, and
  the deploy has now compiled it; what remains untested is its behaviour.

---

## 5. Do this first, in this order

0. **Confirm you are where this document says you are.** Two minutes, and it
   distinguishes "something drifted" from "something broke":

   ```bash
   cd CarApp && git log --oneline -1        # expect 49ea09d or later
   git status --short                       # expect empty
   cd carApp && npx tsc --noEmit && npm test # expect 83 suites / 1184 tests
   npm run verify:checkout                  # expect 30/30 against the live project
   supabase migration list --linked --workdir "$PWD"   # expect 15 aligned rows
   ```

   `verify:checkout` is the one worth running every time: it is the only check
   that exercises the real client payload against the real grants, so it catches
   a booking-screen change that no Jest test can (they all mock Supabase).

   **Everything is committed, so a clean tree is the healthy state.** The quote
   flow spans two commits: `d0768db` (`submit_quote`, `_shared/quote.ts`, the
   `submitQuote()` wrapper) and `49ea09d` (`accept_quote`,
   `computeAcceptedAmounts`, `notify-quote-ready`, the `stripe-events`
   quote-first promotion, `acceptQuote()`). Run `git show --stat 49ea09d` if a
   fresh clone looks wrong.

   **Committed is not deployed, and that gap is the whole of step 1** (§4.5).
   `.claude/rules/edge-functions.md` is the canonical description of what each
   action does; prefer it over this file wherever the two disagree, because it
   is updated alongside the code and this one is not.

1. ~~Deploy~~ **Done 2026-09-23** (§4.5). All four pieces are live and
   byte-verified against HEAD. Nothing to deploy unless you change a function.
2. **The UI — this is now the critical path, and it is the whole job.**
   *Nothing in the app can start a quote-first booking* (§6 item 3). Every
   server piece below it is live and waiting for a caller.
3. **The remaining Edge Function actions** — `request_more_photos`,
   `adjust_job_duration`, `propose_reschedule` / `respond_reschedule` (§6).
   Smaller than they look; they follow a pattern that now has two worked
   examples in the same file. These can follow the UI rather than precede it.
4. **On a Mac:** `brew install maestro`, boot a simulator,
   `./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. Two seed failure modes are
   intended: an inactive/unapproved package now fails the booking at insert, and
   seeded bookings occupy real ranges with buffers, so two committed jobs close
   together for one provider will be refused.

---

## 6. Phase 3 — server side nearly done, UI not started

Rated highest-risk in spec §8. It resequences payments on top of the pricing
trigger, and the fifth session wrote the server half of that resequencing —
still entirely unrun, like everything else here.

**The additive half is already applied** (`20260821000000`, 21/21): the two
quote statuses plus `awaiting_customer_info`, `requested_window_start/end`,
`quote_line_items` / `quoted_total_amount`, and one new client transition —
either party cancelling an *unpriced* request. It changes no existing behaviour,
and **no row has yet taken any of the new statuses** — the actions that would
write them are not deployed, and no screen calls them. That was the point of
splitting it this way: the risky half gets written and reverted against a
schema already in place and tested.

**What is written and now deployed** — live as of 2026-09-23, but never yet
called by anything. `.claude/rules/edge-functions.md` carries the canonical
per-action description; this is the shape of it:

- **`submit_quote`** — the assigned provider prices an unpriced request. Writes
  `quote_line_items` and `quoted_total_amount` and moves the booking to
  `pending_customer_approval`. Charges nothing. Writes **neither**
  `total_amount` nor `deposit_amount`; a quote is a proposal.
- **`accept_quote`** — the customer approves. Writes `total_amount`,
  `deposit_amount`, `platform_fee` and `provider_payout` **together**, returns
  the booking to `pending`, and returns `next: 'requires_deposit'` so the
  client runs the existing `create_deposit_intent` + PaymentSheet flow. It
  charges nothing itself.
- **`notify-quote-ready`** — pushes the customer the quoted total. Customer
  only; the provider just sent it.
- **The `stripe-events` quote-first promotion** — a quote-first booking now
  confirms *outright* on deposit success rather than entering the 2h provider
  approval window, because the provider already committed by quoting and the
  customer approved the price. Detected by `quoted_total_amount` being
  non-null, which is NULL on every deposit-first booking ever made, so the
  legacy path is untouched by construction. On `23P01` (the provider's slot
  filled between quoting and payment) it falls back to the approval window
  rather than stranding a paid booking in `pending`.

Both new actions resolve the caller from the bearer token and verify ownership
— `verify_jwt` alone proves only that *some* authenticated user called. **The
older actions in that file still do not do this.**

> The `total_amount − deposit_amount` trap is **handled, deliberately**, and
> worth understanding before touching any of it: `accept_quote` keeps an
> already-succeeded deposit as recorded instead of recomputing it at 15%,
> because `capture_balance` charges `total_amount − deposit_amount`, so
> recomputing on a re-quote would collect `0.15A + 0.85B` instead of `B`.
> Surcharges are provider revenue, so the payout is re-derived from the quoted
> total less the stored `service_fee`. The arithmetic lives in
> `computeAcceptedAmounts` (`_shared/quote.ts`) and is Jest-tested.

**What is left, in rough dependency order:**

1. ~~Deploy all of the above~~ — **done 2026-09-23** (§4.5). Compiled and live;
   still never called.
2. The remaining Edge Function actions — `request_more_photos`,
   `adjust_job_duration`, `propose_reschedule` / `respond_reschedule` —
   following the guarded-transition pattern (`.eq('status', …)` + 409 on
   mismatch) that `acceptBooking`, `submit_quote` and `accept_quote` all now
   use.
3. **The UI — the critical path, and untouched.** `ArrivalWindowPicker`
   replacing `DateTimePicker`; `PackageSelector` with tiers and ranges;
   `QuoteBuilder`; the customer quote-review screen calling `acceptQuote()`.
   No screen can create an unpriced request today, so the entire server flow
   above is currently unreachable from the app.
4. The intake photo uploader.
5. `quote-flow.yaml` alongside `booking-flow.yaml`.

**What is already true and tested, which Phase 3 depends on:**

- The client's write surface on `bookings` cannot state a price *or* a duration.
  Anything Phase 3 adds — quote submission, price approval, duration adjustment
  — must go through an Edge Function or be added deliberately to **both** the
  column allowlist and the trigger layer. That friction is the point.
- `service_duration_modifiers.delta_price` is stored and **still applied to
  nothing** — neither `submit_quote` nor `accept_quote` changed this, and it is
  easy to assume one of them did. `submit_quote` takes `quote_line_items`
  exactly as the provider states them
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
