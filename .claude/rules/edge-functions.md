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
    pending payment row, returns the customer id and an ephemeral key
  - `capture_balance`: charges the remaining balance, completes the job, and
    transfers the provider payout to their Connect account
  - `refund_deposit`: refunds the deposit on a non-forfeit cancellation
  - `cancel_booking`: customer cancellation
  - `provider_cancel_booking`: provider cancellation
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
    together and returns the booking to `pending`, meaning it exists and
    nothing has been charged. Resolves the caller and refuses anyone who is not
    the booking's customer. Charges nothing itself: it returns
    `next: 'requires_deposit'` and the client runs the existing
    `create_deposit_intent` + PaymentSheet flow. An already-succeeded deposit is
    kept as recorded rather than recomputed at 15% — `capture_balance` computes
    `total_amount - deposit_amount`, so recomputing on a re-quote collects
    `0.15A + 0.85B` instead of `B`. Surcharges are provider revenue, so the
    payout is re-derived from the quoted total less the stored `service_fee`.
    Arithmetic lives in `_shared/quote.ts` (`computeAcceptedAmounts`)
  - `expire_pending_approvals`: pg_cron sweep that auto-cancels and refunds
    approvals still pending past their two-hour deadline
  - `connect_onboarding`: creates or reuses the provider Express account and
    returns a hosted onboarding link
  - `connect_status`: re-checks onboarding after the provider returns and
    drains payouts stranded before the account became payable
- `stripe-events`: signature-authenticated Stripe events
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
- `notify-quote-ready`: the provider priced a request and it moved to
  `pending_customer_approval`; pushes the customer the quoted total. Customer
  only — the provider just sent it
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