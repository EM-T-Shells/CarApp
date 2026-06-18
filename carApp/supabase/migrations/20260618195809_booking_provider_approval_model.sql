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

-- These two settings must be configured once per project (Dashboard → SQL):
--   ALTER DATABASE postgres SET app.settings.edge_url        = 'https://<ref>.supabase.co/functions/v1/stripe-webhook';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service-role-key>';
-- They are read at job-execution time below. See Blueprint/external_setup.md.

SELECT cron.schedule(
  'expire-pending-approvals',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.edge_url', true),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := jsonb_build_object('action', 'expire_pending_approvals')
  );
  $$
);
