# CarApp

Expo/React Native marketplace connecting vehicle owners with mobile detailers
and mechanics. TypeScript strict mode, Expo Router, Supabase, Stripe Connect,
Zustand, Firebase Cloud Messaging, and React Native StyleSheet.

## Repository Layout

The repository root is a container. The Expo application lives in `carApp/`,
and the root has no `package.json`. Every path in this document is relative to
the repository root, and every command runs from `carApp/` unless stated
otherwise.

## Commands

- Install: `cd carApp && npm install`
- Start: `cd carApp && npm start`
- Start after environment changes: `cd carApp && npx expo start -c`
- Type-check: `cd carApp && npx tsc --noEmit`
- Full test suite: `cd carApp && npm test`
- Narrow tests: `cd carApp && npx jest <path-or-pattern>`
- Seed E2E fixtures: `cd carApp && npm run seed:e2e`
  (`npm run seed:e2e:clean` to reset)

### Completion checks

- Isolated change confined to one module with no shared surface: run the
  narrowest relevant tests for the code you touched.
- Change to shared code, or a change spanning a complete user flow: run the
  full test suite and the TypeScript check.

Linting and Maestro E2E are not completion gates. ESLint is not installed and
`carApp/` carries no ESLint configuration; `maestro` is not on PATH. Do not
treat `npx expo lint` or `maestro test carApp/e2e/` as verified commands until
they are wired up.

## Core Architecture

- Screens and routes belong in `carApp/app/`.
- Reusable components belong in `carApp/src/components/`.
- Cross-domain primitives belong in `carApp/src/components/ui/`.
- Database reads go through `carApp/src/lib/supabase/queries.ts`.
- Database writes go through `carApp/src/lib/supabase/mutations.ts`.
- File operations go through `carApp/src/lib/supabase/storage.ts`.
- Stripe client operations go through `carApp/src/lib/stripe/`.
- Global state uses one Zustand slice per domain in `carApp/src/state/`.
- Dates are stored as ISO strings and formatted through
  `carApp/src/utils/date.ts`.
- Money is stored as integer cents and formatted through
  `carApp/src/utils/money.ts`; never render a raw cents value.
- Use React Context only for state localized to one screen or flow.
- Implemented under `carApp/src/lib/`: `supabase/`, `stripe/`, `location/`,
  and `notifications/`. Import these normally.
- `carApp/src/lib/redis/` is an empty stub; never import it.
- `carApp/src/lib/checkr/` and `carApp/src/lib/persona/` are callable stubs
  pending credentials. Calling them is allowed; they return no live data until
  their keys are configured.
- Do not install packages before checking `Blueprint/dependencies_list`.

See `ARCHITECTURE.md` for the folder structure, ERD, and established patterns.
Read the relevant section before introducing a new file, model, or pattern.

## Critical Constraints

- TypeScript is strict; never introduce `any`.
- No `console.log` in production code.
- Async data operations return typed result wrappers (`QueryResult`,
  `MutationResult`, `StripeResult`); never throw raw errors to callers.
- Never expose secret or service-role keys to client code.
- Never edit `carApp/src/types/supabase.ts` manually; it is generated.
- Never call `supabase.from(...)` directly from a screen or component.
- Never write directly to `provider_location_cache` from the app.
- The client must never assert that a Stripe payment succeeded.
- Do not import Redis, Mixpanel, or Sentry; they are not wired.
- Use design tokens from `carApp/src/design/tokens.ts`; do not hardcode visual
  values.
- Read repository files with the native Read tool, not Bash `cat`, `head`, or
  `sed`; only Read activates the path-scoped rules in `.claude/rules/`.
- State the intended approach before substantial implementation.
- Make only task-relevant changes; do not perform opportunistic refactors.
- Ask before proceeding when domain behavior is ambiguous.

## Environment

Client-visible variables use `EXPO_PUBLIC_*` and are bundled into the app.
Read them using:

`Constants.expoConfig?.extra?.<KEY> ?? process.env.<KEY>`

Stripe secret keys are Edge Function secrets and must never use the
`EXPO_PUBLIC_` prefix. See `carApp/.env.example` for client variables; local
values live in the untracked `carApp/.env.local`.

Edge Function secrets are set with `supabase secrets set` and are never
bundled into the client. Refer to these by name only; never print or paste a
value.

Read by current code: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`CHECKR_WEBHOOK_SECRET`, `PERSONA_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
`LUG_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `FCM_SERVICE_ACCOUNT`.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform
rather than set by hand.

Named in the Checkr and Persona stubs but not yet read by any code:
`CHECKR_API_KEY` and `PERSONA_API_KEY`. `REDIS_URL` appears nowhere in the
codebase; Redis is deferred. There are no `CHECKR_API_SECRET` or
`PERSONA_API_SECRET` secrets — the signature secrets are the
`*_WEBHOOK_SECRET` names above.

`.mcp.json` at the repository root configures the Supabase and Stripe MCP
servers. It holds live credentials, is machine-local, and must never be
committed. It is already covered by `.gitignore`; keep it that way, and never
print or paste its contents.

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
