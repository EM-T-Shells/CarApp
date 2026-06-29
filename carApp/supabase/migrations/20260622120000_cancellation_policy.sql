-- Blocker #5: cancellation policy enforcement.
--
-- Policy (PRD v5 — authoritative; Workflow doc aligned):
--   • Customer cancels  > 24h before appointment → full deposit refund.
--   • Customer cancels <= 24h before appointment → $15 flat fee retained,
--     remainder of the deposit refunded.
--   • Provider cancels a confirmed booking <= 24h before appointment →
--     full deposit refund to customer + $25 penalty recorded on the booking
--     (ops deducts it from a future payout) + re-booking assistance.
--   • Customer no-show → provider marks No Show; customer forfeits the full
--     booking amount (deposit kept, no refund); no provider penalty.
--
-- All amounts are enforced server-side in the stripe-webhook Edge Function
-- (actions: cancel_booking, provider_cancel_booking, mark_no_show), never in
-- the UI. The columns below record the outcome for the payments history and
-- for ops payout reconciliation.
--
-- Apply with: supabase db push   (or run in the SQL editor on the project).

-- ── Columns ────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  -- Flat fee (USD) retained from the customer's deposit on a late cancel, or
  -- the penalty owed by a provider who cancelled late. NULL when no fee applies.
  ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2),
  -- Who triggered the cancellation: 'customer' | 'provider' | 'system'
  -- ('system' = the 2-hour auto-cancel sweep). NULL until cancelled.
  ADD COLUMN IF NOT EXISTS cancelled_by     TEXT
    CHECK (cancelled_by IN ('customer', 'provider', 'system')),
  -- Set when the provider marks a confirmed/active job as a no-show.
  ADD COLUMN IF NOT EXISTS no_show_at       TIMESTAMPTZ;

-- ── Status CHECK ───────────────────────────────────────────────────────
-- Admit the new terminal 'no_show' status alongside the existing set.
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
    'cancelled',
    'no_show'
  ));
