Sure — here's everything that needs external setup before you can test the app against live services:

Supabase Dashboard

Enable Google OAuth provider (requires Google Cloud Console client ID/secret)
Enable Apple OAuth provider (requires Apple Developer account, Service ID, key)
Enable Phone OTP with Twilio (Twilio Account SID, Auth Token, Messaging Service SID)
Ensure RLS is enabled on all tables (per carApp/supabase/schema.sql)


Environment Variables

EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<google-maps-key>
EXPO_PUBLIC_SENTRY_DSN=<sentry-dsn>
EXPO_PUBLIC_MIXPANEL_TOKEN=<mixpanel-token>


Supabase Edge Function Secrets
Set via supabase secrets set:

STRIPE_SECRET_KEY ✅
STRIPE_WEBHOOK_SECRET ✅
CHECKR_API_KEY
CHECKR_WEBHOOK_SECRET
PERSONA_API_KEY
PERSONA_WEBHOOK_SECRET
ANTHROPIC_API_KEY
REDIS_URL

Scheduled Jobs (Blocker #4 — provider-approval auto-cancel) ✅ DEPLOYED

The 2-hour provider-approval window auto-cancels and refunds via a pg_cron job
created in carApp/supabase/migrations/20260618195809_booking_provider_approval_model.sql.
The job reads the Edge Function URL + service-role key from Supabase Vault
(this project cannot ALTER DATABASE ... SET, so the usual GUC-settings approach
is not available). Seed the two Vault secrets once per project:

  DELETE FROM vault.secrets WHERE name IN ('edge_url','service_role_key');
  SELECT vault.create_secret('https://<project-ref>.supabase.co/functions/v1/stripe-webhook', 'edge_url');
  SELECT vault.create_secret('<service-role-key>', 'service_role_key');

Status on project apbubklogxgqkokbctwz: extensions pg_cron + pg_net enabled,
both Vault secrets seeded, job 'expire-pending-approvals' scheduled (every
minute) and verified returning HTTP 200 {ok:true}. The three Edge Functions
below are deployed:

  supabase functions deploy stripe-webhook            ✅
  supabase functions deploy notify-booking-requested  ✅
  supabase functions deploy notify-booking-declined   ✅


Cancellation policy (Blocker #5) — ✅ DEPLOYED

Server-enforced cancellation policy ($15 customer late-cancel fee / $25 provider
penalty / no-show forfeit). Applied to project apbubklogxgqkokbctwz:

  1. Migration 20260622120000_cancellation_policy.sql applied (supabase db push) —
     adds cancellation_fee / cancelled_by / no_show_at and the 'no_show' status
     to the bookings.status CHECK. Verified live. ✅
       (Note: db push first required `supabase migration repair --status reverted`
       on 7 older remote-only history rows that were applied outside the local
       migrations dir — bookkeeping only, no schema was reverted.)

  2. supabase functions deploy stripe-webhook            ✅ (v11)
       adds cancel_booking / provider_cancel_booking / mark_no_show + partial refunds
  3. supabase functions deploy notify-booking-cancelled  ✅ (v1)

No new env vars or Vault secrets are required for this blocker.


Blocker #8 — Founding Provider Program (first 100 @ 0% → 3% after 90 days).
Applied to project apbubklogxgqkokbctwz:

  1. Migration 20260622140000_founding_provider_program.sql applied (supabase db
     push) — adds founding_provider_expires_at + the provision_founding_provider
     trigger and the expire_founding_providers() sweep; flips the standard
     platform_fee_rate default 0.05 → 0.030 and re-points existing 5% rows. ✅
  2. pg_cron job 'expire-founding-providers' scheduled (0 3 * * *, daily 03:00 UTC).
     ✅  (pg_cron already enabled from blocker #4.)

No Edge Function deploy, env vars, or Vault secrets are required for this blocker —
provisioning + expiry are pure DB (trigger + in-SQL cron; no money movement, so no
Stripe round-trip). No new external accounts required.


Third-Party Accounts

Stripe — Connect platform account for payments/payouts
Firebase — Project for push notifications (FCM)
Google Cloud — Maps API key + OAuth client ID
Sentry — Project for error monitoring
Mixpanel — Project for analytics
Persona — Account for provider identity verification
Checkr — Account for provider background checks
