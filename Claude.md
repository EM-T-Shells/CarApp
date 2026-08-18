# CarApp

Expo/React Native marketplace connecting vehicle owners with mobile detailers
and mechanics. TypeScript strict mode, Expo Router, Supabase, Stripe Connect,
Zustand, Firebase Cloud Messaging, and React Native StyleSheet.

## Commands

- Install: `npm install`
- Start: `npx expo start`
- Start after environment changes: `npx expo start -c`
- Type-check: `npx tsc --noEmit`
- Lint: `npx expo lint`
- Test: `npm test`
- E2E: `maestro test e2e/`

Before declaring work complete, run the narrowest relevant tests, followed by
type-checking and linting. Run the full test suite for changes affecting shared
code or complete user flows.

## Core Architecture

- Screens and routes belong in `app/`.
- Reusable components belong in `src/components/`.
- Cross-domain primitives belong in `src/components/ui/`.
- Database reads go through `src/lib/supabase/queries.ts`.
- Database writes go through `src/lib/supabase/mutations.ts`.
- File operations go through `src/lib/supabase/storage.ts`.
- Stripe client operations go through `src/lib/stripe/`.
- Global state uses one Zustand slice per domain in `src/state/`.
- Use React Context only for state localized to one screen or flow.
- Only `src/lib/supabase/` and `src/lib/stripe/` are implemented under
  `src/lib/`. Do not import from other `src/lib/*` stubs.
- Do not install packages before checking `Blueprint/dependencies_list`.

See `ARCHITECTURE.md` for the folder structure, ERD, and established patterns.
Read the relevant section before introducing a new file, model, or pattern.

## Critical Constraints

- Never expose secret or service-role keys to client code.
- Never edit `src/types/supabase.ts` manually; it is generated.
- Never call `supabase.from(...)` directly from a screen or component.
- Never write directly to `provider_location_cache` from the app.
- The client must never assert that a Stripe payment succeeded.
- Do not import Redis, Mixpanel, or Sentry; they are not wired.
- Use design tokens from `src/design/tokens.ts`; do not hardcode visual values.
- Make only task-relevant changes; do not perform opportunistic refactors.
- Ask before proceeding when domain behavior is ambiguous.

## Environment

Client-visible variables use `EXPO_PUBLIC_*` and are bundled into the app.
Read them using:

`Constants.expoConfig?.extra?.<KEY> ?? process.env.<KEY>`

Stripe secret keys are Edge Function secrets and must never use the
`EXPO_PUBLIC_` prefix. See `.env.example` for client variables.

`.mcp.json` contains local Supabase MCP configuration. It must remain
uncommitted.

## Git Safety

Do not commit, push, merge, switch branches, delete branches, or modify remote
state unless explicitly requested. When Git operations are requested, follow
`CONTRIBUTING.md`.

## Documentation

- Architecture and ERD: `ARCHITECTURE.md`
- Database schema and RLS: `carApp/supabase/schema.sql`
- Business behavior: `docs/business-rules.md`
- Known operational problems: `docs/troubleshooting.md`
- Approved dependencies: `Blueprint/dependencies_list`
- Build tracker: `Blueprint/build_checklist.md`
- Per-file reference: `Blueprint/reference.md`

Update `ARCHITECTURE.md` when introducing a new file, model, or architectural
pattern. Update the build tracker or reference only when the task explicitly
requires it.
