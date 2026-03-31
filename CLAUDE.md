# CarApp — Claude System Prompt

## Project Overview
CarApp is a React Native (Expo) mobile app connecting customers with local car service providers (detailers and mechanics). Customers book appointments, providers manage services and schedules. Payments use Stripe with a deposit model.

## Tech Stack
- **Framework**: Expo ~55 / React Native 0.83 / React 19
- **Routing**: Expo Router (file-based, like Next.js)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Language**: TypeScript (strict mode)
- **Payments**: Stripe (planned)
- **Auth Storage**: Expo Secure Store

## Repository Layout
```
CarApp/
├── carApp/               # Expo app (all source code lives here)
│   ├── app/              # Expo Router screens (file = route)
│   │   ├── _layout.tsx   # Root layout — auth gate
│   │   ├── (auth)/       # Unauthenticated screens
│   │   └── (tabs)/       # Authenticated tab screens
│   ├── src/
│   │   ├── lib/supabase/ # client.ts, auth.ts, queries.ts, mutations.ts
│   │   ├── state/        # Global state slices (auth, search, bookingDraft)
│   │   ├── types/        # models.ts, supabase.ts (generated), navigation.ts
│   │   ├── utils/        # validators.ts, money.ts, date.ts
│   │   └── components/   # Reusable UI components (domain-organized)
│   └── assets/           # Images, fonts, icons
├── Blueprint/            # Schema, policies, build plan docs
└── ARCHITECTURE.md       # Stack decisions and data model reference
```

## Commands
```bash
cd carApp
npx expo start          # Start dev server
npx expo start --android
npx expo start --ios
npx expo start --web
```
After schema changes: `supabase gen types typescript --project-id <id> > src/types/supabase.ts`

## Conventions — DO
- ALL database reads go in `src/lib/supabase/queries.ts`. ALL writes go in `mutations.ts`. No exceptions.
- ALL new files use TypeScript with explicit types.
- Screen-level components live under `app/`. Reusable UI lives under `src/components/`.
- Money stored as integers (cents) in DB. Always format for display using `src/utils/money.ts`.
- Dates stored as ISO strings. Always parse/format using `src/utils/date.ts`.
- **Global state** (auth session, search filters, booking draft, sign-up draft) uses **Zustand**. Slices live in `src/state/`, one file per domain.
- **Localized state** scoped to a single feature tree (multi-step forms, modals, a single screen) uses **React Context**. Do not use React Context for app-wide state.

## Conventions — NEVER DO
- NEVER use `any` in TypeScript.
- NEVER call `supabase.from(...)` directly in a component or screen — always go through `queries.ts` or `mutations.ts`.
- NEVER edit `src/types/supabase.ts` manually — it is auto-generated.
- NEVER use `service_role` key in client code — it bypasses RLS.
- NEVER store secrets in code — use `EXPO_PUBLIC_` env vars.
- NEVER install a new package without checking `Blueprint/dependecies_list` first.
- NEVER use Redux or any state library other than Zustand and React Context.
- NEVER use React Context for app-wide state — use Zustand instead.

## Key Business Logic
- **Auth gate**: `app/_layout.tsx` listens to `onAuthStateChange` → routes to `(auth)/sign-in` or `(tabs)/`
- **Service snapshots**: Services are snapshotted as JSONB at booking time — price/name changes by providers never alter existing appointments
- **Content moderation**: ALL outbound messages must pass through `containsFlaggedContent()` in `validators.ts` before insert; flagged body is replaced with `[Message flagged for review]`
- **Deposit model**: 15% of `total_estimate` collected at booking via Stripe; `deposit_forfeited = true` on late cancellations
- **RLS**: Every table has Row Level Security enabled. Always verify queries work under the correct Supabase auth role.

## Active Development Focus
1. Auth screens (`app/(auth)/sign-in.tsx`) and `src/lib/supabase/auth.ts`
2. Global auth state (`src/state/auth.ts`)
3. Tab layout (`app/(tabs)/_layout.tsx`)
4. UI component library (`src/components/`)

## Notes for Claude
- Before writing code for a new feature, state your approach and confirm it aligns with ARCHITECTURE.md.
- When modifying existing code, only touch what is necessary — do not refactor surrounding code.
- If something is unclear about domain logic, ask rather than assume.
- After completing a task, update ARCHITECTURE.md if new files, models, or patterns were introduced.

## Testing Conventions
After every code change, write the appropriate tests before considering the task complete.

| What changed | Test type | Tool | Location |
|---|---|---|---|
| Utility functions, state stores | Unit | Jest | `__tests__/` adjacent to file |
| Supabase queries / mutations | Integration | Jest + mocked Supabase client | `__tests__/` adjacent to file |
| Complete user flows | E2E | Maestro | `e2e/` at project root |