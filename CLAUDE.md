# Stabl — Claude System Prompt

## Project Overview
Stabl is a React Native (Expo) mobile app — a two-sided marketplace connecting vehicle owners with vetted, independent mobile car detailers and mechanics in the Northern Virginia / DC Metro area. Customers book services, track providers live, and pay via Stripe. Providers manage schedules, earnings, and reputation. Payments use Stripe Connect with a deposit model (15% at booking, remainder on completion).

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
stabl/
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
├── e2e/                        # Maestro E2E flows
├── assets/                     # Fonts, images, icons
├── Blueprint/                  # Schema, policies, build plan docs
├── ARCHITECTURE.md
├── CLAUDE.md
└── .claudeignore


## Conventions — DO
- ALL database reads go in `src/lib/supabase/queries.ts`. ALL writes go in `mutations.ts`. No exceptions.
- ALL new files use TypeScript with explicit types.
- Screen-level components live under `app/`. Reusable UI lives under `src/components/`.
- Money stored as integers (cents) in DB. Always format for display using `src/utils/money.ts`.
- Dates stored as ISO strings. Always parse/format using `src/utils/date.ts`.
- **Global state** (auth session, search filters, booking draft, sign-up draft, provider draft) uses **Zustand**. Slices live in `src/state/`, one file per domain.
- **Localized state** scoped to a single feature tree (multi-step forms, modals, a single screen) uses **React Context**. Do not use React Context for app-wide state.
- Always reference design tokens from `src/design/tokens.ts` — never hardcode hex values or font sizes in components.
- Always use Inter for UI/body text. Always use Space Grotesk for brand/display. Always use JetBrains Mono for prices and booking IDs.
- All interactive elements must meet WCAG 2.1 AA minimum — 44x44pt touch target minimum.
- All components must support dark mode via dynamic color tokens.

---

## Conventions — NEVER DO
- NEVER use `any` in TypeScript.
- NEVER call `supabase.from(...)` directly in a component or screen — always go through `queries.ts` or `mutations.ts`.
- NEVER edit `src/types/supabase.ts` manually — it is auto-generated.
- NEVER use `service_role` key in client code — it bypasses RLS.
- NEVER store secrets in code — use `EXPO_PUBLIC_` env vars.
- NEVER install a new package without checking `Blueprint/dependencies_list` first.
- NEVER use Redux or any state library other than Zustand and React Context.
- NEVER use React Context for app-wide state — use Zustand instead.
- NEVER hardcode a hex value in a component — import from `src/design/tokens.ts`.
- NEVER use a font other than Inter, Space Grotesk, or JetBrains Mono.
- NEVER write directly to `provider_location_cache` from the app — live GPS position goes to Redis; Postgres persistence is handled server-side.

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
- **Lug AI**: Lug is powered by the Anthropic Claude API. Responses must be constrained by a system prompt referencing the Stabl service catalog. Always provide a human escalation path.
- **In-app communications only**: No personal phone numbers, email addresses, or external payment handles may be shared in messages. Auto-detection of patterns like 'Venmo me', phone numbers, or email addresses triggers flagging.

---

## Design Tokens

All design values are locked in `src/design/tokens.ts`. Never hardcode colors, font sizes, or spacing values in components.

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

## Notes for Claude
- Before writing code for a new feature, state your approach and confirm it aligns with ARCHITECTURE.md.
- When modifying existing code, only touch what is necessary — do not refactor surrounding code.
- If something is unclear about domain logic, ask rather than assume.
- After completing a task, update ARCHITECTURE.md if new files, models, or patterns were introduced.
- Before starting any new feature, check `Blueprint/build_checklist.md` 
  to confirm the correct build order and mark tasks complete as you go.

  ## Reference Documents
- `ARCHITECTURE.md` — ERD, table decisions, key design patterns. Read before writing any new file.
- `Blueprint/schema_policies.sql` — Unified merged schema with RLS policies. Source of truth for all table structures.

