# CarApp — UAT Trace Map

Debugging companion to [uat_checklist.md](uat_checklist.md). For each UAT flow, this traces the **code-file chain** a successful run passes through — screen → state → data layer → backend → external — so when a step fails on-device you know which layer to open first. Function names are verified against source, not inferred.

## How to read a trace

Every flow runs down the same spine. No screen calls `supabase.from(...)` directly — all reads are in [queries.ts](../carApp/src/lib/supabase/queries.ts), writes in [mutations.ts](../carApp/src/lib/supabase/mutations.ts), files in [storage.ts](../carApp/src/lib/supabase/storage.ts), payments in [stripe/index.ts](../carApp/src/lib/stripe/index.ts), auth in [auth.ts](../carApp/src/lib/supabase/auth.ts).

```
Screen (app/…)  →  Store (src/state/…)  →  Data layer (fn)  →  Backend (table / Edge Function)  →  External
```

**Symptom → layer decoder:**

| On the phone | Broken layer | Open |
|---|---|---|
| Wrong screen / bad redirect | routing / auth gate | `app/_layout.tsx`, group `_layout.tsx` |
| Form loses data between steps | Zustand store | `src/state/*.ts` |
| Spinner never resolves / empty when data exists | read path | `queries.ts` |
| Tap Save/Book, nothing persists | write path | `mutations.ts` |
| Row exists in dashboard but app shows nothing | RLS policy | `schema.sql` + `get_advisors` |
| Photo won't upload | storage | `storage.ts` |
| Payment fails / no charge | Stripe | `stripe/index.ts` → `functions/stripe-webhook` |
| No push | FCM / trigger | `notifications/push.ts` → `functions/notify-*` |
| Backend silently no-ops | Edge Function | `supabase/functions/<fn>` + `get_logs` |

---

## Section 1 — Auth & Onboarding

**The auth gate ([app/_layout.tsx](../carApp/app/_layout.tsx)) is the decision point for every Section 1 flow.** It subscribes to `onAuthStateChange`, calls `getProviderByUserId` to learn role, and routes: no `users` row → onboarding; provider pending → pending-approval; else → Search. If you land on the wrong screen, the bug is almost always here, not in the screen you expected.

### Flow 1.1 — Email/Phone OTP signup
```
sign-in.tsx → otp-entry.tsx [signInWithOtp]  → otp-verify.tsx [verifyOtp]
  → auth.ts → supabase.auth.signInWithOtp / verifyOtp
  → app/_layout.tsx (onAuthStateChange) → no users row → onboarding/profile
  → profile → role → vehicle → review   [store: signUpDraft.ts]
  → review.tsx [insertUser, insertVehicle] → mutations.ts → users + vehicles tables
  → app/_layout.tsx re-routes → (tabs)/search
```
- Land on splash instead of Profile → routing decision in `_layout.tsx`.
- Data lost between steps → `signUpDraft.ts`.
- Stuck after review → `insertUser`/`insertVehicle` (RLS or insert error).

### Flow 1.2 — Google OAuth
`sign-in.tsx [signInWithGoogle]` → `auth.ts signInWithOAuth('google')` (expo-auth-session PKCE) → `_layout.tsx` gate. Same routing tail as 1.1.

### Flow 1.3 — Apple OAuth
`sign-in.tsx [signInWithApple]` → `auth.ts`: iOS native `AppleAuthentication.signInAsync` + `signInWithIdToken`; Android falls to `signInWithOAuth('apple')`. → `_layout.tsx` gate. Native sheet missing on iOS → check the platform branch in `auth.ts:107`.

### Flow 1.4 / 1.5 — Returning user / cold-start session
No screen logic — pure gate. `app/_layout.tsx` reads `supabase.auth.getSession()` + `getProviderByUserId`, routes straight to Search. Session persistence is the Supabase client in [client.ts](../carApp/src/lib/supabase/client.ts) (Secure Store). Shows sign-in on cold start → session not persisting → `client.ts` storage adapter.

### Flow 1.6 — Sign out
`more/index.tsx [signOut]` → `auth.ts signOut` → `supabase.auth.signOut()` → `onAuthStateChange` fires → `_layout.tsx` routes to `(auth)/`.

---

## Section 2 — Customer Core

### Flow 2.1 — Browse service catalog
`services/index.tsx [getServiceCatalog]` → `queries.ts` → `service_catalog` table (filtered `is_active`, grouped by category). Empty when seeded → check RLS / `is_active` flag.

### Flow 2.2 — Search providers
```
search/index.tsx  [store: search.ts setFilters/fetchResults]
  → search.ts [searchProviders] → queries.ts → provider_profiles (verification_status='approved')
  → search/results.tsx  (reads results/isLoading/error from search.ts store)
```
List empty → either no `approved` providers, or the `provider_types.name` filter in `searchProviders`. Sort not reordering → `sortBy` branch in `searchProviders` (`avg_gear_rating` vs `created_at`).

### Flow 2.3 — Provider profile
`search/provider/[id].tsx [getProviderById]` → `queries.ts` (joins `service_packages`, `users_public`, `provider_types`). Book Now → routes to `search/book/[providerId]`.

### Flow 2.4 — Book (deposit) ⭐ most layered flow
```
search/book/[providerId].tsx  [store: bookingDraft.ts]
  [getProviderById, getVehiclesByUser]                → queries.ts
  → insertBooking                                     → mutations.ts → bookings row
  → createDepositPaymentIntent → stripe/index.ts → functions/stripe-webhook (action:create_deposit_intent) → Stripe
  → confirmDepositPayment (test card 4242…)           → @stripe/stripe-react-native
  → (booking status → confirmed)
  → functions/notify-booking-confirmed                → FCM push
  → (tabs)/bookings/index.tsx [getUpcomingBookingsForCustomer]
```
Decision tree:
- Charge succeeds, no booking row → `insertBooking` (RLS/columns).
- No charge → `functions/stripe-webhook` (`get_logs`) or `STRIPE_SECRET_KEY` secret.
- Booking exists but not in Bookings tab → `getUpcomingBookingsForCustomer` / status not in `ACTIVE_BOOKING_STATUSES`.

### Flow 2.5 — Upcoming bookings
`bookings/index.tsx` — role-aware: `selectIsProvider` → `getUpcomingBookingsForProvider` else `getUpcomingBookingsForCustomer` (+ `getProviderByUserId` to resolve provider id). → `queries.ts`.

### Flow 2.6 — Booking detail
`bookings/[id].tsx [getBookingById, getBookingPhotos, getRatingByBooking, getThreadByBooking]`. Track → `bookings/tracking/[bookingId]`. Message → opens thread via `getThreadByBooking` (creates with `insertMessageThread` if none).

### Flow 2.7 — Past bookings
`bookings/past.tsx` → `getPastBookingsForCustomer` / `getPastBookingsForProvider` (status in `HISTORY_BOOKING_STATUSES`).

### Flow 2.8 — Live tracking
```
bookings/tracking/[bookingId].tsx [getBookingById, getProviderLocation polling 5s]
  → queries.ts → provider_location_cache
  → components/tracking/LiveMap.tsx (OSM UrlTile)
  → ETA/distance: src/lib/location/index.ts (Haversine)
```
Pin never moves → the **provider** side isn't writing (Flow 5.4). The customer screen only reads. No map tiles → `LiveMap.tsx` UrlTile.

### Flow 2.9 — Push notifications
Registration: `notifications/push.ts registerPushNotifications` → `updateUserPushToken` → `users.fcm_token`. Server fan-out: `functions/notify-*`. Tap routing: `push.ts resolvePushRoute`/`handleNotificationTap` → Expo Router. No push → token not saved (`push.ts`) or Edge Function (`get_logs`). Tap opens wrong screen → `resolvePushRoute` map.

### Flow 2.10 — Approve before/after photos
`bookings/[id].tsx [getBookingPhotos]` → `queries.ts` → `booking_photos` (booking-photos bucket, signed URLs via `storage.ts getSignedUrl`).

### Flow 2.11 — Rate (gear + kudos + review)
`bookings/[id].tsx [insertRating / updateRating, insertKudos]` → `mutations.ts` → `ratings` + `kudos` tables. Provider's `avg_gear_rating` updates server-side. Rating not showing on profile → recompute trigger or `getProviderById` join.

---

## Section 3 — Account & Communication

### Flow 3.1 — Manage vehicles
`more/account.tsx [getVehiclesByUser, insertVehicle, updateVehicle, deleteVehicle]` → `mutations.ts`. Star/primary toggle = `updateVehicle({is_primary})`. Change lost on tab switch → re-fetch via `getVehiclesByUser` or RLS on update.

### Flow 3.2 — Account settings & notifications
- Avatar: `more/account.tsx [uploadAvatar]` → `storage.ts` → `avatars` bucket → `updateUser({avatar_url})`.
- Name: `updateUser`.
- Toggles: `more/settings.tsx` → `src/state/settings.ts` (Zustand **persisted via AsyncStorage**). Toggles reset after reopen → `settings.ts` persist config, not a screen bug.

### Flow 3.3 — More hub
`more/index.tsx` — `selectIsProvider` decides the Provider row label ("Become a Provider" vs "Provider Dashboard"). Rows route to account / settings / past / lug / provider. Sign out → `signOut` (see 1.6).

### Flow 3.4 — Inbox list
`inbox/index.tsx [getThreadsForCustomer]` (provider variant: `getThreadsForProvider`) → `queries.ts` → `message_threads` (joins booking + provider profile).

### Flow 3.5 — Thread send/receive
```
inbox/[threadId].tsx [getMessages, insertMessage]
  → mutations.ts insertMessage → containsFlaggedContent() (validators.ts) → messages table
  → Realtime channel thread:{threadId} for live receive
```
"Venmo me" / phone posts as `[Message flagged for review]` → that substitution is in `mutations.ts insertMessage` (line ~308), driven by `validators.ts`. Live receive broken → Realtime subscription cleanup in the screen's `useEffect`.

### Flow 3.6 — Lug AI
```
more/lug.tsx → components/lug/LugThread.tsx
  → supabase.functions.invoke('lug-ai')  → functions/lug-ai → Anthropic API
  "Talk to a person" → insertMessageThread (mutations.ts) → inbox/[threadId]
```
No reply → `lug-ai` is a stub until `ANTHROPIC_API_KEY` is set (`get_logs`). "Talk to a person" missing / not promoting after 2 asks → render logic in `LugThread.tsx`.

---

## Section 4 — Provider Onboarding & Vetting

**Vetting hub** `app/(provider)/vetting.tsx [getProviderByUserId, getProviderVetting]` renders the 6 step statuses. Each step is its own screen under `app/(provider)/`.

### Flow 4.1 — Opt into provider mode
`more/provider.tsx [getProviderTypes, insertProviderProfile, updateUser]` → creates `provider_profiles` row + sets user role → routes to `(provider)/vetting`.

### Flow 4.4 / 4.5 — Insurance / Credentials upload
```
(provider)/insurance.tsx | credentials.tsx → components/provider/VettingUploadStep.tsx
  reads: getProviderByUserId, getProviderVetting
  upload: storage.ts uploadVettingDocument → vetting-documents bucket (private)
  on success: updateProviderVetting({<field>_status: 'submitted'})  → "Under review"
```
Stuck at "pending" after upload → `updateProviderVetting` write (`VettingUploadStep.tsx:77`).

### Flow 4.7 — Profile (bio, photos, hours, coverage)
`(provider)/profile.tsx [getProviderByUserId, getProviderOwnServicePackages, updateProviderProfile, updateProviderVetting]`. Service rows via `components/provider/ServiceMenuEditor.tsx [insertServicePackage]`. Availability via `components/provider/AvailabilityCalendar.tsx [updateProviderProfile]`. Hub still <80% after save → completeness computed from `updateProviderProfile` fields.

### Flow 4.8 — Awaits approval
`(auth)/pending-approval.tsx` — reached by the **gate** when `verification_status='pending'`. "Continue application" → `(provider)/vetting`. Flip to `approved` in Supabase → next cold start, `app/_layout.tsx` routes to Search.

---

## Section 5 — Provider Active Use

### Flow 5.2 — Availability calendar
`more/provider-manage.tsx [getProviderByUserId, updateProviderProfile]` → `components/provider/AvailabilityCalendar.tsx [updateProviderProfile]` → `provider_profiles` availability column. Days don't persist → `updateProviderProfile` write or column shape.

### Flow 5.3 — Service menu
`more/provider-manage.tsx` → `components/provider/ServiceMenuEditor.tsx [getProviderOwnServicePackages, insertServicePackage, updateServicePackage, deleteServicePackage]` → `service_packages`. (Owner query returns unapproved rows too — that's `getProviderOwnServicePackages`, not the public `getServicePackagesByProvider`.)

### Active-job flow (Flow 5.4–5.6, behind the My Jobs tab)
```
bookings/job/[bookingId].tsx [getProviderJobById]
  GPS:     expo-location → location/tracking.ts sendProviderLocation → functions/update-provider-location → provider_location_cache  (feeds customer Flow 2.8)
  photos:  components/provider/JobPhotoCapture.tsx [uploadBookingPhoto, insertBookingPhoto]
  complete: captureBalance (stripe/index.ts) → functions/stripe-webhook (capture_balance) → charges 85%, queues payout → status 'completed'
  status:  updateBooking; thread via insertMessageThread
```

---

## Section 6 — Cross-Cutting

### Flow 6.1 — Dark mode
No data layer. Every screen reads `useColorScheme()` + `colors.dark`/`colors.light` from [tokens.ts](../carApp/src/design/tokens.ts). A screen that doesn't switch → it hardcoded a hex instead of a token (violates CLAUDE.md design rule).

---

## Backend reference (Edge Functions)

| Function | Invoked from | Purpose |
|---|---|---|
| `stripe-webhook` | `stripe/index.ts` (`create_deposit_intent`, `capture_balance`, `refund_deposit`) + Stripe events | All payment movement |
| `update-provider-location` | `location/tracking.ts` | Writes `provider_location_cache` (service role) |
| `lug-ai` | `components/lug/LugThread.tsx` | Anthropic proxy (needs `ANTHROPIC_API_KEY`) |
| `notify-booking-confirmed` | DB trigger | Push on booking insert |
| `notify-provider-enroute` | status → en_route | Push to customer |
| `notify-job-complete` | status → completed | Push to customer |
| `notify-payout-processed` | payout → paid | Push to provider |
| `notify-kudos-received` | kudos insert | Push to provider |
| `checkr-webhook` / `persona-webhook` | external events | Background check / identity status |

When a backend step silently does nothing, `mcp__supabase__get_logs` for the function + `get_advisors` for RLS are the two fastest checks.
