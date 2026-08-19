---
paths:
  - carApp/src/lib/supabase/**
  - carApp/src/types/supabase.ts
  - carApp/supabase/**
---

# Supabase Rules

- All reads go through `carApp/src/lib/supabase/queries.ts`.
- All writes go through `carApp/src/lib/supabase/mutations.ts`.
- Return `QueryResult<T>` or `MutationResult<T>` rather than redeclaring
  `{ data, error }`.
- Never use a `service_role` key in client code.
- RLS must be enabled and tested under the correct authenticated role.
- Never manually edit `carApp/src/types/supabase.ts`.

Schema changes reach the remote database and require explicit approval. The
Supabase MCP write tools are not exposed in every session; check availability
rather than assuming it.

1. Inspect the current schema first: `mcp__supabase__list_tables` when that
   tool is available, otherwise `carApp/supabase/schema.sql`.
2. Write an idempotent, snake-case migration and show the exact SQL. Obtain
   explicit approval before making any remote change.
3. Apply the approved SQL with `mcp__supabase__apply_migration` only when that
   tool is available in the session.
4. When it is not, apply the approved SQL through an explicitly approved
   Supabase CLI command or the Supabase dashboard.
5. Regenerate types with `mcp__supabase__generate_typescript_types` when
   available; otherwise run from `carApp/`:

   `supabase gen types --lang=typescript --project-id <project-ref> > src/types/supabase.ts`

6. Update `carApp/supabase/schema.sql` and affected queries or mutations.

File uploads must go through `carApp/src/lib/supabase/storage.ts`. Compress
images before upload: maximum 1920px, 80% quality, 10 MB, and JPEG/PNG/WebP
only. Use `getPublicUrl()` rather than hardcoded storage URLs.

Buckets:

- `avatars`: public
- `booking-photos`: booking participants only
- `vetting-documents`: service role only