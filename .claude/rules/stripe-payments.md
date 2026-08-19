---
paths:
  - carApp/src/lib/stripe/**
  - carApp/supabase/functions/stripe-*/**
  - carApp/app/**/bookings/**
  - carApp/app/**/book/**
  - carApp/app/**/jobs/**
  - carApp/app/**/bank.tsx
---

# Stripe and Booking Payments

Read the payment and cancellation sections of `docs/business-rules.md` before
changing booking or payment behavior.

- Use Stripe PaymentSheet through `presentDepositPaymentSheet()`.
- Do not add custom card fields or forms. Never add a Stripe `CardField` or
  `CardForm`.
- Prices are integer cents and must be formatted through
  `carApp/src/utils/money.ts`.
- The booking row is created before collecting the deposit because
  `create_deposit_intent` requires a `booking_id`.
- Cancel the unpaid booking when intent creation fails, the card is declined,
  or PaymentSheet is dismissed.
- Only `stripe-events` may move a booking from `pending` to
  `pending_provider_approval`.
- The client must never infer or assert successful payment.
- Cancellation and refund amounts are calculated server-side.
- Return `StripeResult<T>` from Stripe helpers.

`stripe-webhook` handles authenticated app payment actions and must retain
`verify_jwt: true`.

`stripe-events` receives Stripe webhook deliveries and uses
`verify_jwt: false`. It must authenticate requests by verifying
`Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`.

Never disable JWT verification on `stripe-webhook`.
