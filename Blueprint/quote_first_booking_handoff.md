# Quote-First Booking — Session Handoff

**Written:** 2026-08-17
**Branch:** `feature/quote-first-booking`
**Head:** `2cf778b` — **pushed, remote confirmed via `git ls-remote`**
**Design spec:** [`quote_first_booking.md`](quote_first_booking.md) — §4 (security),
§8 (phase plan), §9 (current state)

This file is the *operational* handoff: how to pick the work back up on another
machine, what is verified versus merely written, and what to do first. The
design and the per-phase state live in the spec — this does not duplicate them.

---

## 1. Pick up where it left off

```bash
git clone git@github.com:EM-T-Shells/CarApp.git   # or: git fetch && git checkout
git checkout feature/quote-first-booking          # should land on 2cf778b
cd CarApp/carApp && npm ci
```

Verify you have everything:

```bash
git log --oneline -4
# 2cf778b fix(security): derive booking prices server-side
# 48b8af3 fix(security): close the booking UPDATE hole
# 3efc6aa feat(booking): Phase 0 — durations and ready-by time
# 509cb39 chore(db): reconcile migration history; add Phase 0 booking duration
```

> **Note:** commits appeared on `origin` in this environment without an
> explicit `git push` — most likely a VSCode `git.postCommitCommand` user
> setting. Don't rely on it. Run `git ls-remote origin <branch>` before you
> trust that work has left a machine.

### Environment

| Thing | Value |
|---|---|
| Node | v20.20.0 |
| Supabase CLI | 2.90.0 (2.114.0 available; not required) |
| Supabase project ref | `apbubklogxgqkokbctwz` |

**Shell exports — required before launching Claude Code, not after:**

```bash
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_DB_PASSWORD=...
```

Appending these to `~/.bashrc` is **not enough** — Ubuntu's `.bashrc` returns
early for non-interactive shells, so tool invocations won't see them unless the
parent process already has them. (Same note as spec §9.)

`carApp/.env.local` is gitignored and must be recreated. See `.env.example`;
the app reads `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_SUPABASE_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. For cloud
builds these must also be set on EAS, not just locally, or the app crashes on
launch.

The Supabase MCP server runs `--read-only` (see `.mcp.json`), so it can read the
DB but **cannot apply migrations**. Use the CLI for all DDL.

---

## 2. State of the database

All migrations are **applied** to the remote; `supabase migration list` aligns
on every row. Nothing is pending.

| Migration | What it does |
|---|---|
| `20260817000000_booking_duration` | Phase 0 duration columns, generated `estimated_completion_at`, backfill, `stamp_actual_duration` |
| `20260817120000_bookings_update_column_guard` | Column allowlist + status-transition trigger on UPDATE |
| `20260817140000_bookings_server_derived_pricing` | Server-side pricing on INSERT + column allowlist |

`stripe-webhook` was **redeployed** for the deposit-derivation change. If you
roll the DB back you must also redeploy the previous function, or
`create_deposit_intent` will read a `deposit_amount` that isn't being set.

---

## 3. What is verified, and what is not

Be precise about this — it decides what to do first.

### Verified

- **Jest: 72 suites / 879 tests** green (baseline was 71 / 843). `npx tsc --noEmit` clean.
- **`bookings_update_column_guard.test.sql` — 12/12.**
- **`bookings_server_derived_pricing.test.sql` — 15/15.**

Run the SQL tests any time (they wrap in a transaction and `ROLLBACK`, so they
never touch real data):

```bash
cd carApp
supabase db query --linked -f supabase/migrations/__tests__/bookings_update_column_guard.test.sql
supabase db query --linked -f supabase/migrations/__tests__/bookings_server_derived_pricing.test.sql
# expect every row's pass = t
```

### ⚠️ NOT verified — the checkout path end to end

**This is the open risk and the reason for the recommendation below.**

The payment entry path was rewritten in `2cf778b`: the client stopped sending
prices, inserts now pass through `trg_derive_booking_amounts`, and the deposit
amount changed source. Nothing has exercised that end to end.

- Every Jest test **mocks Supabase**. `insertBooking` is only asserted as a
  passthrough in `src/lib/supabase/__tests__/mutations.test.ts`.
- There is **no test at all** for `app/(tabs)/search/book/[providerId].tsx`.
- The SQL tests prove the *database* prices correctly. They do **not** prove the
  *client* sends a payload the database accepts. Different claims; the seam
  between them is exactly what changed.

E2E (`e2e/run-e2e.sh`, `booking-flow.yaml`) needs **macOS + a booted iOS
Simulator + Maestro** — it cannot run on the WSL2 box this was written on.

---

## 4. Do this first

**Verify checkout before building anything on top of it.** Two ways, pick one:

1. **On a Mac (better):** install Maestro, boot a simulator, then
   `./e2e/run-e2e.sh --flow e2e/booking-flow.yaml`. This covers Stripe's
   PaymentSheet too. `booking-flow.yaml` now also asserts the Phase 0 ready-by
   line on the detail screen.
2. **Anywhere (cheaper):** a Node script that signs in as a seeded customer with
   the anon key and performs the exact insert the client now performs, asserting
   the row comes back correctly priced. Covers client payload → column
   privileges → trigger → row; does not cover Stripe. *Not yet written* — this
   was the offered next step when the session ended.

New failure mode to expect: `booking-flow.yaml` now performs a real
server-priced insert, so a seeded package that is `is_active = false` or
`is_approved = false` will make the booking **fail at insert** rather than
silently price to zero. That is intended, but it is a new way for the seed to
break loudly.

**Then: Phase 1, starting with the `EXCLUDE` constraint.** Not for Phase 3's
sake — for a live bug. Per spec §1 there is no conflict check anywhere today, so
two customers can book the same provider for the same instant right now. The
`btree_gist` + `EXCLUDE` pair makes that structurally impossible regardless of
client behaviour. It needs `occupied_range`, which needs the buffer columns.
Give it a `__tests__/*.test.sql` as §8 calls for.

The rest of Phase 1 (working hours, timezone, time-off, DayTimeline) is real
work but none of it is load-bearing the way the constraint is.

---

## 5. Traps already paid for — don't rediscover these

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

**It cannot state a price at any point.** Anything Phase 3 adds — quote
submission, price approval, duration adjustment — must go through an Edge
Function or be added deliberately to both layers. That friction is the point,
and it is the shape spec §5 already assumes.

Edge Functions are unaffected throughout: they connect with
`SUPABASE_SERVICE_ROLE_KEY`. So does `scripts/seed-e2e.mjs`.
