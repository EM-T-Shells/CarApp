---
paths:
  - carApp/**/__tests__/**
  - carApp/e2e/**
  - carApp/src/**
  - carApp/app/**
  - carApp/supabase/functions/**
---

# Testing

Add or update tests for changed behavior before marking a task complete.

Place Jest tests in a `__tests__/` directory adjacent to the code under test:

- Utilities, state stores, and library modules under `carApp/src/`
- Supabase queries and mutations under `carApp/src/lib/supabase/`, written as
  integration tests against a mock client
- Screens and route components under `carApp/app/`
- Edge Functions under `carApp/supabase/functions/`

Complete user flows use Maestro specs under `carApp/e2e/`.

`CLAUDE.md` is authoritative for the test and type-check commands, for which
completion checks a given change requires, and for which tools are not
completion gates. Follow it rather than restating it here.

Do not exclude new tests from the default test run. Offline queuing and
optimistic UI are out of scope for the current MVP; failures should provide an
error state and retry action.
