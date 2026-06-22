P0 Launch Blockers — Stabl MVP
9 items. App cannot go live until all of these are resolved.

1. Push notifications never deliver
Root cause: push.ts is imported by nothing. Device tokens are never registered. All 10 required lifecycle notifications are silently dropped.
Fix: Call registerForPushNotifications() + updateUserPushToken() at the end of onboarding and on session resume.

2. No real money moves to providers — ✅ RESOLVED
Root cause: captureBalance in stripe-webhook/index.ts inserts a payouts row and calls stripe.paymentIntents.capture() but never calls stripe.transfers.create() or uses destination charges. Provider gets a DB record, not money.
Fix (done): capture_balance now calls stripe.transfers.create() (via a shared transferPayout helper) to send the post-fee provider_payout to the provider's Connect account, marking the payout row paid with stripe_transfer_id. Connect onboarding is wired up via two new Edge Function actions — connect_onboarding (creates/reuses an Express account + hosted account link, persisting stripe_account_id) and connect_status (flips bank_status to approved once payouts are enabled, and drains payouts stranded before onboarding finished). Client: src/lib/stripe/connect.ts + app/(provider)/bank.tsx return-link handling.
External setup required before live use: Stripe Connect (Express) must be enabled on the platform account; the carapp://provider/bank return/refresh deep links must be registered.
Follow-on (not P0): retry for transfers that FAIL after onboarding (decline / insufficient platform balance) — currently left pending and logged; needs an ops-triggered or scheduled retry.

3. Photo minimum is UI-only — Non-Negotiable #3 violated — ✅ RESOLVED
Root cause: The 4-photo gate lived in job/[bookingId].tsx:197 but capture_balance in the Edge Function had no check. A provider could complete a job with 0 photos via API.
Fix (done): capture_balance now counts booking_photos rows for the booking and returns 400 (`{ error, photo_count, required }`) when below MIN_PHOTOS_TO_COMPLETE (4) — same constant as the client. The check runs after the idempotency short-circuit so an already-captured booking is never re-blocked, and before any balance charge or completion. (carApp/supabase/functions/stripe-webhook/index.ts)
Deploy note: the Edge Function must be redeployed (supabase functions deploy stripe-webhook) for the server-side gate to take effect.

4. Provider accept/decline + 2-hour window removed but still P0 — ✅ RESOLVED
Root cause: Both spec docs require manual approval → pending_provider_approval status → 2-hour auto-cancel-and-refund. The build auto-confirmed on deposit. These are not the same model.
Fix (done — option a, restore the model): deposit success now transitions pending → pending_provider_approval (not confirmed) and stamps approval_expires_at = now + 2h (onPaymentIntentSucceeded in stripe-webhook/index.ts). Three new Edge Function actions: accept_booking (→ confirmed), decline_booking (→ cancelled + full deposit refund, records declined_reason), and expire_pending_approvals (pg_cron sweep that auto-cancels + refunds any approval past its deadline). Client: acceptBooking/declineBooking in src/lib/stripe/index.ts; Accept/Decline buttons + live 2-hour countdown in the provider job screen (app/(tabs)/bookings/job/[bookingId].tsx). StatusTimeline + ACTIVE_BOOKING_STATUSES + bookings.status CHECK extended with the restored status. New notify functions: notify-booking-requested (deposit → provider gets the 2h-window alert, customer gets "request sent") and notify-booking-declined (customer refund notice on decline/timeout). DB: migration 20260618195809_booking_provider_approval_model.sql (columns approval_expires_at / confirmed_at / declined_reason, partial expiry index, pg_cron job reading the edge URL + service-role key from Supabase Vault).
Deployed to project apbubklogxgqkokbctwz: schema applied; pg_cron/pg_net enabled; Vault secrets (edge_url, service_role_key) seeded; 'expire-pending-approvals' cron job scheduled (every minute) and verified returning HTTP 200 {ok:true}; stripe-webhook redeployed and notify-booking-requested / notify-booking-declined deployed (see Blueprint/external_setup.md).
Follow-on (not P0): decline/expire refund FAILURES leave the booking cancelled with the refund pending+logged (same ops-retry gap as the #2 transfer-failure follow-on).

5. Cancellation policy wrong (policy conflict must be resolved) — ✅ RESOLVED
Root cause: Spec says $15 flat fee retained; code forfeits the entire 15% deposit. No provider cancellation penalty ($25) exists. No no-show flow. Enforcement is client-side only.
Fix (done): Policy resolved in favour of PRD v5 and aligned across docs — customer cancels <=24h → $15 flat fee retained, remainder of the deposit refunded (>24h → full refund); provider cancels <=24h → full customer refund + $25 penalty recorded on the booking for ops to deduct from a future payout; customer no-show → provider marks No Show, customer forfeits the full amount (deposit kept, no refund). All enforced server-side in stripe-webhook (three new actions: cancel_booking, provider_cancel_booking, mark_no_show); the client never decides the refund amount. issueDepositRefund now supports a partial refund (deposit − $15). New money helpers (CUSTOMER_LATE_CANCEL_FEE_CENTS=1500, PROVIDER_CANCEL_PENALTY_CENTS=2500, calculateLateCancelFee/Refund). DB: migration 20260622120000_cancellation_policy.sql (columns cancellation_fee / cancelled_by / no_show_at, plus 'no_show' added to the bookings.status CHECK; schema.sql + supabase.ts types updated). Client: customer cancel rewired to the server action with $15-fee copy (app/(tabs)/bookings/[id].tsx); provider Cancel Job + No-Show buttons added to the provider job screen (app/(tabs)/bookings/job/[bookingId].tsx); StatusTimeline / JobStatusBar / past-bookings list + HISTORY_BOOKING_STATUSES handle the new no_show status. New notify-booking-cancelled Edge Function messages the right party for each path. Tests: money.test.ts, stripe-webhook/__tests__/cancellation-policy.test.ts, stripe lib + StatusTimeline + queries tests extended; e2e/cancellation-flow.yaml added.
Deploy note: redeploy stripe-webhook and deploy notify-booking-cancelled (supabase functions deploy …); apply migration 20260622120000_cancellation_policy.sql.
Follow-on (not P0): the $25 provider penalty is recorded on the booking but not yet auto-debited from a payout — needs an ops/payout-reconciliation step. Same ops-retry gap as #2/#4 applies if a cancel/no-show refund FAILS at Stripe (booking is transitioned, refund left pending+logged).

6. Stripe Connect onboarding stubbed — payouts permanently blocked — ✅ RESOLVED
Root cause: The bank-account/Connect step in vetting shows a placeholder; no account-link is generated via stripe.accountLinks.create(). stripe_account_id on provider_profiles is never set. Payout is blocked until this exists.
Fix (done): Implemented as part of #2 (payouts need a Connect account to transfer to). Two Edge Function actions in stripe-webhook/index.ts: connect_onboarding creates/reuses an Express account (stripe.accounts.create, transfers capability) — persisting stripe_account_id to provider_profiles — and returns a hosted account-link (stripe.accountLinks.create) with carapp://provider/bank return/refresh URLs; connect_status re-checks the account on return, flips bank_status to approved once charges_enabled && payouts_enabled, and drains payouts stranded pending before onboarding finished. Client: the vetting Bank step is now the real screen (app/(provider)/bank.tsx via VETTING_STEPS) — it opens Stripe's hosted onboarding in an in-app auth session and re-checks status on the carapp://provider/bank return link; src/lib/stripe/connect.ts wraps both actions. The old placeholder is gone. Tests: src/lib/stripe/__tests__/connect.test.ts (client lib) and app/(provider)/__tests__/bank.test.tsx (bank-step onAction orchestration: approve / still-reviewing / dismissed / not-configured / status-check-failure). E2E: bank step can't be driven by Maestro (Stripe hosted browser); provider-onboarding.yaml note updated to point at the unit coverage.
External setup required before live use: Stripe Connect (Express) must be enabled on the platform account; the carapp://provider/bank return/refresh deep links must be registered (same setup as #2 — see Blueprint/external_setup.md).
Deploy note: redeploy stripe-webhook (supabase functions deploy stripe-webhook) for the Connect actions to be live (already covered by #2's redeploy).

7. Contact-info detection sanitizes instead of blocks
Root cause: containsFlaggedContent() is robust, but insertMessage() replaces the body with [Message flagged for review] and stores it — it does not block the send or warn the user. Spec §7 and Non-Negotiable #4 require blocking + user warning from Sprint 6.
Fix: Return an error from insertMessage() when flagged; surface the warning inline to the sender; do not store the sanitized message.

8. Founding Provider Program is marketing copy only
Root cause: is_founding_provider column exists but nothing sets it. No count check (first 100), no 3-month expiry, no auto-convert to 3% at period end. The 0% fee is never actually applied to any real provider.
Fix: Add provisioning logic: count check on vetting approval, expiry timestamp, and a scheduled job (or Edge Function invocation) that flips platform_fee_rate back to 0.03 after 90 days.

9. Admin panel does not exist — vetting and disputes are blocked
Root cause: more/admin.tsx is a 1-line empty file. There is no mechanism for ops to approve providers, resolve disputes, or issue refunds. Every provider is permanently stuck at pending until admin tooling exists.
Fix: Build the provider vetting queue as a desktop web app (spec: 1280px, Retool or custom). Minimum viable: approve/reject with reason, triggers approval email within 60s. Dispute tools are also P0 per spec §11.

Two fee-rate conflicts to resolve before any of the above payment work lands:

Provider fee: spec §5/§10 = 3% · current code = 5% → pick one, update money.ts + CLAUDE.md
Cancellation: ✅ resolved — see #5 above ($15 customer late-cancel fee / $25 provider penalty, per PRD v5)
