---
globs: "supabase/functions/**/*"
---

# Supabase Edge Functions

- Edge Functions run on Deno.
- Use Deno-compatible imports; never use `require()`.
- Read secrets with `Deno.env.get()`.
- Do not expose secrets in responses or logs.
- Verify caller identity before service-role writes.
- Stripe deliveries must be signature-verified.
- Checkr and Persona integrations remain stubs until their API keys are set.
- `lug-ai` must return a controlled unavailable response when
  `ANTHROPIC_API_KEY` is absent.

Canonical responsibilities:

- `stripe-webhook`: JWT-authenticated app payment actions
- `stripe-events`: signature-authenticated Stripe events
- `admin-review-provider`: authenticated provider approval/rejection
- `update-provider-location`: verifies ownership before location updates
- `checkr-webhook`: background-check updates
- `persona-webhook`: identity-verification updates
- `notify-*`: event-specific push notifications
- `lug-ai`: Anthropic API proxy

Do not add unrelated actions to an existing function merely to avoid creating
a correctly scoped function.