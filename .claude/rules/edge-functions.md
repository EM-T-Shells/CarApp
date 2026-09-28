---
paths:
  - carApp/supabase/functions/**
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
  - `create_deposit_intent`: creates the deposit PaymentIntent, records a
    pending payment row, returns the customer id and an ephemeral key. Since
    Phase 3 this is the fallback for a quote approval with no usable saved
    card; the normal quote-first deposit is charged by `accept_quote`
  - `create_setup_intent`: the customer saves a card for an unpriced request
    (SetupIntent, `usage: off_session`, cards only — no hold, no charge) and
    records it on `bookings.stripe_setup_intent_id`. Customer only
  - `confirm_setup_intent`: asks Stripe whether that SetupIntent succeeded —
    the client's sheet closing is not proof — and only then fires
    `notify-quote-requested`. Customer only
  - `capture_balance`: charges the remaining balance, completes the job, and
    transfers the provider payout to their Connect account
  - `refund_deposit`: refunds the deposit on a non-forfeit cancellation
  - `cancel_booking`: customer cancellation. Resolves the caller and refuses
    anyone but the booking's customer. Accepts the unpriced quote states and
    `pending_adjustment_approval` too; the $15 late fee applies only to
    committed bookings (`_shared/bookingPolicy.ts` — `cancellationFeeApplies`)
  - `provider_cancel_booking`: provider cancellation, including declining an
    unpriced request. Provider only; the $25 penalty follows the same rule, and
    `refund_cents: 0` tells the customer nothing was charged
  - `mark_no_show`: provider marks a no-show; the booking moves to `no_show`
  - `accept_booking`: provider accepts inside the two-hour window;
    `pending_provider_approval` becomes `confirmed`
  - `decline_booking`: provider declines; the booking is cancelled and the
    deposit refunded
  - `submit_quote`: the assigned provider prices an unpriced request — sets the
    start inside the customer's arrival window, commits
    `estimated_duration_mins`, records `quote_line_items` and the derived
    `quoted_total_amount`, and moves the booking to
    `pending_customer_approval`. Charges nothing. It resolves the caller from
    the bearer token and refuses anyone who does not own the booking's provider
    profile; `verify_jwt` alone proves only that *some* authenticated user
    called. The quote grammar and totals live in `_shared/quote.ts`, which
    carries no remote imports so Jest can test the shipping code directly.
    `total_amount` and `deposit_amount` are never written here — a quote is a
    proposal, and `capture_balance` computes `total_amount - deposit_amount`,
    so both belong to `accept_quote` together
  - `accept_quote`: the customer approves the quoted price — writes
    `total_amount`, `deposit_amount`, `platform_fee` and `provider_payout`
    together and returns the booking to `pending`. Resolves the caller and
    refuses anyone who is not the booking's customer. Then collects the deposit
    (`planDepositCollection`): with a card saved by `create_setup_intent` it
    creates the PaymentIntent, records the pending payment row, THEN confirms
    it off-session (in that order, so `stripe-events` always finds the row) and
    returns `next: 'deposit_processing'`; with no saved card, or a refused
    off-session charge, it returns `next: 'requires_deposit'` (plus
    `charge_error`) and the client falls back to `create_deposit_intent` +
    PaymentSheet; with a deposit already succeeded it confirms outright
    (`next: 'none'`). An already-succeeded deposit is kept as recorded rather
    than recomputed at 15% — `capture_balance` computes
    `total_amount - deposit_amount`, so recomputing on a re-quote collects
    `0.15A + 0.85B` instead of `B`. Surcharges are provider revenue, so the
    payout is re-derived from the quoted total less the stored `service_fee`.
    Arithmetic lives in `_shared/quote.ts` (`computeAcceptedAmounts`)
  - `request_more_photos`: the provider sends an unpriced request back with a
    required note (`info_request_note`); `pending_provider_quote` →
    `awaiting_customer_info`. Provider only. Fires `notify-photos-requested`
  - `provide_customer_info`: the customer hands it back;
    `awaiting_customer_info` → `pending_provider_quote`. Customer only. Fires
    `notify-quote-requested` with `resubmitted: true`
  - `adjust_job_duration`: the provider proposes a new duration and/or extra
    itemised charges on a `confirmed` booking, with a required reason. Writes
    only the `adjustment_*` columns and moves it to
    `pending_adjustment_approval` (still inside the overlap guard, so the slot
    stays held). Refuses a no-op and a total below the deposit already charged
    (`prepareAdjustment`). Provider only. Fires `notify-adjustment-proposed`
  - `withdraw_adjustment`: the provider takes it back; returns to `confirmed`
    with the adjustment cleared. Provider only
  - `respond_adjustment`: the customer answers. Approve: the same arithmetic
    as `accept_quote` (deposit kept as charged), the new charges appended to
    `quote_line_items`, `quoted_total_amount` and `estimated_duration_mins`
    updated, back to `confirmed`; `23P01` (the longer job overlaps the next
    one) is a 409. Decline: the booking is cancelled with a full deposit
    refund and no fee. Guarded on the exact proposal read, so a replaced one
    is not approved blind. Customer only
  - `propose_reschedule`: either party proposes a new start for a `confirmed`
    booking (`proposed_scheduled_at`, `reschedule_proposed_by`); a new
    proposal replaces an open one. Nothing moves yet. Fires
    `notify-reschedule-proposed`
  - `respond_reschedule`: the other party accepts (the start moves; `23P01` is
    a 409) or declines; the proposer may only withdraw. Guarded on the exact
    proposal read. Fires `notify-reschedule-resolved` to the proposer
  - `expire_pending_approvals`: pg_cron sweep that auto-cancels and refunds
    approvals still pending past their two-hour deadline
  - `connect_onboarding`: creates or reuses the provider Express account and
    returns a hosted onboarding link
  - `connect_status`: re-checks onboarding after the provider returns and
    drains payouts stranded before the account became payable
- `stripe-events`: signature-authenticated Stripe events. On deposit success
  it confirms a quote-first booking outright (or falls back to the approval
  window on `23P01`) and promotes a deposit-first one to
  `pending_provider_approval`; a deposit that lands on a booking already
  cancelled (the customer cancelled while the charge was processing) is
  refunded in full
- `admin-review-provider`: authenticated provider approval/rejection; sets
  `provider_profiles.verification_status` (plus `approved_at` on approval) and
  sends the decision email through Resend
- `update-provider-location`: verifies ownership before location updates
- `checkr-webhook`: background-check updates
- `persona-webhook`: identity-verification updates
- `lug-ai`: Anthropic API proxy

One notification function per event:

- `notify-booking-requested`: deposit paid, booking enters
  `pending_provider_approval`; pushes the provider the two-hour approval
  request and confirms "request sent" to the customer
- `notify-quote-requested`: a request is waiting for the provider's quote —
  a new one whose card Stripe confirmed, or one the customer handed back.
  Provider only
- `notify-quote-ready`: the provider priced a request and it moved to
  `pending_customer_approval`; pushes the customer the quoted total. Customer
  only — the provider just sent it
- `notify-photos-requested`: the provider sent the request back; pushes the
  customer the note. Customer only
- `notify-adjustment-proposed`: the provider proposed a change to a confirmed
  job; pushes the customer the new total. Customer only
- `notify-adjustment-approved`: the customer approved it; pushes the provider.
  A decline is reported by `notify-booking-cancelled`
- `notify-reschedule-proposed`: pushes whoever did not propose the new time
- `notify-reschedule-resolved`: tells the proposer whether it was accepted
- `notify-booking-confirmed`: booking becomes `confirmed`; pushes customer and
  provider
- `notify-booking-declined`: booking declined or expired; pushes the customer
  the refund notice
- `notify-booking-cancelled`: booking cancelled or no-show; pushes the affected
  party for each cancel path
- `notify-provider-enroute`: booking becomes `en_route`; pushes the customer
- `notify-job-complete`: booking becomes `completed`; pushes the customer
- `notify-payout-processed`: payout becomes `paid`; pushes the provider
- `notify-kudos-received`: kudos insert; pushes the provider

Do not add unrelated actions to an existing function merely to avoid creating
a correctly scoped function.