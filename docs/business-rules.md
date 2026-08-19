# CarApp Business Rules

## Authentication and Onboarding

Session storage uses Expo Secure Store through the Supabase client adapter in
`carApp/src/lib/supabase/client.ts`.

Only `carApp/app/_layout.tsx` calls `getSession()` directly. No other screen
may call it.

All OAuth and OTP entry points live in `carApp/src/lib/supabase/auth.ts`.
Screens call that module rather than `supabase.auth.signInWithOAuth` directly.

- Google: `expo-auth-session` with PKCE; the returned code is exchanged through
  `exchangeCodeForSession()`.
- Apple: native `expo-apple-authentication` on iOS, `expo-auth-session` on
  every other platform.
- Email and phone OTP: `signInWithOtp()`. Phone OTP requires Twilio configured
  at the Supabase project level, not in app code.

Onboarding is a stack under `carApp/app/(auth)/onboarding/`. The root gate
enters at `role`:

- Customer: `role` → `profile` → `vehicle` → `review`
- Provider: `role` → `profile` → `review` (no vehicle step)

Draft state lives in `carApp/src/state/signUpDraft.ts` (shared) and
`carApp/src/state/providerDraft.ts` (provider vetting). The `users` row is
inserted only when `review` is submitted, via `submitSignUp()` in
`carApp/src/state/signUpSubmit.ts`, so exactly one insert path exists.

## Roles and Dashboard Routing

`users.role` is `customer`, `provider`, or `both`. All users default to
customer. Provider mode is opt-in and requires full vetting before the first
booking.

`activeMode` (`customer` | `provider`) is persisted client-side in
`carApp/src/state/mode.ts`. It has no column on `users` and is consulted only
for `both` accounts.

The root gate in `carApp/app/_layout.tsx` mounts exactly one tab group:

- `customer` → `(tabs)`
- `provider` and approved → `(provider-tabs)`
- `provider` and not approved → `/(auth)/pending-approval`
- `both` → `(provider-tabs)` only when `activeMode` is `provider` **and**
  `verification_status` is `approved`; otherwise `(tabs)`

`(tabs)` is Search, Services, Bookings, Inbox, More. `(provider-tabs)` is Jobs,
Inbox, Earnings, More.

The dashboard-switch control sets `activeMode` and `router.replace`s into the
other group. The provider More hub shows it only when `role` is `both`; the
customer More hub shows it only to approved provider-capable accounts. Because
a pure `provider` account never mounts `(tabs)`, in practice only `both`
accounts ever see either control.

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
`carApp/src/utils/validators.ts`.

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

## Deep Links

Push payloads carry `metadata.route`. When it is absent the route is derived
from `type` by `resolvePushRoute()` in
`carApp/src/lib/notifications/push.ts`. Route strings are runtime hrefs; Expo
Router group segments such as `(tabs)` are not part of the path.

| Notification `type` | Route |
|---|---|
| `booking_confirmed` | `/bookings/[id]` |
| `booking_requested` | `/bookings/[id]` |
| `booking_declined` | `/bookings/[id]` |
| `rate_now` | `/bookings/[id]` |
| `job_complete` | `/bookings/[id]` |
| `provider_enroute` | `/bookings/tracking/[bookingId]` |
| `kudos_received` | `/more/provider` |
| `new_message` | `/inbox/[threadId]` |

Every mapping except `kudos_received` needs its identifier — `bookingId`, or
`threadId` for `new_message`. Without it, and for any unrecognized `type`,
`resolvePushRoute()` returns `null` and no deep link is followed.

## Provider Location Tracking

The app never writes to `provider_location_cache` directly. The provider client
posts fixes through `carApp/src/lib/location/tracking.ts`, which calls the
`update-provider-location` Edge Function. That function verifies the caller's
JWT, confirms the provider profile belongs to the caller, and performs the
upsert with the service role.

Customers poll `provider_location_cache` every five seconds
(`POLL_INTERVAL_MS = 5_000`) from
`carApp/app/(tabs)/bookings/tracking/[bookingId].tsx`. GPS never uses Realtime.
