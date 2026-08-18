# CarApp Business Rules
## Payments

The deposit is 15% at booking. The remaining balance is charged on completion.

PaymentSheet collects the card. The deposit PaymentIntent sets `customer` and
`setup_future_usage: "off_session"` so the remaining balance can be charged
later.

A booking must exist before deposit intent creation. If payment fails or is
abandoned, cancel the unpaid booking. Only the signed Stripe event handler may
transition a paid booking to `pending_provider_approval`.

Provider platform fees are 3%. The first 100 approved Founding Providers pay
0% for 90 days and then convert to 3%. Customers pay 2% at checkout.

## Cancellation and Disputes

The server determines all cancellation fees and refunds.

- Customer cancellation more than 24 hours before service: full refund
- Customer cancellation within 24 hours: retain a $15 late-cancellation fee
- Provider cancellation within 24 hours: full customer refund and record a
  $25 provider penalty
- Customer no-show: customer forfeits the full amount
- Dispute window: 48 hours after service

## Services and Vetting

Services are stored as JSONB snapshots on each booking. Later provider edits
must not alter existing bookings.

Providers must complete all six vetting steps before
`verification_status = approved`.

## Messaging and Moderation

All outbound messages pass through `containsFlaggedContent()` in
`validators.ts`.

Flagged content blocks insertion. `insertMessage()` throws
`FlaggedContentError`; the UI shows an inline warning and preserves the draft.

Flag phone numbers, email addresses, and Venmo handles. Legacy `is_flagged`
styling applies only to previously existing rows.

## Ratings and Kudos

Gear ratings cover Quality, Timeliness, Communication, and Value and produce a
weighted composite score.

Kudos are separate from ratings. Supported badges are Meticulous, Reliable,
Magic Hands, Great Value, Fast Worker, and Communicator.

## Lug AI

Lug AI is accessed through the `lug-ai` Edge Function.

Every Lug AI surface must display a persistent “Talk to a person” action
without requiring scrolling. After two consecutive help requests, make it the
primary action.