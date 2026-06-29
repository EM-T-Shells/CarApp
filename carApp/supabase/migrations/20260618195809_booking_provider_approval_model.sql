-- Blocker #4: restore the manual provider-approval model.
--
-- Status flow:
--   pending -> pending_provider_approval -> confirmed -> en_route
--           -> in_progress -> completed   (or cancelled at any pre-completion step)
--
-- The deposit no longer auto-confirms a booking. On deposit success the
-- stripe-webhook Edge Function moves the booking to pending_provider_approval
-- and stamps approval_expires_at = now() + 2h. The provider then accepts
-- (-> confirmed) or declines (-> cancelled + deposit refund). A pg_cron sweep
-- auto-cancels and refunds any approval still pending past its deadline.
--
-- Apply with: supabase db push   (or run in the SQL editor on the project).

-- ── Columns ────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_reason     TEXT;

-- ── Status CHECK ───────────────────────────────────────────────────────
-- Recreate the constraint to admit the restored pending_provider_approval.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending',
    'pending_provider_approval',
    'confirmed',
    'en_route',
    'in_progress',
    'completed',
    'cancelled'
  ));

-- ── Index for the auto-cancel sweep ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_pending_approval_expiry
  ON public.bookings (approval_expires_at)
  WHERE status = 'pending_provider_approval';

-- ── Scheduled auto-cancel (2-hour timeout) ──────────────────────────────
-- pg_cron fires every minute and asks the Edge Function to expire overdue
-- approvals. The refund must go through Stripe, so the actual cancel+refund
-- lives in the Edge Function (action: expire_pending_approvals); cron only
-- triggers it. pg_net performs the outbound HTTP call.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The job reads the Edge Function URL + service-role key from Supabase Vault
-- (this project cannot ALTER DATABASE ... SET, so GUC settings are not an
-- option). Seed the two secrets once per project before/with this migration —
-- see Blueprint/external_setup.md:
--   DELETE FROM vault.secrets WHERE name IN ('edge_url','service_role_key');
--   SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/stripe-webhook', 'edge_url');
--   SELECT vault.create_secret('<service-role-key>', 'service_role_key');

SELECT cron.unschedule('expire-pending-approvals')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-approvals');

SELECT cron.schedule(
  'expire-pending-approvals',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_url'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body    := jsonb_build_object('action', 'expire_pending_approvals')
  );
  $$
);
