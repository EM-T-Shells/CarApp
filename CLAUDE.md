# CarApp — Claude System Prompt

## Project Overview

CarApp is a React Native (Expo) mobile app — a two-sided marketplace connecting vehicle owners with vetted, independent mobile car detailers and mechanics in the Northern Virginia / DC Metro area. Customers book services, track providers live, and pay via Stripe. Providers manage schedules, earnings, and reputation. Payments use Stripe Connect with a deposit model (15% at booking, remainder on completion).

---

## Tech Stack

- **Framework**: Expo / React Native
- **Routing**: Expo Router (file-based, like Next.js)
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
- **Caching / Ephemeral Data**: Redis (live GPS caching, rate limiting, short-lived tokens)
- **Language**: TypeScript (strict mode)
- **Payments**: Stripe Connect
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Maps**: Google Maps SDK + react-native-maps
- **Analytics**: Mixpanel
- **Error Monitoring**: Sentry
- **Auth Storage**: Expo Secure Store
- **Styling**: NativeWind + Tailwind CSS

---

## Repository Layout

```
carApp/
├── app/                        # Expo Router screens (file = route)
│   ├── _layout.tsx             # Root layout — auth gate
│   ├── (auth)/                 # Unauthenticated screens
│   └── (tabs)/                 # Authenticated tab screens
├── src/
│   ├── lib/
│   │   ├── supabase/           # client.ts, auth.ts, queries.ts, mutations.ts, storage.ts
│   │   ├── redis/              # GPS caching, rate limiting, short-lived tokens
│   │   ├── stripe/             # Stripe Connect integration
│   │   ├── checkr/             # Background check webhook handling
│   │   ├── persona/            # Identity verification flow
│   │   ├── notifications/      # Firebase Cloud Messaging (push.ts)
│   │   └── location/           # GPS utilities
│   ├── state/                  # Zustand global state slices
│   ├── types/                  # models.ts, supabase.ts (generated), navigation.ts
│   ├── utils/                  # validators.ts, money.ts, date.ts
│   ├── components/             # Reusable UI components (domain-organized)
│   └── design/                 # theme.ts, tokens.ts, typography.ts
├── supabase/
│   └── functions/              # Edge Functions (Deno runtime — not Node)
│       ├── stripe-webhook/
│       ├── checkr-webhook/
│       ├── persona-webhook/
│       ├── notify-booking-confirmed/
│       ├── notify-provider-enroute/
│       ├── notify-job-complete/
│       ├── notify-payout-processed/
│       ├── notify-kudos-received/
│       └── lug-ai/
├── e2e/                        # Maestro E2E flows
├── assets/                     # Fonts, images, icons
├── Blueprint/                  # Schema, policies, build plan docs
├── ARCHITECTURE.md
├── CLAUDE.md
└── .claudeignore
```

---

## Environment Variables

All secrets are stored in environment variables. Never hardcode any of these values in code.

**Mobile app** — stored in `.env.local`, prefixed with `EXPO_PUBLIC_`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_KEY
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
EXPO_PUBLIC_SENTRY_DSN
EXPO_PUBLIC_MIXPANEL_TOKEN
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_APP_ID
```

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

An `.env.example` file lives at the project root with all keys listed but no values — reference this when setting up a new environment.

---

## Conventions

### Database & Types

- ALL database reads go in `src/lib/supabase/queries.ts`. ALL writes go in `mutations.ts`. Never call `supabase.from(...)` directly in a component or screen.
- All new files use TypeScript with explicit types. Never use `any`.
- Never edit `src/types/supabase.ts` manually — it is auto-generated.
- Never use `service_role` key in client code — it bypasses RLS.
- After any schema change run: `supabase gen types typescript --project-id <id> > src/types/supabase.ts`

### Architecture

- Screen-level components live under `app/`. Reusable UI lives under `src/components/`.
- Never install a new package without checking `Blueprint/dependencies_list` first.

### State Management

- **Global state** (auth session, search filters, booking draft, sign-up draft, provider draft) uses **Zustand**. Slices live in `src/state/`, one file per domain.
- **Localized state** scoped to a single feature tree (multi-step forms, modals, a single screen) uses **React Context**.
- Never use Redux or any state library other than Zustand and React Context. Never use React Context for app-wide state.

### Data Formatting

- Money stored as integers (cents) in DB. Always format for display using `src/utils/money.ts`.
- Dates stored as ISO strings. Always parse/format using `src/utils/date.ts`.

### Design

- All design values are defined in `src/design/tokens.ts` — never hardcode hex values, font sizes, or spacing in components.
- Use Inter for UI/body text, Space Grotesk for brand/display, JetBrains Mono for prices and booking IDs. No other fonts.
- All interactive elements must meet WCAG 2.1 AA — 44x44pt touch target minimum.
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
| `stripe-webhook` | Stripe event | Payment succeeded, payout processed |
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
- GPS tracking: if connection drops during active booking, buffer the last known position and resume on reconnect — do not crash or clear the map

---

## Key Business Logic

- **Auth gate**: `app/_layout.tsx` listens to `onAuthStateChange` → routes to `(auth)/sign-in` or `(tabs)/`
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
- **Lug AI**: Lug is powered by the Anthropic Claude API via the `lug-ai` Edge Function. Responses must be constrained by a system prompt referencing the CarApp service catalog. Always provide a human escalation path.
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

- NEVER commit directly to `main` or `dev`
- Always branch off `dev` when starting a new file or feature
- One branch per task — do not bundle unrelated changes
- After completing a task, stage only the files relevant to that task

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
- Before starting any new feature, check `Blueprint/build_checklist.md` to confirm the correct build order and mark tasks complete as you go.

---

## Reference Documents

- `ARCHITECTURE.md` — ERD, table decisions, key design patterns. Read before writing any new file.
- `Blueprint/schema_policies.sql` — Unified merged schema with RLS policies. Source of truth for all table structures.
- `Blueprint/dependencies_list` — All approved packages. Check before installing anything new.
- `Blueprint/build_checklist.md` — Phase-by-phase build order. Check before starting any new feature.
