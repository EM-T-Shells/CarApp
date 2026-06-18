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

3. Photo minimum is UI-only — Non-Negotiable #3 violated
Root cause: The 4-photo gate lives in job/[bookingId].tsx:197 but capture_balance in the Edge Function has no check. A provider can complete a job with 0 photos via API.
Fix: Add a photo-count query to capture_balance before allowing the capture; return 400 if < 4.

4. Provider accept/decline + 2-hour window removed but still P0
Root cause: Both spec docs require manual approval → pending_provider_approval status → 2-hour auto-cancel-and-refund. The build auto-confirms on deposit. These are not the same model.
Fix: Either (a) restore the model — add pending_provider_approval status, accept/decline UI in job/[bookingId].tsx, a scheduled timeout job, and deposit-refund on decline/timeout — or (b) formally amend both requirement docs before launch. This is a product decision, not just a code gap.

5. Cancellation policy wrong (policy conflict must be resolved)
Root cause: Spec says $15 flat fee retained; code forfeits the entire 15% deposit. No provider cancellation penalty ($25) exists. No no-show flow. Enforcement is client-side only.
Fix: Align policy across docs, then enforce in the stripe-webhook Edge Function (not UI). Add provider-cancel path.

6. Stripe Connect onboarding stubbed — payouts permanently blocked
Root cause: The bank-account/Connect step in vetting shows a placeholder; no account-link is generated via stripe.accountLinks.create(). stripe_account_id on provider_profiles is never set. Payout is blocked until this exists.
Fix: Implement Connect account-link generation + return URL handling; write the stripe_account_id back to the provider profile.

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
Cancellation: see #5 above
