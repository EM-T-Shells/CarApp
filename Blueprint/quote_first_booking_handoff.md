# Quote-First Booking — Session Handoff

**Updated:** 2026-09-28 (seventh session) · **Branch:** `feature/quote-first-booking`
**Head:** `44df6bb` + this session's uncommitted work (nothing committed — the
user has not asked for a commit). **Phase 3 is complete in code and verified
against the live project**, everything except a real card: migration
`20260822000000` applied, nine Edge Functions deployed, both live verifiers
green, Jest **99 suites / 1378 tests**, `tsc` clean.
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This is the *operational* handoff: environment, what is proven versus merely
written, and what to do first. The design and per-phase state live in the spec;
this does not duplicate them.

> **One-line summary:** Phases 0–3 are **applied, deployed and green**. The
> quote-first loop now runs end to end against the real project as the real
> parties — request → card saved → more info → quote → approve, plus
> reschedule-by-proposal and adjust-and-approve on confirmed jobs —
> `verify:checkout` **38/38**, `verify:quote-flow` **22/22**, SQL **8 suites /
> 156 checks**. What has still never run is **a real card**: the SetupIntent
> sheet, the off-session deposit and the `stripe-events` promotion need a
> simulator.
>
> **To resume: §5.** On a new machine, §1 first — and see §2 for the service
> key, which was stale again this session.

### Decisions made this session (by the user — do not re-litigate)

1. **Payment resequencing: the spec's approach.** Card saved by SetupIntent at
   request (no hold, no charge); deposit charged **off-session** at approval.
   PaymentSheet remains only as the fallback (no saved card, decline, 3-D Secure).
2. **Adjustment (`adjust_job_duration`): from `confirmed` only, a new status
   (`pending_adjustment_approval`), and either side can cancel.** Implemented
   as: declining cancels with a full refund and no fee; either side may cancel
   penalty-free while it is open.
3. **Reschedule: both parties, `confirmed` only, "you decide" on the rest.**
   Decided: it replaces the customer's direct `scheduled_at` edit, whose UPDATE
   grant was revoked. The proposer may withdraw; only the other party accepts.
4. **Add-ons: child packages per spec.** `parent_package_id`, one level deep;
   the `'addon'` category is retired (the 3 live rows became `detailing`).
   Tiers are `basic` / `standard` / `premium` (the spec named none).

`request_more_photos` was built as proposed (note → `awaiting_customer_info` →
customer adds photos / changes window → `provide_customer_info`); the user did
not object.

### Where the whole plan stands

| Phase | Scope | State |
|---|---|---|
| **0** | Duration columns, backfill, ready-by display | ✅ complete |
| **1** | Buffers, working hours, timezone, time-off, `EXCLUDE` constraint, RLS tightening | ✅ complete |
| **2** | Vehicle size, condition questions, modifier table, suggestion engine | ✅ complete |
| **3** | Quote flow, payment resequencing, quote UI | ✅ complete in code, live-verified except a real card (§4) |
| **4** | Live ETC, overrun cascade, early-finish, calibration reporting | ⬜ not started |

---

## 1. Restarting on a new machine

```bash
git clone git@github.com:EM-T-Shells/CarApp.git
cd CarApp && git checkout feature/quote-first-booking
cd carApp && npm ci
npx tsc --noEmit && npm test          # expect 99 suites / 1378 tests, all green
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

All nine Phase 0–3 migrations applied; `supabase migration list --linked`
aligns on every row (16 rows in total, including the four that predate this
work). Eight of the nine carry a `.test.sql` suite, all green on 2026-09-28
(156 checks).

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
         quote_statuses_and_arrival_windows quote_flow_completion; do
  supabase db query --linked -f supabase/migrations/__tests__/$f.test.sql
done
# expect every row's pass = t
```

`quote_flow_completion.test.sql` borrows two existing provider profiles rather
than inserting one — see §7 on `pg_timezone_names` for why.

`carApp/supabase/schema.sql` has not been updated for any Phase 0–3 migration
(it predates them); the migrations are the source of truth for this work.

---

## 4. What is proven, and what is not

### Five test systems, and they do not substitute for each other

Worth knowing before reading the numbers below, because the obvious reading of
"Jest is green" is wrong:

| System | Scope | How to run |
|---|---|---|
| **Jest** — 99 suites / 1378 tests | Logic only. **Every test mocks Supabase.** | `npm test` (runs all) |
| **`.test.sql`** — 8 files, 156 checks | Triggers, constraints, grants, against the live DB | `supabase db query --linked -f …` |
| **`verify-checkout.mjs`** — 38 checks | The real client payload against the real grants | `npm run verify:checkout` |
| **`verify-quote-flow.mjs`** — 22 checks | The Phase 3 Edge Function actions, called as the real customer and provider | `npm run verify:quote-flow` |
| **Maestro** — `quote-flow.yaml` + `quote-flow-provider.yaml` | The app in a simulator | needs macOS + simulator |

A Jest test **cannot** prove that Postgres refuses a forged column, or that an
Edge Function refuses the wrong party: `supabase` is a mock. That is why the
guard assertions live in the SQL suites and the two verifiers.

### Proven (2026-09-28)

- **Jest 99 / 1378, `tsc` clean.** New suites cover the shared server grammar
  (`_shared/__tests__/quoteActions.test.ts`, `bookingPolicy.test.ts` — the
  shipping modules, not re-implementations), the Stripe wrappers, the new
  components, and all four quote-path screens.
- **SQL: 8 suites / 156 checks green** against the live project, including
  `quote_flow_completion` (29).
- **`verify:checkout` 38/38.** No longer stale: it sends the quote-first
  payload (`pending_provider_quote`, both window ends, `scheduled_at` from the
  window start) and additionally proves that stating quote line items or a
  SetupIntent is refused, a half window is refused, an add-on without its main
  service is refused (and priced with it), the client can no longer move
  `scheduled_at` but can still change its window, and the abandon path
  (`pending_provider_quote → cancelled`) works.
- **`verify:quote-flow` 22/22 — the first time any Phase 3 action ran for
  real.** Every ownership refusal (customer quoting, provider approving, either
  party accepting their own proposal, customer adjusting…), the unpriced loop
  request → more info → hand back → quote → approve → cancel, reschedule by
  proposal, adjustment approve (deposit kept as charged; balance correct) and
  decline (cancelled, no fee), a TEST-mode SetupIntent recorded on the row, and
  that `stripe-webhook` actually reaches the notify functions (an in-app
  notification row appears).
- **Nine Edge Functions deployed** with `--use-api`: `stripe-webhook` v26,
  `stripe-events` v10, `notify-booking-cancelled` v12, and six new notify
  functions at v1. `verify_jwt` confirmed via `mcp__supabase__list_edge_functions`:
  `stripe-events` false, everything else true.
- **The Edge Function bodies type-check** under a scratch shim
  (real `@supabase/supabase-js` types, stubbed `Deno`/Stripe/std). Not a
  committed gate — see §7 — but it caught one real bug (a concatenated select
  string supabase-js cannot parse).

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

**3. No screen has been seen running.** Everything UI is Jest + `tsc` only.

**4. The Maestro flows are written but have never run.** `booking-flow.yaml`
and the reschedule step of `bookings-management.yaml` are **stale** — they drive
the deposit-first screen and the direct reschedule that no longer exist (noted
in `e2e/README.md`).

---

## 5. Do this first, in this order

0. **Confirm you are where this says.**

   ```bash
   cd CarApp && git status --short         # this session's work, uncommitted
   cd carApp && npx tsc --noEmit && npm test   # expect 99 suites / 1378 tests
   supabase migration list --linked --workdir "$PWD"   # expect 16 aligned rows
   npm run verify:checkout                 # expect 38/38
   npm run verify:quote-flow               # expect 22/22
   ```

   If a verifier fails at sign-in with `Unregistered API key` or `Legacy API
   keys are disabled`, it is the service key again — §2.

1. **Commit**, when asked — nothing from this session is committed. It spans
   the migration + tests, `stripe-webhook`/`stripe-events`/nine notify
   functions, `_shared/bookingPolicy.ts`, the client wrappers, five new
   components, four screens, two scripts, two Maestro flows and the docs.
2. **On a Mac: the card.** `brew install maestro`, boot a simulator, then
   `quote-flow.yaml` (first half) → `quote-flow-provider.yaml` →
   `quote-flow.yaml` (second half). Watch for: the setup sheet saying "Save
   card"; the provider getting `notify-quote-requested`; approval opening **no**
   sheet and the booking going from "Deposit processing" to Confirmed when
   `stripe-events` hears the charge. Then repeat with the 3-D Secure card to see
   the fallback alert and PaymentSheet.
3. **Rewrite the stale Maestro steps** (`booking-flow.yaml`, the reschedule
   step in `bookings-management.yaml`) against the quote-first screens.
4. **Phase 4** (spec §8): live ETC, overrun cascade, early-finish, calibration.

---

## 6. Phase 3 — what was built

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

**A schema change can take the REST API down on a starved instance.**
On 2026-09-28 the project was already I/O-starved (`pg_cron` had logged "job
startup timeout" every few minutes since ~13:40 UTC; counting `pg_class` took
~4s). Applying the migration made PostgREST reload its schema cache, the reload
query hit the `authenticator` role's 8s `statement_timeout`, and every REST call
returned `503 PGRST002` until the user restarted the project. After the restart
the same catalog query took 26ms. Before DDL, time a trivial catalog query; if
it is slow, restart first. Diagnose with `mcp__supabase__query_logs` on
`postgrest_logs` / `postgres_logs`.

**`pg_timezone_names` is extremely slow on the hosted project** — anything
from ~17s to over 100s per lookup on the starved instance.
`trg_validate_provider_schedule` scans it on every `provider_profiles` insert
and on timezone / working-hours updates, so a SQL suite that inserts two
provider profiles blew past the management API's 100s gateway limit (`HTTP
524`, output lost, the transaction still running server-side holding its locks).
`quote_flow_completion.test.sql` therefore borrows existing providers. The same
trigger fires when a provider saves working hours in the app — worth replacing
the view scan with a cheap check (e.g. `now() AT TIME ZONE NEW.timezone` in an
exception block) before real providers hit it.

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
which card is charged, or a proposal.** Outside both grant lists:
`buffer_before_mins`, `buffer_after_mins`, `occupied_range`,
`estimated_duration_mins`, `suggested_duration_mins`, every money column,
`quote_line_items`, `quoted_total_amount`, `stripe_setup_intent_id`,
`info_request_note`, `proposed_scheduled_at`, `reschedule_proposed_by` and the
four `adjustment_*` columns. `quote_flow_completion.test.sql` asserts none of the
new ones is ever granted.

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
