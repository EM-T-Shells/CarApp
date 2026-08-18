---
globs: "app/**/*,src/**/*,supabase/functions/**/*,__tests__/**/*,e2e/**/*"
---

# Testing

Add or update tests for changed behavior before marking a task complete.

- Utilities and state stores: adjacent Jest tests under `__tests__/`
- Supabase queries and mutations: adjacent Jest integration tests with a mock
  client
- Complete user flows: Maestro tests under `e2e/`

Run the narrowest relevant tests during implementation. Before completion, run:

- `npm test`
- `npx tsc --noEmit`
- `npx expo lint`

Do not exclude new tests from the default test run. Offline queuing and
optimistic UI are out of scope for the current MVP; failures should provide an
error state and retry action.
