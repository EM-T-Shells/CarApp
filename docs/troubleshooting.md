# Operational Troubleshooting

## Stripe Account Mismatch

The client publishable key and Supabase `STRIPE_SECRET_KEY` must belong to the
same Stripe account and mode. The project currently uses test-mode keys.

A mismatch can produce:

`does not match any associated PaymentIntent on this account`

Environment variables are bundled at build time. Restart Expo after changing
`.env.local`:

`npx expo start -c`

## Stale Stripe Customer IDs

Changing Stripe accounts or keys can orphan `users.stripe_customer_id`.
Customer IDs exist only in the account that created them.

If PaymentIntent creation fails with `resource_missing`, clear stale IDs so
the Edge Function can recreate them:

    update users
    set stripe_customer_id = null
    where stripe_customer_id is not null;

Confirm the active Stripe account before running this statement.

## Supabase MCP

`.mcp.json` configures the hosted Supabase MCP endpoint:

`https://mcp.supabase.com/mcp?project_ref=…`

Authentication is interactive OAuth and cached per machine. The file contains
no token, but it remains machine-local and must not be committed.

## Unavailable Integrations

- Redis is not wired; `src/lib/redis/index.ts` is an empty stub.
- Mixpanel is not installed; omit analytics events.
- Sentry is not installed; do not call Sentry APIs.
- Checkr and Persona functions remain stubs until credentials are configured.
- `lug-ai` remains unavailable until `ANTHROPIC_API_KEY` is configured.
