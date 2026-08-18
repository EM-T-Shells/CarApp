# CarApp — Claude System Prompt

## Project Overview

CarApp is a React Native (Expo) mobile app — a two-sided marketplace connecting vehicle owners with vetted, independent mobile car detailers and mechanics in the Northern Virginia / DC Metro area. Customers book services, track providers live, and pay via Stripe. Providers manage schedules, earnings, and reputation. Payments use Stripe Connect with a deposit model (15% at booking, remainder on completion).

---

## Tech Stack

**Active:**
- **Framework**: Expo / React Native
- **Routing**: Expo Router (file-based)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
- **Language**: TypeScript (strict mode)
- **Payments**: Stripe Connect (`@stripe/stripe-react-native`)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Auth Storage**: Expo Secure Store
- **SMS**: Twilio (Supabase project level — not in app code)
- **Styling**: React Native `StyleSheet` + design tokens in `src/design/tokens.ts`
- **Maps**: `react-native-maps` + OpenStreetMap `<UrlTile>` — no Google Maps key. Live tracking in `LiveMap.tsx`; distance/ETA math in `src/lib/location/index.ts` (Haversine).

**Not yet wired — do not import:**
- **Redis** (`src/lib/redis/index.ts` is an empty stub) — needed for provider-side GPS write path only
- **Mixpanel** — not installed; skip all analytics events
- **Sentry** — not installed; do not call Sentry APIs

---

## Repository Layout

Full folder tree → `ARCHITECTURE.md §Folder Structure`. Only `src/lib/supabase/` and `src/lib/stripe/` have implementation — do not import from any other `src/lib/*` stubs.

---

## Environment Variables

Never hardcode secrets. `EXPO_PUBLIC_*` vars are bundled into the client — only public keys. Read them via `Constants.expoConfig?.extra?.<KEY> ?? process.env.<KEY>` (required for EAS builds).

- **App** (`/.env.local`): `EXPO_PUBLIC_SUPABASE_URL/KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, Firebase vars — see `.env.example`
- **Edge Functions** (`supabase secrets set`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHECKR_API_KEY/SECRET`, `PERSONA_API_KEY/SECRET`, `ANTHROPIC_API_KEY`, `REDIS_URL`
- **Stripe secret keys must never carry `EXPO_PUBLIC_`** — reference via `Deno.env.get('STRIPE_SECRET_KEY')` in Edge Functions only.
- **Stripe is on TEST keys** (`pk_test_…` / `sk_test_…`). The publishable key in `.env.local` and the `STRIPE_SECRET_KEY` in Supabase secrets **must belong to the same Stripe account and mode**, or the client secret is rejected with *"does not match any associated PaymentIntent on this account."* Env vars are inlined at bundle time — restart with `npx expo start -c` after changing `.env.local`.
- **Rotating Stripe keys orphans `users.stripe_customer_id`.** Those `cus_…` values only exist in the account that created them; after a key/account change, `paymentIntents.create({ customer })` throws `resource_missing` and the deposit call 500s. Fix by nulling the stale column — the Edge Function recreates the customer on next use:
  ```sql
  update users set stripe_customer_id = null where stripe_customer_id is not null;
  ```
- `.mcp.json` is gitignored and configures the **hosted Supabase MCP** (`type: http`, `url: https://mcp.supabase.com/mcp?project_ref=…`). It holds **no token** — auth is OAuth via `/mcp` (interactive Claude Code), cached per machine. Nothing secret lives in this file; never commit it regardless.

---

## Conventions

### Database & Types
- ALL reads → `src/lib/supabase/queries.ts`. ALL writes → `mutations.ts`. Never call `supabase.from(...)` in a component.
- Return types: `QueryResult<T>`, `MutationResult<T>`, `StripeResult<T>` — never re-declare `{ data, error }` inline.
- TypeScript strict mode — never use `any`.
- Never edit `src/types/supabase.ts` manually — auto-generated.
- Never use `service_role` key in client code.
- **Schema changes via Supabase MCP in order:**
  1. `mcp__supabase__list_tables`
  2. `mcp__supabase__apply_migration` (idempotent SQL, `snake_case` name)
  3. `mcp__supabase__generate_typescript_types` → overwrite `src/types/supabase.ts`
  4. Update `schema.sql` + clean up mutations
- Fallback (no MCP): `supabase gen types typescript --project-id <id>` + SQL via dashboard.

### Architecture
- Screens → `app/`. Reusable UI → `src/components/`. Domain folders for single-feature components; `src/components/ui/` for cross-domain primitives. Never duplicate across domain folders.
- Never install a package without checking `Blueprint/dependencies_list`.

### State Management
- Global state: **Zustand** — one slice per domain in `src/state/`. Never extend `auth.ts` for unrelated state.
- Localized state (single screen/flow): **React Context**.
- Never use Redux. Never use React Context for app-wide state.

### Data Formatting
- Money: integers (cents) in DB — display via `src/utils/money.ts`.
- Dates: ISO strings in DB — parse/format via `src/utils/date.ts`.

### Design
- All tokens in `src/design/tokens.ts` — never hardcode hex, font sizes, or spacing.
- Fonts: Inter (body), Space Grotesk (brand/display), JetBrains Mono (prices/IDs). No others.
- Accessibility: 44×44pt touch targets, 4.5:1 contrast, `accessibilityLabel` on every `Pressable`, `accessibilityRole` on icon-only buttons. Respect `useReducedMotion()`.
- All components must support dark mode via dynamic color tokens.

### Security
- Never store secrets in code.
- Never write directly to `provider_location_cache` from the app — GPS goes to Redis; Postgres persistence is server-side.

---

## Error Handling
- All async data calls wrapped in try/catch — return typed `{ data, error }` tuples, never throw raw.
- Transient errors → toast. Form errors → inline. Critical errors → full-screen with recovery action.
- Every list screen handles: loading, empty, error.
- No `console.log` in production. Use React Error Boundaries at the tab level.

---

## Supabase Edge Functions

Deno runtime — use Deno import syntax, never `require()`. Secrets via `Deno.env.get()`.

| Function | Trigger | Purpose |
|---|---|---|
| `stripe-webhook` | App invocation only (`verify_jwt: true`) | All payment actions: deposit intent, balance capture, refunds, accept/decline, cancel (customer/provider), no-show, expire-pending, Connect onboarding/status, payout transfers. **Handles no Stripe webhooks** — see `stripe-events`. |
| `stripe-events` | Stripe webhook delivery (`verify_jwt: false`) | Receives `payment_intent.succeeded` / `payment_intent.payment_failed`. Authenticated by verifying `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`; unsigned requests are refused. Marks payments succeeded/failed and opens the provider-approval window. |
| `admin-review-provider` | Admin panel invocation | Service-role approve/reject of a provider (re-verifies admin, sets `verification_status`, emails via Resend) |
| `update-provider-location` | Provider GPS post | Verifies ownership, upserts `provider_location_cache` (Flow 5.4) |
| `checkr-webhook` | Checkr event | Background check status update (stub — awaits `CHECKR_API_KEY`) |
| `persona-webhook` | Persona event | Identity verification update (stub — awaits `PERSONA_API_KEY`) |
| `notify-booking-requested` | Deposit → pending_provider_approval | Push provider the 2h-window request + customer "request sent" |
| `notify-booking-confirmed` | Booking → confirmed | Push to customer + provider |
| `notify-booking-declined` | Booking declined / expired | Push customer the refund notice |
| `notify-booking-cancelled` | Booking cancelled / no-show | Push the affected party for each cancel path |
| `notify-provider-enroute` | Booking → en_route | Push to customer |
| `notify-job-complete` | Booking → completed | Push to customer |
| `notify-payout-processed` | Payout → paid | Push to provider |
| `notify-kudos-received` | Kudos insert | Push to provider |
| `lug-ai` | App request | Anthropic Claude API proxy (returns 503 until `ANTHROPIC_API_KEY` set) |

---

## Realtime Subscriptions
- Use Realtime for: `messages` (active thread), `bookings` (active booking status).
- Do NOT use Realtime for GPS — poll `provider_location_cache` every 5s.
- Always subscribe on mount, unsubscribe on unmount. Channel names: `booking:{bookingId}`, `thread:{threadId}`.

---

## Navigation & Deep Linking
- All route params typed in `src/types/navigation.ts`.
- Deep link targets: booking confirmed → `/(tabs)/bookings/[id]`, en route → `/(tabs)/bookings/tracking/[bookingId]`, rate now → `/(tabs)/bookings/[id]`, kudos → `/(tabs)/more/provider`, message → `/(tabs)/inbox/[threadId]`.
- Multi-step flows use stack navigation, not modals. Modals for confirmations/sheets/alerts only.

---

## Image & File Upload
All file ops via `src/lib/supabase/storage.ts` — never call Storage directly from a component. Compress before upload: max 1920px, 80% quality, 10MB limit, jpeg/png/webp only. Use `getPublicUrl()` — never hardcode storage URLs.

Buckets: `avatars` (public), `booking-photos` (participants only), `vetting-documents` (service role only).

---

## Offline & Network Resilience
Deferred to post-MVP. On failure: show error state + retry action. No offline queuing or optimistic UI.

---

## Key Business Logic
- **Auth gate**: `_layout.tsx` routes based on session + `users` row. Only `_layout.tsx` calls `getSession()` directly.
- **Onboarding**: Customer → `profile→role→vehicle→review`. Provider → `profile→role→review` (no vehicle). Insert `users` row only on `review` submit. State in `signUpDraft` (shared) and `providerDraft` (provider vetting).
- **Tabs / dashboards**: Two separate tab groups. Customers use `(tabs)` (Search, Services, Bookings, Inbox, More — all customer-oriented). Approved providers use `(provider-tabs)` (Jobs, Inbox, Earnings, More). The root gate mounts one group per the user's role + `activeMode` (see Roles). Screens within a group are single-persona — never blend customer and provider actions in one screen.
- **OAuth**: Google → `expo-auth-session` (PKCE). Apple → native on iOS, `expo-auth-session` on Android. OAuth handling in `auth.ts` — screens never call `signInWithOAuth` directly.
- **OTP**: Email + phone via `signInWithOtp`. Phone requires Twilio in Supabase dashboard.
- **Roles & active mode**: All users default to Customer (`users.role`: `customer` | `provider` | `both`). Provider mode is opt-in, requires full vetting before first booking. `activeMode` (persisted client-side in `src/state/mode.ts`, `customer` | `provider`) decides which dashboard a **dual-role (`both`)** user sees; it is only consulted for `both` accounts — pure `customer` → `(tabs)`, pure approved `provider` → `(provider-tabs)`. Only `both` users see the "Switch to Provider/Customer Dashboard" control (customer More hub ⇄ provider More hub), which flips `activeMode` and `router.replace`s into the other group.
- **Service snapshots**: Services snapshotted as JSONB at booking — provider edits don't affect existing bookings.
- **Content moderation**: All outbound messages run through `containsFlaggedContent()` in `validators.ts` before insert. Flagged content **blocks the send** — `insertMessage()` throws `FlaggedContentError` and never inserts; the thread screen shows an inline warning and preserves the draft to edit. (Legacy `is_flagged` bubble styling only renders pre-existing flagged rows.)
- **Deposit**: 15% at booking, remainder captured on completion. The card is collected in Stripe's **PaymentSheet** via `presentDepositPaymentSheet()` — the app renders **no card inputs of its own**; never add a `CardField`/`CardForm`. The deposit PaymentIntent sets `customer` + `setup_future_usage: 'off_session'` so `capture_balance` can charge the saved card later with nobody present.
- **Booking-before-payment**: `create_deposit_intent` needs a `booking_id`, so the booking row is inserted *before* the deposit is collected. The booking screen must cancel that row when the intent fails, the card declines, or the sheet is dismissed — otherwise unpaid bookings show as scheduled. Only `stripe-events` moves a booking `pending → pending_provider_approval`; **the client never asserts paid state**.
- **Stripe webhook auth**: Stripe deliveries go to `stripe-events` (`verify_jwt: false`, signature-authenticated), never to `stripe-webhook`. Stripe cannot attach a Supabase JWT, so a JWT-verified endpoint 401s every delivery before the handler runs. Do **not** flip `verify_jwt` off on `stripe-webhook` to "fix" this: it does service-role writes with no in-code caller authentication, so that would make `cancel_booking`, `mark_no_show` and `refund_deposit` anonymously callable.
- **Cancellation policy** (server-enforced in `stripe-webhook`; the client never decides the refund amount): customer cancels ≤24h → $15 flat late-cancel fee retained, remainder of deposit refunded (>24h → full refund); provider cancels ≤24h → full customer refund + $25 penalty recorded on the booking; customer no-show → provider marks No Show, customer forfeits the full amount.
- **Fees**: Provider standard platform fee is **3%** (`0.030`). Founding Providers (first 100 approved) pay **0% for 90 days**, then auto-convert to 3% via a daily sweep. Customer 2% at checkout.
- **Vetting**: 6 steps required before `verification_status = approved`.
- **Live GPS**: Updates every 5s → Redis → `provider_location_cache` in Postgres.
- **Kudos**: Separate from gear ratings. Badges: Meticulous, Reliable, Magic Hands, Great Value, Fast Worker, Communicator.
- **Gear ratings**: 4 dimensions (Quality, Timeliness, Communication, Value). Weighted composite score.
- **Dispute window**: 48h post-service.
- **RLS**: Enabled on every table — always verify under correct auth role.
- **Lug AI**: Via `lug-ai` Edge Function. Every surface must show persistent "Talk to a person" CTA visible without scrolling. After 2 consecutive help requests, CTA becomes primary action.
- **In-app comms only**: Auto-flag phone numbers, emails, Venmo handles in messages.

---

## Testing Conventions
Write tests before marking any task complete.

| What changed | Type | Tool | Location |
|---|---|---|---|
| Utils, state stores | Unit | Jest | `__tests__/` adjacent to file |
| Supabase queries/mutations | Integration | Jest + mock client | `__tests__/` adjacent to file |
| Full user flows | E2E | Maestro | `e2e/` |

Run `npm test` after every source change and confirm it passes. All tests must be saved to `__tests__/` — never excluded from the default run.

---

## Git Conventions

**Session start:** `git checkout dev && git pull origin dev`, then create feature branch.

**Branching:** `main` (prod, never commit directly), `dev` (integration), `feature/<name>`, `fix/<name>`. Never merge branches — merges are manual in GitHub.

**After each task, in order:**
1. `git add <files>`
2. `git commit -m "<type>(<scope>): <description>"` — no AI/Claude references
3. `git push origin <branch>`
4. `git checkout dev && git merge <branch>`
5. `git push origin dev`
6. Delete branch locally + remotely
7. Append one-line note to `Blueprint/reference.md`: `[path/to/file.ts] — <what it does and why>`

**Commit format:** `feat|fix|chore|refactor|test|docs(<scope>): <description>`

---

## Workflow Rules
- State approach before writing code — confirm it aligns with `ARCHITECTURE.md`.
- Only touch what's necessary — no opportunistic refactoring.
- Ask when domain logic is unclear.
- Update `ARCHITECTURE.md` after introducing new files, models, or patterns.
- Checklist tracker: `Blueprint/build_checklist.md`.

---

## Reference Documents

| File | Purpose | When to read |
|---|---|---|
| `ARCHITECTURE.md` | ERD, tables, patterns | Before any new file |
| `carApp/supabase/schema.sql` | Schema + RLS + seeds | Before any DB work |
| `Blueprint/dependencies_list` | Approved packages | Before `npm install` |
| `Blueprint/build_checklist.md` | Build order tracker | Mark complete as you go |
| `Blueprint/reference.md` | Per-file notes | Append after each task |