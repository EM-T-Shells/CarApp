Sure — here's everything that needs external setup before you can test the app against live services:

Supabase Dashboard

Enable Google OAuth provider (requires Google Cloud Console client ID/secret)
Enable Apple OAuth provider (requires Apple Developer account, Service ID, key)
Enable Phone OTP with Twilio (Twilio Account SID, Auth Token, Messaging Service SID)
Ensure RLS is enabled on all tables (per Blueprint/schema_policies.sql)


Environment Variables

EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<google-maps-key>
EXPO_PUBLIC_SENTRY_DSN=<sentry-dsn>
EXPO_PUBLIC_MIXPANEL_TOKEN=<mixpanel-token>


Supabase Edge Function Secrets
Set via supabase secrets set:

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CHECKR_API_KEY
CHECKR_WEBHOOK_SECRET
PERSONA_API_KEY
PERSONA_WEBHOOK_SECRET
ANTHROPIC_API_KEY
REDIS_URL

Third-Party Accounts

Stripe — Connect platform account for payments/payouts
Firebase — Project for push notifications (FCM)
Google Cloud — Maps API key + OAuth client ID
Sentry — Project for error monitoring
Mixpanel — Project for analytics
Persona — Account for provider identity verification
Checkr — Account for provider background checks
