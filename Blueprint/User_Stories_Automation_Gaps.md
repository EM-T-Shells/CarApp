# User Stories — Automation Gaps

Companion to [User_Stories](User_Stories). Tracks which checklist items
**cannot be E2E-automated yet** because the underlying UI/feature is not
built. Automation taps real screens — a flow can't exercise a control that
doesn't exist. The admin panel (Workflow L) is intentionally out of scope
for mobile automation (desktop web).

E2E suite + per-flow story trace: [../carApp/e2e/README.md](../carApp/e2e/README.md).

_Last verified against the codebase: 2026-06-23._

Legend: 🚧 not built · 🟡 partially built · 🚫 out of automation scope.

---

## Whole workflows with no screen (🚧)

| Workflow | Evidence | Stories blocked |
|---|---|---|
| **F — Notifications Center** | No notifications-center screen, bell icon, "Mark All Read", or swipe-to-dismiss in `app/`. | All 7 (§🔔) |
| **I — Gift Cards & Promo Codes** | No gift-card screen and no checkout promo UI. Only an `isValidPromoCode()` validator exists in `src/utils/validators.ts` — no purchase/redeem/apply flow. | All 9 (§🎁) |
| **J — Referral Program** | No referral-code, share, or credits UI anywhere. | All 8 (§👥) |
| **K — Recurring Subscriptions** | Marked *Phase 2 — Deferred* in User_Stories itself. | All 3 (§🔁) |

---

## Partially built workflows — specific stories blocked

### A — Search & Discovery (🟡)
- 🚧 **Heart/save a provider** as a favorite — no favorite/save feature.
- 🚧 **Favorites accessible from the More tab** — depends on the above.

### B — Bookings Management (🟡)
- ⚠️ "Toggle **Upcoming / Past** tabs" — the real UI is a *My Bookings / My
  Jobs* toggle plus a separate **Past** button, not Upcoming/Past tabs. The
  flow asserts the built UI; the story wording is stale, not a gap.

### E — More & Settings (🟡)
- 🚧 **Add / remove a payment method** — no payment-methods screen
  (`src/lib/stripe/index.ts` exists, but no UI mounts it for card management).
- 🚧 **Request account deletion** / 30-day grace — no delete-account control
  in `app/(tabs)/more/settings.tsx`.

### D — Provider Dashboard (🟡)
- 🚧 Set **recurring unavailability** (e.g. every Sunday) — single-date
  blocking exists in `provider-manage.tsx`; recurring does not.
- ⚠️ "Land on **Dashboard tab** by default on launch" — provider tooling
  lives under **More → Provider Dashboard**, not a dedicated bottom tab. The
  hub is automated; the "default tab on launch" wording does not match the
  build.

### G — Booking Management Actions (🟡)
- 🚧 **Add Service** to an upcoming booking — no Add Service control in
  `app/(tabs)/bookings/[id].tsx`. Blocks all 4 Add Service stories: browse
  catalog, incremental Stripe charge, email confirmation, confirmed-only
  gating.
- ✅ Cancel / reschedule + policy sheet are built and automated.

### H — Provider Job Flow (🟡 — built, partially driven)
- The flow exists and is automated up to the completion gate. Not *driven* by
  automation (not a build gap):
  - **Complete Job** capture-on-completion is destructive to seeded state —
    asserted, not tapped.
  - The **4-photo before/after gate** needs live camera capture, which
    Maestro can't reliably drive — gate presence is asserted instead.
  - Backend-only effects (Stripe transfer to Connect, push within 30s) are
    not UI-observable; covered by mutations/Edge Function tests.

### M — Provider Payout & Tax (🟡)
- 🚧 **Download 1099-K** — `EarningsDashboard` shows summary cards + payout
  list only; no tax-document generation.
- 🚧 **Annual earnings summary** (below-threshold providers) — same gap.

### N — Provider Service Setup (🟡)
- ✅ Built: add custom service + save (`ServiceMenuEditor`), availability
  editing (`provider-manage.tsx`).
- 🚧 **Preview** the customer-facing listing.
- 🚧 **Publish** action to push the menu live.
- 🚧 **Toggle services on/off** without deleting.
- 🚧 Custom-service **moderation** before approval.

---

## Out of automation scope

### L — Admin Panel (🚫)
Desktop web portal (1280px min width). Out of scope for Maestro mobile
automation — use a web E2E tool (e.g. Playwright) if/when prioritized. All
10 stories (§🛠️).

---

## Summary

- **Fully blocked (no UI):** Workflows **F, I, J, K** + favorites (A),
  payment-methods & account-deletion (E), Add Service (G), recurring
  unavailability (D), 1099-K & annual summary (M), preview/publish/toggle/
  moderation (N).
- **Out of scope:** Workflow **L** (web admin).
- **Everything else** in User_Stories is covered by the Maestro suite in
  `carApp/e2e/` (see that directory's README for the per-flow trace).

Update this file as features land — when a 🚧 row ships, add its flow to the
suite and move the row to the e2e/README trace table.
