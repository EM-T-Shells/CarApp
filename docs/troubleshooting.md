# Operational Troubleshooting

## Stripe Account Mismatch

The client publishable key and Supabase `STRIPE_SECRET_KEY` must belong to the
same Stripe account and mode. The project currently uses test-mode keys.

A mismatch can produce:

`does not match any associated PaymentIntent on this account`

Environment variables are bundled at build time. Restart Expo after changing
`carApp/.env.local`:

`cd carApp && npx expo start -c`

## Stale Stripe Customer IDs

Changing Stripe accounts or keys can orphan `users.stripe_customer_id`.
Customer IDs exist only in the account that created them.

If PaymentIntent creation fails with `resource_missing`, clear stale IDs so
the Edge Function can recreate them:

    update users
    set stripe_customer_id = null
    where stripe_customer_id is not null;

Confirm the active Stripe account before running this statement.

## Edge Function JWT Verification

The two Stripe functions require opposite settings:

- `stripe-webhook` requires `verify_jwt: true`. It performs service-role writes
  and authenticates no caller in code, so turning verification off would make
  `cancel_booking`, `mark_no_show`, and `refund_deposit` anonymously callable.
- `stripe-events` requires `verify_jwt: false`. Stripe cannot attach a Supabase
  JWT; the function authenticates deliveries by verifying `Stripe-Signature`
  against `STRIPE_WEBHOOK_SECRET`.

Nothing in the repository enforces either setting. There is no
`carApp/supabase/config.toml` — `carApp/supabase/` contains only `functions/`,
`migrations/`, `schema.sql`, and `seeds/` — so both values exist only in the
Supabase dashboard.

CLI deployment must preserve them explicitly. Deploying `stripe-events` without
disabling JWT verification causes every Stripe delivery to receive a 401 before
the handler runs. Payments then stall at `pending`, because only `stripe-events`
advances a booking to `pending_provider_approval`. Re-check both settings after
any redeploy.

## MCP Configuration

`.mcp.json` at the repository root configures two local MCP servers, Supabase
and Stripe, each launched through `npx`.

The file holds live credentials inline, including a Supabase access token and a
Stripe secret key. It is machine-local and must never be committed. It is
covered by `.gitignore` and is currently untracked; keep it that way.

Never print, paste, or echo the contents of this file. To change a credential,
edit it directly on the machine that needs it.

## Unavailable Integrations

- Redis is not wired; `carApp/src/lib/redis/index.ts` is an empty stub.
- Mixpanel is not installed; omit analytics events.
- Sentry is not installed; do not call Sentry APIs.
- Checkr and Persona functions remain stubs until credentials are configured.
- `lug-ai` remains unavailable until `ANTHROPIC_API_KEY` is configured.
