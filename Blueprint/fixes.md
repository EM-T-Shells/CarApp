# Customer

## Search

### Search Results
    [x] Filters — added "Nearest" (distance) sort option alongside Top Rated / Newest (geocode mock)
    [x] Default sort is now distance from the searched address (nearest first)
    
## Booking & Payment
    [x] Deposit checkout — card is now collected in Stripe's PaymentSheet. Previously `confirmPayment` ran with no CardField mounted anywhere in the app, so every deposit failed with "Card details not complete".
    [x] A failed or dismissed payment no longer leaves the booking behind — the row is cancelled, so unpaid bookings stop showing as scheduled in the Bookings tab.
    [x] Stripe webhooks moved to `stripe-events` (verify_jwt off, signature-authenticated). `stripe-webhook` was JWT-gated, so Stripe deliveries were 401'd and no real payment ever reached `succeeded`.
    [ ] Restrict the sheet to cards — Klarna/Cash App/Amazon Pay/ACH can't be charged off-session for the 85% balance.

## Stories
### User Books a Detailing Job
- 