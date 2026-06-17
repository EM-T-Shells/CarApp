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
- `.mcp.json` is gitignored — holds a Supabase PAT; never commit or paste it. Rotate at https://supabase.com/dashboard/account/tokens if leaked.

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
| `stripe-webhook` | Stripe event + app invocation | Webhook verification + `create_deposit_intent` action |
| `checkr-webhook` | Checkr event | Background check status update |
| `persona-webhook` | Persona event | Identity verification update |
| `notify-booking-confirmed` | DB insert on bookings | Push to customer + provider |
| `notify-provider-enroute` | Booking → en_route | Push to customer |
| `notify-job-complete` | Booking → completed | Push to customer |
| `notify-payout-processed` | Payout → paid | Push to provider |
| `notify-kudos-received` | Kudos insert | Push to provider |
| `lug-ai` | App request | Anthropic Claude API proxy |

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
- **Tabs**: All 5 tabs visible to all users — no role-gating in layout. Role-specific UI at screen level only.
- **OAuth**: Google → `expo-auth-session` (PKCE). Apple → native on iOS, `expo-auth-session` on Android. OAuth handling in `auth.ts` — screens never call `signInWithOAuth` directly.
- **OTP**: Email + phone via `signInWithOtp`. Phone requires Twilio in Supabase dashboard.
- **Roles**: All users default to Customer. Provider mode is opt-in, requires full vetting before first booking.
- **Service snapshots**: Services snapshotted as JSONB at booking — provider edits don't affect existing bookings.
- **Content moderation**: All outbound messages through `containsFlaggedContent()` in `validators.ts` before insert.
- **Deposit**: 15% at booking, remainder on completion. `deposit_forfeited = true` for cancellations within 24h.
- **Fees**: Provider 5% (0% Founding Providers for 3 months). Customer 2% at checkout.
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
- Planning source of truth: `Blueprint/end_user_flows.md`. Checklist tracker: `Blueprint/build_checklist.md`.

---

## Reference Documents

| File | Purpose | When to read |
|---|---|---|
| `ARCHITECTURE.md` | ERD, tables, patterns | Before any new file |
| `carApp/supabase/schema.sql` | Schema + RLS + seeds | Before any DB work |
| `Blueprint/dependencies_list` | Approved packages | Before `npm install` |
| `Blueprint/end_user_flows.md` | Planning source of truth | Before any feature |
| `Blueprint/build_checklist.md` | Build order tracker | Mark complete as you go |
| `Blueprint/reference.md` | Per-file notes | Append after each task |