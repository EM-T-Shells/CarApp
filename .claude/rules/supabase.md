---
globs: "src/lib/supabase/**/*,src/types/supabase.ts,supabase/**/*"
---

# Supabase Rules

- All reads go through `src/lib/supabase/queries.ts`.
- All writes go through `src/lib/supabase/mutations.ts`.
- Return `QueryResult<T>` or `MutationResult<T>` rather than redeclaring
  `{ data, error }`.
- Never use a `service_role` key in client code.
- RLS must be enabled and tested under the correct authenticated role.
- Never manually edit `src/types/supabase.ts`.

For schema changes using Supabase MCP:

1. Run `mcp__supabase__list_tables`.
2. Apply an idempotent, snake-case migration with
   `mcp__supabase__apply_migration`.
3. Run `mcp__supabase__generate_typescript_types`.
4. Overwrite `src/types/supabase.ts` with the generated types.
5. Update `schema.sql` and affected queries or mutations.

Without MCP, apply SQL through the Supabase dashboard and generate types with:

`supabase gen types typescript --project-id <id>`

File uploads must go through `src/lib/supabase/storage.ts`. Compress images
before upload: maximum 1920px, 80% quality, 10 MB, and JPEG/PNG/WebP only. Use
`getPublicUrl()` rather than hardcoded storage URLs.

Buckets:

- `avatars`: public
- `booking-photos`: booking participants only
- `vetting-documents`: service role only