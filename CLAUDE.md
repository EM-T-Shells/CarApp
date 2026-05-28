# CarApp — Claude System Prompt

## Project Overview

CarApp is a React Native (Expo) mobile app — a two-sided marketplace connecting vehicle owners with vetted, independent mobile car detailers and mechanics in the Northern Virginia / DC Metro area. Customers book services, track providers live, and pay via Stripe. Providers manage schedules, earnings, and reputation. Payments use Stripe Connect with a deposit model (15% at booking, remainder on completion).

---

## Tech Stack

**Installed and in use today:**

- **Framework**: Expo / React Native
- **Routing**: Expo Router (file-based, like Next.js)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
- **Language**: TypeScript (strict mode)
- **Payments**: Stripe Connect (via `@stripe/stripe-react-native`)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Auth Storage**: Expo Secure Store
- **SMS Provider**: Twilio (configured at Supabase project level for phone OTP — not in app code)
- **Styling**: React Native `StyleSheet` + design tokens in [carApp/src/design/tokens.ts](carApp/src/design/tokens.ts)

**Planned but not yet wired up — do not import these in current code:**

- **Caching / Ephemeral Data**: Redis (live GPS, rate limiting, short-lived tokens) — `ioredis` approved in [Blueprint/dependencies_list](Blueprint/dependencies_list) but not yet implemented; [src/lib/redis/index.ts](carApp/src/lib/redis/index.ts) is an empty stub
- **Maps**: No map SDK for MVP — use address text only. Google Maps is explicitly out for MVP due to billing
- **Analytics**: Mixpanel — not installed; skip the "Logging & Observability" Mixpanel events below until then
- **Error Monitoring**: Sentry — not installed; do not call Sentry APIs in current code

---

## Repository Layout

Only [src/lib/supabase/](carApp/src/lib/supabase/) and [src/lib/stripe/](carApp/src/lib/stripe/) have implementation. The other `src/lib/*` directories exist with empty placeholder files — do not import from them.

The full folder tree lives in [ARCHITECTURE.md §Folder Structure](ARCHITECTURE.md) — refer to it for the complete file inventory. Top-level orientation, with `src/lib/` kept expanded since the stub markers are load-bearing for code generation:

```
CarApp/                             # Git repo root
├── Blueprint/                      # Build plan and product docs
├── ARCHITECTURE.md
├── CLAUDE.md
├── .claudeignore
└── carApp/                         # Expo app root
    ├── app/                        # Expo Router screens — see ARCHITECTURE.md §Folder Structure
    ├── src/
    │   ├── lib/
    │   │   ├── supabase/           # client.ts, auth.ts, queries.ts, mutations.ts, storage.ts
    │   │   ├── redis/              # (stub — empty index.ts) GPS caching, rate limiting, short-lived tokens
    │   │   ├── stripe/             # Stripe Connect integration
    │   │   ├── checkr/             # (stub — empty index.ts) Background check webhook handling
    │   │   ├── persona/            # (stub — empty index.ts) Identity verification flow
    │   │   ├── notifications/      # (stub — empty push.ts) Firebase Cloud Messaging
    │   │   └── location/           # (stub — empty index.ts) GPS utilities
    │   └── state/, types/, utils/, components/, design/   # see ARCHITECTURE.md
    ├── supabase/                   # schema.sql, seeds/, functions/ (9 Edge Functions — see §Supabase Edge Functions below)
    ├── e2e/                        # Maestro E2E flows
    └── assets/                     # Fonts, images, icons
```

---

## Environment Variables

All secrets are stored in environment variables. Never hardcode any of these values in code. **Anything prefixed `EXPO_PUBLIC_` is bundled into the client JS and ships to every device — only public keys belong here.**

**Mobile app** — stored in `.env.local`, prefixed with `EXPO_PUBLIC_`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_KEY
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_API_KEY_ANDROID
EXPO_PUBLIC_FIREBASE_API_KEY_IOS
EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID
EXPO_PUBLIC_FIREBASE_APP_ID_IOS
```

> **Known issue**: [carApp/.env.example](carApp/.env.example) and `.env.local` currently include `EXPO_PUBLIC_STRIPE_SECRET_KEY`. This is unsafe — Stripe secret keys must never carry the `EXPO_PUBLIC_` prefix. Move to Supabase Edge Function secrets (`supabase secrets set STRIPE_SECRET_KEY=...`) and rotate the existing key, since it has likely been bundled into prior builds.

**Read pattern**: Always read `EXPO_PUBLIC_*` values via `Constants.expoConfig?.extra?.<KEY> ?? process.env.<KEY>` — the `Constants.extra` path is required for EAS builds where `process.env` may not be populated at runtime. See [app/_layout.tsx](carApp/app/_layout.tsx) for an example.

**Supabase Edge Functions** — set via `supabase secrets set`, never in code:
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CHECKR_API_KEY
CHECKR_WEBHOOK_SECRET
PERSONA_API_KEY
PERSONA_WEBHOOK_SECRET
ANTHROPIC_API_KEY
REDIS_URL
```

An [.env.example](carApp/.env.example) file lives at the carApp root with all client keys listed but no values — reference this when setting up a new environment.

---

## Conventions

### Database & Types

- ALL database reads go in [src/lib/supabase/queries.ts](carApp/src/lib/supabase/queries.ts). ALL writes go in [mutations.ts](carApp/src/lib/supabase/mutations.ts). Never call `supabase.from(...)` directly in a component or screen.
- Data-layer return type is the exported `QueryResult<T>` (from `queries.ts`), `MutationResult<T>` (from `mutations.ts`), or `StripeResult<T>` (from `src/lib/stripe/index.ts`) — do not re-declare `{ data, error }` shapes inline.
- All new files use TypeScript with explicit types. Never use `any`.
- Never edit `src/types/supabase.ts` manually — it is auto-generated.
- Never use `service_role` key in client code — it bypasses RLS.
- After any schema change run: `supabase gen types typescript --project-id <id> > src/types/supabase.ts`

### Architecture

- Screen-level components live under `app/`. Reusable UI lives under `src/components/`.
- **Component organization**: Domain folders under `src/components/` (`auth/`, `booking/`, `kudos/`, `lug/`, `provider/`, `search/`, `tracking/`) hold components used by exactly one feature area. `src/components/ui/` holds primitives (`Button`, `Card`, `Input`, etc.) that are domain-agnostic. A component used in 2+ domains either becomes a `ui/` primitive or stays in the first domain that needs it — never duplicated across domain folders.
- Never install a new package without checking `Blueprint/dependencies_list` first.

### State Management

- **Global state** uses **Zustand**. Slices live in `src/state/`, one file per domain. Existing slices: `auth.ts`, `bookingDraft.ts`, `providerDraft.ts`, `signUpDraft.ts`, `search.ts`. New global state goes in a new file named for its domain — do not extend `auth.ts` for unrelated state.
- **Localized state** scoped to a single feature tree (multi-step forms, modals, a single screen) uses **React Context**.
- Never use Redux or any state library other than Zustand and React Context. Never use React Context for app-wide state.

### Data Formatting

- Money stored as integers (cents) in DB. Always format for display using `src/utils/money.ts`.
- Dates stored as ISO strings. Always parse/format using `src/utils/date.ts`.

### Design

- All design values are defined in `src/design/tokens.ts` — never hardcode hex values, font sizes, or spacing in components.
- Use Inter for UI/body text, Space Grotesk for brand/display, JetBrains Mono for prices and booking IDs. No other fonts.
- **Accessibility minimums**: 44×44pt touch targets on all interactive elements, 4.5:1 text contrast against background tokens, `accessibilityLabel` on every `Pressable`, `accessibilityRole` on icon-only buttons. Skip non-essential animations when `useReducedMotion()` (from `react-native-reanimated`) returns true.
- All components must support dark mode via dynamic color tokens.

### Security

- Never store secrets in code — use `EXPO_PUBLIC_` env vars for the app, `supabase secrets set` for Edge Functions.
- Never write directly to `provider_location_cache` from the app — live GPS position goes to Redis; Postgres persistence is handled server-side.

---

## Error Handling

- All async Supabase calls in `queries.ts` and `mutations.ts` must be wrapped in try/catch and return typed `{ data, error }` tuples. Never throw raw errors from the data layer.
- UI error display pattern:
  - **Transient errors** (network blip, retry succeeded): toast notification
  - **Form validation errors**: inline below the relevant field
  - **Critical errors** (auth failure, payment failure): full-screen error state with recovery action
- Every list screen must handle three states explicitly: loading, empty, and error.
- Never use `console.log` in production code — use Sentry breadcrumbs for context at key state transitions.
- Use React Error Boundaries at the tab level to prevent a single screen crash from taking down the whole app.

---

## Supabase Edge Functions

Edge Functions run on **Deno**, not Node.js. This matters for imports, syntax, and available APIs.

- All Edge Functions live in `supabase/functions/<function-name>/index.ts`
- Use Deno import syntax: `import { serve } from 'https://deno.land/std/http/server.ts'`
- Never use `require()` or CommonJS syntax inside Edge Functions
- Secrets are accessed via `Deno.env.get('SECRET_NAME')` — never hardcoded
- Set secrets with: `supabase secrets set SECRET_NAME=value`
- Deploy a function with: `supabase functions deploy <function-name>`
- Test locally with: `supabase functions serve <function-name>`

**Planned Edge Functions:**

| Function | Trigger | Purpose |
|---|---|---|
| `stripe-webhook` | Stripe event **+ app invocation** | Verifies `Stripe-Signature` for webhook events (`payment_intent.succeeded`, `payment_intent.payment_failed`); also handles app-invoked actions called via `supabase.functions.invoke('stripe-webhook', { body: { action: '...' } })` — existing actions include `create_deposit_intent`. See [src/lib/stripe/index.ts](carApp/src/lib/stripe/index.ts) for the client side. |
| `checkr-webhook` | Checkr event | Background check status update |
| `persona-webhook` | Persona event | Identity verification status update |
| `notify-booking-confirmed` | DB insert on bookings | Push to customer + provider |
| `notify-provider-enroute` | Booking status → en_route | Push to customer |
| `notify-job-complete` | Booking status → completed | Push to customer |
| `notify-payout-processed` | Payout status → paid | Push to provider |
| `notify-kudos-received` | Kudos insert | Push to provider |
| `lug-ai` | App request | Anthropic Claude API proxy with system prompt |

---

## Realtime Subscriptions

- Use Supabase Realtime for: `messages` (new message in active thread), `bookings` (status transitions during active booking)
- Do NOT use Supabase Realtime for GPS position updates — live GPS is handled via Redis; read `provider_location_cache` via polling during active bookings
- Always subscribe on component mount and unsubscribe on unmount via the `useEffect` return function
- Channel naming convention: `booking:{bookingId}`, `thread:{threadId}`

```typescript
// Pattern — always clean up
useEffect(() => {
  const channel = supabase
    .channel(`booking:${bookingId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, handler)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [bookingId])
```

---

## Navigation & Deep Linking

- All route params must be typed in `src/types/navigation.ts`
- Push notification deep links must route to the relevant screen:
  - Booking confirmed → `/(tabs)/bookings/[id]`
  - Provider en route → `/(tabs)/bookings/tracking/[bookingId]`
  - Rate now → `/(tabs)/bookings/[id]` (review sheet open)
  - Kudos received → `/(tabs)/more/provider`
  - New message → `/(tabs)/inbox/[threadId]`
- Multi-step flows (onboarding, booking, vetting) use stack navigation within a group — not modals
- Modals are reserved for confirmations, sheets, and alerts only

---

## Image & File Upload

All file operations go through `src/lib/supabase/storage.ts`. Never call Supabase Storage directly from a component.

**Storage buckets:**

| Bucket | Contents | Access |
|---|---|---|
| `avatars` | User and provider profile photos | Public read |
| `booking-photos` | Before/after job photos | Booking participants only |
| `vetting-documents` | Identity docs, insurance, credentials | Private — service role only |

**Rules:**
- Compress images client-side before upload: max 1920px on longest side, 80% quality
- Accepted types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 10MB per file
- Construct public URLs using `supabase.storage.from(bucket).getPublicUrl(path)` — never hardcode storage URLs

---

## Logging & Observability

- Add Sentry breadcrumbs at key state transitions: auth, booking status changes, payment events, GPS start/stop
- Key Mixpanel events to instrument:

| Event | Trigger |
|---|---|
| `search_initiated` | User submits location search |
| `provider_viewed` | User opens provider profile |
| `booking_started` | User enters booking flow |
| `booking_confirmed` | Deposit payment succeeded |
| `booking_completed` | Job status → completed |
| `rating_submitted` | Gear rating + kudos saved |
| `lug_opened` | Lug AI bubble tapped |
| `provider_onboarding_started` | Provider opts into provider mode |
| `provider_approved` | verification_status → approved |

---

## Offline & Network Resilience

Offline resilience is **deferred to post-MVP**. Do not implement offline queuing, optimistic UI, or local caching unless explicitly instructed.

For now, the expected behavior on network failure is:
- Show an appropriate error state (see Error Handling section)
- Provide a retry action where possible

---

## Key Business Logic

- **Auth gate**: [app/_layout.tsx](carApp/app/_layout.tsx) subscribes to `onAuthStateChange` and routes to one of three destinations based on session + `users` row presence: signed-out → `/(auth)/`, signed-in without a `users` row → `/(auth)/onboarding/profile`, signed-in with a `users` row → `/(tabs)/search`. Only `_layout.tsx` should call `supabase.auth.getSession()` directly.
- **Onboarding flow**: New users (signed in but no `users` row) move through `/(auth)/onboarding/` with the step path branching on role:
  - Customer or Both: `profile → role → vehicle → review` → `users` + `vehicles` rows inserted on `review` submit → routes to `/(tabs)/search`.
  - Provider only: `profile → role → review` (vehicle step is **skipped** — see [role.tsx](carApp/app/(auth)/onboarding/role.tsx)) → `users` row inserted (no vehicle) → continues into `providerDraft` → vetting flow → [pending-approval.tsx](carApp/app/(auth)/pending-approval.tsx) until `verification_status = approved`.
  - State for the shared steps lives in the `signUpDraft` Zustand store; provider-specific vetting state lives in `providerDraft`. Do not insert the `users` row before `review` submit. See [ARCHITECTURE.md §Auth Flow](ARCHITECTURE.md) for the full diagram.
- **Tab structure**: All authenticated users see the **same 5 tabs** (Search, Services, Bookings, Inbox, More) — tab visibility is **not** role-gated in [(tabs)/_layout.tsx](carApp/app/(tabs)/_layout.tsx). Role-specific UI is rendered at the **screen level**; Provider-specific views live inside `(tabs)/more/provider.tsx`. Do not add role-based tab filtering to the tabs layout.
- **OAuth**: Google sign-in always uses `expo-auth-session` (PKCE flow). Apple sign-in is platform-split — iOS uses native `expo-apple-authentication` + `signInWithIdToken` (App Store requirement when other third-party logins are offered), Android falls back to `expo-auth-session`. All OAuth result handling lives in [src/lib/supabase/auth.ts](carApp/src/lib/supabase/auth.ts); screens never call `supabase.auth.signInWithOAuth` directly. Successful OAuth navigation is driven by the root layout's `onAuthStateChange` listener, not by the sign-in screen.
- **OTP auth**: Email and phone OTP are supported via Supabase Auth's built-in OTP API (`signInWithOtp`). No custom token table. Phone OTP requires Twilio configured in Supabase dashboard.
- **Role model**: All users default to Customer. Provider mode is opt-in post-signup and requires full vetting completion before first booking.
- **Service snapshots**: Services are snapshotted as JSONB at booking time — price/name changes by providers never alter existing bookings.
- **Content moderation**: ALL outbound messages must pass through `containsFlaggedContent()` in `validators.ts` before insert; flagged body is replaced with `[Message flagged for review]`.
- **Deposit model**: 15% of booking total collected at booking via Stripe; remainder captured on job completion; `deposit_forfeited = true` on late cancellations (within 24 hours).
- **Platform fees**: Provider platform fee is 5% (0% for Founding Providers for first 3 months). Customer service fee is 2% added at checkout.
- **Provider vetting**: A provider must pass all 6 vetting steps (identity, background check, insurance, credentials, bank account, profile completeness ≥ 80%) before `verification_status` is set to `approved`.
- **Live GPS**: Provider location updates every 5 seconds during active bookings. Live position is cached in Redis. Last-known position is persisted to `provider_location_cache` in Postgres.
- **Kudos**: Kudos badges are distinct from gear ratings — they live in the `kudos` table and are freeform positive badges ('Meticulous', 'Reliable', 'Magic Hands', 'Great Value', 'Fast Worker', 'Communicator').
- **Gear ratings**: Customers rate on 4 dimensions — Quality, Timeliness, Communication, Value (1–5 each). Overall score is a weighted composite.
- **Dispute window**: 48 hours post-service for either party to flag a rating for admin review.
- **RLS**: Every table has Row Level Security enabled. Always verify queries work under the correct Supabase auth role.
- **Lug AI**: Lug is powered by the Anthropic Claude API via the `lug-ai` Edge Function. Responses must be constrained by a system prompt referencing the CarApp service catalog. **Human escalation**: every Lug surface must show a persistent "Talk to a person" affordance (button or CTA) that opens a support thread in `/(tabs)/inbox/`. The affordance must be visible without scrolling — a footer disclaimer is not sufficient. After two consecutive responses where the user asks for human help, the affordance becomes the primary action.
- **In-app communications only**: No personal phone numbers, email addresses, or external payment handles may be shared in messages. Auto-detection of patterns like 'Venmo me', phone numbers, or email addresses triggers flagging.

---

## Design Tokens

All values are defined in `src/design/tokens.ts`.

### Colors

| Role | Hex |
|---|---|
| Deep Indigo (primary brand, headers, active states) | `#3D3B8E` |
| Electric Blue (CTAs, links, interactive highlights) | `#1A6DFF` |
| Emerald Green (success states, completed bookings) | `#10A96A` |
| Gear Gold (gear rating icons, premium badge, Lug accent) | `#D4A017` |
| Off-White (app background, card surfaces) | `#F7F8FC` |
| Charcoal (body text, primary content) | `#222222` |
| Mid Gray (secondary text, placeholders, inactive) | `#777777` |

### Typography

| Role | Font |
|---|---|
| Brand / Display | Space Grotesk |
| UI / Body | Inter |
| Monospace (prices, booking IDs) | JetBrains Mono |

### Component Standards

- Border radius: 12px (cards), 8px (inputs), 24px (primary action buttons)
- Icons: Lucide Icons as base library
- Motion: spring-based animations via React Native Reanimated — no linear tweens in primary UI

---

## Testing Conventions

After every code change, write the appropriate tests before considering the task complete.

| What changed | Test type | Tool | Location |
|---|---|---|---|
| Utility functions, state stores | Unit | Jest | `__tests__/` adjacent to file |
| Supabase queries / mutations | Integration | Jest + mocked Supabase client | `__tests__/` adjacent to file |
| Complete user flows | E2E | Maestro | `e2e/` at project root |

---

## Git Conventions

### Branching Strategy

- `main` — production only. Never commit directly.
- `dev` — integration branch. All features merge here first.
- `feature/<name>` — one branch per file or feature (e.g., `feature/auth-screen`)
- `fix/<name>` — for bug fixes (e.g., `fix/sign-in-redirect`)
- `dev` is branched off `main` once at project start — all `feature/*` and `fix/*` branches stem from `dev`
- Never merge branches — all merges are handled manually by the developer in GitHub

### Rules for Claude

- **At the start of every new session, before creating any branch or writing any code:**
  1. Ensure you are on `dev`: `git checkout dev`
  2. Pull the latest changes from origin: `git pull origin dev`
  3. Only then create a new feature branch off the updated `dev`
- NEVER commit directly to `main` or `dev`
- Always branch off `dev` when starting a new file or feature
- One branch per task — do not bundle unrelated changes
- After completing a task, do the following in order:
  1. Stage only the files relevant to the task: `git add <file>`
  2. Commit with a clean, descriptive message: `git commit -m "<type>(<scope>): <short description>"` dont mention anything about claude co-authoring
  3. Push the feature branch to GitHub: `git push origin <branch-name>`
  4. Merge the feature branch into `dev`: `git checkout dev && git merge <branch-name>`
  5. Push the updated `dev` branch: `git push origin dev`
  6. Delete the feature branch locally and remotely:
     `git branch -d <branch-name>`
     `git push origin --delete <branch-name>`
  7. Return to `dev` as the working branch for the next task
  8. Append a one-line file note to [Blueprint/reference.md](Blueprint/reference.md) in the format `[path/to/file.ts] — <one sentence describing what this file does and why it exists>`. One entry per completed task — do not batch. Append only — never edit or delete existing entries.
- Commit messages must be clean and descriptive — do not reference AI, Claude, or automated tooling

### Commit Message Format

`<type>(<scope>): <short description>`

Types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`

Examples:
- `feat(auth): add signInWithGoogle function`
- `fix(booking): correct deposit calculation`
- `test(validators): add unit tests for containsFlaggedContent`
- `feat(tracking): add live GPS provider map screen`

---

## Workflow Rules

- Before writing code for a new feature, state your approach and confirm it aligns with ARCHITECTURE.md.
- When modifying existing code, only touch what is necessary — do not refactor surrounding code.
- If something is unclear about domain logic, ask rather than assume.
- After completing a task, update ARCHITECTURE.md if new files, models, or patterns were introduced.
- Before starting any new feature, check `Blueprint/build_checklist.md` to confirm the correct build order and mark tasks complete with an "x" as you go.
- Session start (checkout/pull) and post-task (commit/push/merge/delete branch) sequences live in §Git Conventions → Rules for Claude.

---

## Reference Documents

| File | Purpose | When to read |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | ERD, tables, key design patterns | Before writing any new file |
| [carApp/supabase/schema.sql](carApp/supabase/schema.sql) | Schema + RLS policies + initial seeds | Before any DB query or mutation |
| [carApp/supabase/seeds/](carApp/supabase/seeds/) | Re-runnable, idempotent seed scripts | When changing seed data |
| [Blueprint/dependencies_list](Blueprint/dependencies_list) | All approved packages | Before `npm install <new-package>` |
| [Blueprint/build_checklist.md](Blueprint/build_checklist.md) | Phase-by-phase build order | Before starting a feature |
| [Blueprint/reference.md](Blueprint/reference.md) | One-line note per completed file | Appended to — see Git Conventions Step 8 |