# E2E Suite — Maestro

Automated end-to-end coverage of **`Blueprint/User_Stories`**. Maestro is
the E2E framework mandated by `CLAUDE.md` (Testing Conventions). Flows are
plain YAML and live in this directory.

## Running

```bash
# Full suite (all flows)
./e2e/run-e2e.sh

# One workflow by tag
./e2e/run-e2e.sh bookings
./e2e/run-e2e.sh provider

# A single flow file
./e2e/run-e2e.sh --flow e2e/auth-flow.yaml
```

> **iOS device note:** Maestro drives iOS via the **Simulator only**. A
> physical iPad/iPhone is *not* supported by the Maestro iOS driver, so the
> suite runs against a booted Simulator (`npx expo run:ios`). Your iPad +
> `npx` dev client is still the right tool for manual exploratory testing —
> the same `appId` and the same flows apply, only the runner target differs.

## Preconditions (test data)

The flows assume seeded, deterministic state. Wire your Supabase seed into
the `TODO` block in `run-e2e.sh`:

- `test@carapp.dev` — customer with ≥1 upcoming **and** ≥1 past booking, and
  ≥1 message thread.
- `provider@carapp.dev` — provider, `verification_status = 'approved'`, with a
  seeded job (`confirmed`, scheduled today) and at least one published service.
- Stripe in **test mode** (card `4242 4242 4242 4242`).
- OTP: seed the user and inject the code (e.g. `123456`) via the Supabase
  test hook so flows don't depend on a real email/SMS send.

## Flow files

| Flow | Tags | User_Stories workflow |
|---|---|---|
| `auth-flow.yaml` | — | Account Creation (email/phone OTP) |
| `oauth-flow.yaml` | — | Account Creation (Google/Apple SSO) |
| `provider-onboarding.yaml` | — | Account Creation (provider vetting / pending) |
| `booking-flow.yaml` | — | Workflow A (Search) + booking + deposit |
| `bookings-management.yaml` | `bookings` | Workflow B + cancel/reschedule (G) |
| `inbox-messaging.yaml` | `inbox` | Workflow C |
| `more-settings.yaml` | `more` | Workflow E |
| `provider-dashboard.yaml` | `provider` | Workflow D + payout surface (M) |
| `provider-job-flow.yaml` | `provider` `jobs` | Workflow H (provider side) |

## Story → coverage trace

`✅` automated · `🟡` partial (asserts surface, not destructive/backend path)
· `🔬` covered by unit/integration tests instead · `🚧` screen/feature not
built yet · `🖥️` desktop-web (out of Maestro's mobile scope).

| Workflow | Status | Where |
|---|---|---|
| Account Creation & Onboarding | ✅ | `auth-flow`, `oauth-flow`, `provider-onboarding` |
| A — Search & Discovery | ✅ | `booking-flow` |
| B — Bookings Management | ✅ | `bookings-management` |
| C — Inbox & Messaging | 🟡 send/open ✅; contact-block 🔬 `validators` unit; push-2s manual | `inbox-messaging` |
| D — Provider Dashboard | 🟡 hub/earnings ✅; recurring unavailability 🚧 | `provider-dashboard` |
| E — More & Settings | 🟡 profile/notifs ✅; payment-methods 🚧; account-deletion 🚧 | `more-settings` |
| F — Notifications Center | 🚧 | no screen built |
| G — Booking Mgmt Actions | 🟡 cancel/reschedule ✅; **Add Service** 🚧 | `bookings-management` |
| H — Provider Job Flow | 🟡 status-advance + payout + photo-gate ✅; Complete (destructive) + live-GPS not driven | `provider-job-flow` |
| I — Gift Cards & Promo | 🚧 | no screen built |
| J — Referral Program | 🚧 | no screen built |
| K — Recurring Subscriptions | 🚧 deferred (Phase 2) | — |
| L — Admin Panel | 🖥️ | desktop web portal — use a web E2E tool (Playwright), not Maestro |
| M — Provider Payout & Tax | 🟡 earnings/payout view ✅; 1099-K download 🚧 | `provider-dashboard` |
| N — Provider Service Setup | 🟡 catalog/manage reachable; add/publish/toggle 🚧 | `provider-dashboard` |

## Adding a flow

1. Copy the header style from an existing file (`appId`, `tags`, preconditions).
2. Prefer `accessibilityLabel`/exact visible text as selectors — every
   `Pressable` in this app carries an `accessibilityLabel` (CLAUDE.md a11y
   rule), which makes flows resilient to copy changes.
3. End sub-flows in a non-destructive state (back out of confirmations).
4. Add the flow + its stories to the trace table above.
