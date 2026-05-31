# CarApp — End-User Flows

This document is the **single source of truth for "what the user is supposed to be able to do, and what we still need to build for each of those flows."** It is organized around end-user journeys (not technical phases) so that:

1. Each flow can be developed and shipped as a coherent vertical slice.
2. Each flow can be tested on a real phone in isolation (UAT).
3. We can clearly see what is blocking each end-to-end experience.

Flows are grouped into six sections matching the natural user lifecycle. Within each flow we list **Screens**, **Components**, **Data Layer**, **Backend / Edge Functions**, and **External Integrations** required, each marked with its current status.

## Status Legend

| Symbol | Meaning |
|---|---|
| ✅ | Built and working |
| 🟡 | Stub exists or partially built |
| ⛔ | Not built |
| 🔒 | External / config dependency (not code) |

---

# ✅ Section 1 — Auth & Onboarding ✅

## Flow 1.1 — First-time user signs up (Email or Phone OTP) ✅

**Goal:** A brand new user opens the app, enters email or phone, verifies OTP, fills out profile + vehicle, and lands on the main navigation (Search tab).

**User journey:**
1. App launches → splash → "Get Started" CTA
2. Sign-in screen → "Continue with Email or Phone"
3. OTP entry screen → user chooses email or phone tab → enters address → "Send code"
4. OTP verify screen → user enters 6-digit code → verify
5. **Onboarding step 1** — Profile (full name)
6. **Onboarding step 2** — Role selector (Customer / Provider / Both) — defaults to Customer
7. **Onboarding step 3** — Add primary vehicle (year, make, model, optional trim/color/plate)
8. **Onboarding step 4** — Review & confirm
9. App writes `users` row + `vehicles` row → routes user to `(tabs)/search`

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(auth)/index.tsx` (splash) | ✅ |
| Screen | `app/(auth)/sign-in.tsx` | ✅ |
| Screen | `app/(auth)/otp-entry.tsx` | ✅ |
| Screen | `app/(auth)/otp-verify.tsx` | ✅ |
| Screen | `app/(auth)/onboarding/profile.tsx` | ✅ |
| Screen | `app/(auth)/onboarding/role.tsx` | ✅ |
| Screen | `app/(auth)/onboarding/vehicle.tsx` | ✅ |
| Screen | `app/(auth)/onboarding/review.tsx` | ✅ |
| Component | `StepIndicator` | ✅ |
| Component | `RoleSelector` | ✅ |
| Component | `VehicleForm` | ✅ |
| State | `signUpDraft` Zustand store | ✅ |
| Data | `signInWithOtp`, `verifyOtp` | ✅ |
| Data | `insertUser`, `insertVehicle` mutations | ✅ |
| Gate | `app/_layout.tsx` routes session-without-users-row to `/(auth)/onboarding/profile` | ✅ |
| External | Twilio (phone OTP configured in Supabase dashboard) | ✅ |

**UAT on phone:**
1. Use a fresh email (no `users` row exists yet)
2. Send OTP, verify
3. Confirm you land on Profile step (not back on splash)
4. Complete all 4 steps
5. Confirm you land on Search tab
6. Re-open app — confirm you go directly to Search (session persisted)

---

## Flow 1.2 — First-time user signs up (Google OAuth) ✅

**Goal:** New user taps "Continue with Google", completes Google's web auth, and proceeds through the same onboarding as Flow 1.1.

**User journey:**
1. Sign-in screen → "Continue with Google"
2. iOS `ASWebAuthenticationSession` / Android Custom Tab opens
3. User picks Google account, grants consent
4. Browser redirects back to app via deep link
5. Supabase session created → auth gate detects no `users` row → routes to onboarding flow (same as 1.1 from step 5)

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `signInWithGoogle` in `auth.ts` | ✅ |
| External | Google OAuth client configured in Supabase | ✅ |
| External | Deep link scheme `carapp://` in `app.json` | ✅ |
| Onboarding screens (same as Flow 1.1) | | ✅ |

**UAT on phone:** Same as Flow 1.1 but starting from the Google button.

---

## Flow 1.3 — First-time user signs up (Apple OAuth) ✅

**Goal:** Same as 1.2 but with Apple.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `signInWithApple` in `auth.ts` (native `AppleAuthentication.signInAsync` on iOS, web OAuth fallback on Android) | ✅ |
| External | Apple Services ID + .p8 key configured in Supabase | ✅ |
| External | App ID, Services ID, Key, and Sign In with Apple entitlement registered in Apple Developer | ✅ |
| Onboarding screens (same as Flow 1.1) | | ✅ |

**UAT on phone:** Verified on iPad (iPadOS 26.2) via `expo run:ios --device` — native Apple sheet appears, authentication completes, new user routed into onboarding.

---

## Flow 1.4 — Returning user signs in ✅

**Goal:** A user with an existing `users` row signs in and lands on Search tab.

**User journey:**
1. Splash → Sign in
2. Pick a method (Google / Apple / OTP)
3. Auth completes → auth gate sees `users` row exists → routes to `(tabs)/search`

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Auth gate | `useProtectedRoute` in `_layout.tsx` | ✅ |
| `fetchUserRow` hydration | ✅ |

**UAT on phone:** Sign in with an account that already exists in `users` table → confirm direct route to Search.

---

## Flow 1.5 — Persistent session on cold start ✅

**Goal:** A signed-in user closes and re-opens the app and lands directly on Search.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Storage | `expo-secure-store` adapter for Supabase auth | ✅ |
| Hydration | `supabase.auth.getSession()` on mount | ✅ |

**UAT on phone:** Sign in, force-quit, re-open. Should land on Search without showing sign-in.

---

## Flow 1.6 — Sign out ✅

**Goal:** Signed-in user signs out and returns to splash.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `signOut` in `auth.ts` | ✅ |
| UI | Sign-out button on More tab (with native confirmation alert); also exists on `pending-approval.tsx` | ✅ |
| Gate | Auth gate detects no session → routes to `(auth)/` | ✅ |

**UAT on phone:** From the More tab, tap Sign out → confirm in the native alert → verify return to splash. Will move into More → Account when that screen is built in Phase 15.

---

# Section 2 — Customer Core (Discover, Book, Track, Rate)

## Flow 2.1 — Browse the service catalog

**Goal:** Customer opens the Services tab and browses the CarApp service catalog grouped by category.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/services/index.tsx` | ✅ |
| Data | `getServiceCatalog()` | ✅ |
| Seed | `service_catalog` rows in DB | ✅ |

**UAT on phone:** Open Services tab. Verify catalog renders grouped by category. Check loading/empty/error states by toggling network.

---

## Flow 2.2 — Search for providers

**Goal:** Customer enters a location, optionally filters by sort/rating/provider type, and sees a list of matching providers.

**User journey:**
1. Search tab → enter location in `LocationSearchBar`
2. Optionally tap a category tile (Detailing / Mechanical)
3. Results screen renders list of `ProviderCard`s
4. Tap filter icon → `FiltersSheet` opens → adjust sort/min rating → Apply
5. Tap a provider card → navigate to provider profile

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `search/index.tsx` | ✅ |
| Screen | `search/results.tsx` | ✅ |
| Component | `LocationSearchBar` | ✅ |
| Component | `FiltersSheet` | ✅ |
| Component | `ProviderCard` | ✅ |
| State | `search` Zustand store | ✅ |
| Data | `searchProviders()` | ✅ |
| Seed | `provider_profiles` rows | ✅ seeded via `carApp/supabase/seeds/providers.sql` |
| Enhancement | Real geocoding for location radius filter | ⛔ post-MVP, currently text-only |

**UAT on phone:** Enter "Reston, VA", tap Search → confirm provider list renders. Open filters, change sort to rating, apply, verify reorder. Empty/error states.

---

## Flow 2.3 — View a provider profile

**Goal:** Customer taps a provider card and sees full profile with bio, gear rating, stats, service packages, and a Book Now CTA.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `search/provider/[id].tsx` | ✅ |
| Data | `getProviderById()` | ✅ |
| Data | `getServicePackagesByProvider()` | ✅ |
| Data | `getRatingsForProviderUser()` | ✅ |
| Data | `getKudosForProviderUser()` | ✅ |
| Seed | Provider must have at least one `service_package` | ✅ seeded via `carApp/supabase/seeds/provider_content.sql` (also seeds ratings + kudos) |

**UAT on phone:** Tap any provider card. Verify avatar, rating, stats, package list, sticky Book Now button. Tap Book Now → routes to booking flow.

---

## Flow 2.4 — Book a service (Deposit Flow)

**Goal:** Customer goes from a provider profile through a 3-step booking flow, pays the 15% deposit via Stripe, and sees the booking appear in their Bookings tab.

**User journey:**
1. Provider profile → Book Now
2. **Step 1: Services** — multi-select packages from this provider's menu
3. **Step 2: Details** — pick vehicle from customer's vehicles, address (`AddressPicker`), date/time (`DateTimePicker`)
4. **Step 3: Review** — `PriceBreakdown` + `DepositSummary` → "Pay deposit" CTA
5. Stripe Payment Sheet opens → user confirms with card
6. On success: `bookings` row updated to `confirmed`, customer is routed to booking detail or bookings list

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `search/book/[providerId].tsx` (multi-step) | ✅ |
| Component | `AddressPicker` | ✅ |
| Component | `DateTimePicker` | ✅ |
| Component | `PriceBreakdown` | ✅ |
| Component | `DepositSummary` | ✅ |
| State | `bookingDraft` Zustand store | ✅ |
| Data | `getVehiclesByUser()`, `insertBooking()`, `updateBooking()` | ✅ |
| Lib | `createDepositPaymentIntent`, `confirmDepositPayment` | ✅ |
| Edge Function | `stripe-webhook` (creates intent + handles success/failure) | ✅ deployed |
| External | Stripe test keys in `.env.local` | 🔒 |
| External | `@stripe/stripe-react-native` `StripeProvider` wraps root | ✅ |
| Post-success | Route to booking detail screen | 🟡 booking detail screen is an empty stub |

**UAT on phone (with Stripe test mode):**
1. Pick a provider → Book Now
2. Select a package, fill in details with test card `4242 4242 4242 4242`
3. Confirm deposit charges in Stripe dashboard
4. Confirm booking row appears in Supabase with status `confirmed`
5. Navigate to Bookings tab — booking should appear in upcoming list

---

## Flow 2.5 — View upcoming bookings

**Goal:** Customer opens Bookings tab and sees their upcoming bookings (pending / confirmed / en_route / in_progress) with status pills.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/bookings/index.tsx` | ✅ |
| Data | `getUpcomingBookingsForCustomer()` | ✅ |
| UI | Customer/Provider toggle for dual-role users | ✅ |
| UI | Pull-to-refresh, loading/empty/error states | ✅ |

**UAT on phone:** Make a booking. Open Bookings tab. Verify card renders with provider name, date, vehicle, status pill, total. Pull to refresh.

---

## Flow 2.6 — View a booking's details

**Goal:** Tap a booking from the list, see full details: provider, services, schedule, address, vehicle, total, status timeline, action buttons (Message, Track, Cancel, Reschedule).

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/bookings/[id].tsx` | ⛔ empty file |
| Data | `getBookingById()` | ✅ |
| Data | `getBookingPhotos()` | ✅ |
| Component | Status timeline (pending → confirmed → en_route → in_progress → completed) | ⛔ |
| Component | Action buttons (Cancel, Reschedule, Message) | ⛔ |
| Logic | Cancel-within-24h forfeits 15% deposit (per CLAUDE.md) | ⛔ |

**🔴 BLOCKING ISSUE:** Tapping a booking from the list goes to a blank screen.

**UAT on phone:** From bookings list, tap a card → see full detail. Tap Track → opens live map. Tap Message → opens thread.

---

## Flow 2.7 — View past bookings

**Goal:** Customer taps "Past" link from the Bookings header and sees completed/cancelled history.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/bookings/past.tsx` | ⛔ empty file |
| Data | `getPastBookingsForCustomer()` | ✅ |
| UI | List with re-book CTA per provider | ⛔ |

**UAT on phone:** Tap "Past" link from header → list of past bookings.

---

## Flow 2.8 — Track provider live during active booking

**Goal:** Customer opens an active booking and sees the provider's live GPS position on a map with ETA, status pill, and in-app chat shortcut.

**User journey:**
1. From booking detail → "Track Provider"
2. Live map screen opens
3. Customer sees provider's pulsing pin moving toward service address
4. Top bar shows current status (En Route / Arrived / In Progress)
5. ETA updates every few seconds

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/bookings/tracking/[bookingId].tsx` | ⛔ empty |
| Component | `LiveMap` (Google Maps + provider pin) | ⛔ empty file |
| Component | `JobStatusBar` | ⛔ empty file |
| Component | `ETADisplay` | ⛔ empty file |
| Lib | `src/lib/location/index.ts` (geocoding, distance, ETA) | ⛔ empty file |
| Lib | `src/lib/redis/index.ts` (GPS cache reads) | ⛔ empty file |
| Data | `getProviderLocation()` (Postgres fallback) | ✅ |
| External | Google Maps API key | 🔒 in `.env.local` |
| External | `react-native-maps` install + config | ⛔ verify package |
| External | Redis URL set in Supabase secrets | 🔒 |

**UAT on phone:** With an active booking, tap Track → map renders → provider pin updates. (Requires the provider side to be sending GPS — Flow 5.4.)

---

## Flow 2.9 — Receive arrival / status push notifications

**Goal:** Customer receives push notifications for booking_confirmed, en_route, arrived, complete, rate_now.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `src/lib/notifications/push.ts` (FCM token registration) | ⛔ empty file |
| Edge Function | `notify-booking-confirmed` | ⛔ |
| Edge Function | `notify-provider-enroute` | ⛔ |
| Edge Function | `notify-job-complete` | ⛔ |
| External | FCM credentials in `app.json` | ✅ Firebase configured |
| Deep link routing | Booking-related deep links → relevant screen | ✅ per CLAUDE.md route map |

**UAT on phone:** Make a booking → confirm push appears on lock screen → tap → opens booking detail.

---

## Flow 2.10 — Approve before/after photos

**Goal:** Customer is notified when provider uploads photos and can view them in the booking detail screen.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Storage bucket | `booking-photos` | ✅ |
| Lib | `uploadBookingPhoto()` in `storage.ts` | ✅ |
| Data | `getBookingPhotos()` | ✅ |
| Component | Photo gallery in booking detail | ⛔ (booking detail screen itself is empty) |
| Push | "Photos ready" notification | ⛔ |

**UAT on phone:** With a completed job that has photos, open booking detail → see gallery of before/after.

---

## Flow 2.11 — Rate provider post-service (gear rating + kudos + review)

**Goal:** After a job completes, customer rates on 4 gear dimensions, awards 0+ kudos, optionally writes a review.

**User journey:**
1. "Rate now" push or in-app banner → open booking detail
2. Tap "Rate" → review sheet opens (modal)
3. `GearRating` for Quality / Timeliness / Communication / Value
4. `KudosBadgeSelector` for 0+ kudos
5. Optional 500-char review text
6. Submit → `insertRating()` + `insertKudos()`

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Component | `GearRating` (interactive) | ✅ |
| Component | `KudosBadge` (interactive) | ✅ |
| Component | `KudosBadgeSelector` | ⛔ empty file |
| Component | `KudosDisplay` | ⛔ empty file |
| Component | Review sheet / modal | ⛔ |
| Data | `insertRating()`, `insertKudos()` | ✅ |
| Entry point | Triggered from booking detail | ⛔ (booking detail empty) |

**UAT on phone:** Complete a booking → tap Rate → submit gear ratings + kudos → confirm provider's profile shows updated rating.

---

## Flow 2.12 — Cancel or reschedule a booking

**Goal:** Customer cancels a booking (forfeits 15% deposit if within 24h) or reschedules to a new date/time.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| UI | Cancel / Reschedule buttons in booking detail | ⛔ |
| Logic | 24-hour deposit forfeiture | ⛔ in `utils/date.ts` helpers exist; need wiring |
| Data | `updateBooking({ status: 'cancelled', deposit_forfeited: true })` | ✅ |
| Stripe | Refund flow for non-forfeit cancellations | ⛔ |

---

## Flow 2.13 — Dispute a rating / job (48h window)

**Goal:** Either party can flag a completed booking for admin review within 48 hours.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| UI | Dispute button in booking detail / rating | ⛔ |
| Data | `updateRating({ flagged_for_review: true })` | ✅ |
| Backend | Admin queue + notification | ⛔ |
| Logic | 48h window check using `utils/date.ts` | ✅ helpers exist; need wiring |

---

# Section 3 — Customer Account & Communication

## Flow 3.1 — Manage vehicles ✅ _(2026-05-31)_

**Goal:** Customer adds, edits, or removes vehicles from their profile.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/more/account.tsx` (with vehicles section) | ✅ list + add / edit / delete / set-primary |
| Component | `VehicleForm` | ✅ (onboarding-only; account uses its own sheet form so it doesn't couple to `signUpDraft`) |
| Data | `getVehiclesByUser()`, `insertVehicle()`, `updateVehicle()`, `deleteVehicle()` | ✅ |

**UAT on phone:** Open More → Account. Add a vehicle, edit it, set a second vehicle as primary (the star moves), delete one (confirm alert). Confirm changes survive a tab switch.

---

## Flow 3.2 — Manage account settings & notifications ✅ _(2026-05-31)_

**Goal:** Customer edits name, profile photo, notification preferences, contact methods.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/more/account.tsx` | ✅ editable name (persists to `users`) + avatar via expo-image-picker → `uploadAvatar` → `updateUser`; email/phone shown read-only |
| Screen | `app/(tabs)/more/settings.tsx` | ✅ notification toggles + legal/about |
| Storage | `avatars` bucket | ✅ |
| Lib | `uploadAvatar()` | ✅ |
| Data | `updateUser()` | ✅ |
| State | `settings` Zustand store (notif prefs, AsyncStorage-backed) | ✅ NEW — `users` has no prefs columns, so prefs persist locally until Flow 2.9 push + a server column exist |

**Note:** Avatar capture needs the `expo-image-picker` native module → a dev-client / production build (not Expo Go web). The 1920px client resize from CLAUDE.md needs `expo-image-manipulator` (not yet approved) — quality is constrained to 0.8 via the picker for now.

**UAT on phone:** Account → tap avatar → pick a photo → it uploads and shows. Edit name → Save → persists. More → Settings → flip toggles; force-quit + reopen → toggles persisted.

---

## Flow 3.3 — More tab hub ✅ _(2026-05-31)_

**Goal:** Customer opens More tab and sees entry points to Account, Settings, Bookings History, Lug AI, Provider Mode, Sign Out.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/more/index.tsx` | ✅ profile summary card + Account/Settings/History/Lug/Provider rows + Sign Out; Provider row label adapts to role |

**UAT on phone:** Open More. Confirm the profile card shows your name + email/phone and routes to Account. Tap each row → Account, Settings, Booking history (past bookings), Ask Lug, and Provider (label reads "Become a Provider" as a customer, "Provider Dashboard" once you have a provider role). Tap Sign out → confirm the alert → land on splash.

---

## Flow 3.4 — Inbox: list message threads ✅ _(2026-05-31)_

**Goal:** Customer opens Inbox tab and sees a list of message threads with providers.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/inbox/index.tsx` | ✅ thread rows (provider avatar/name + booking context), loading/empty/error, pull-to-refresh |
| Data | `getThreadsForCustomer()` | ✅ |

**Note:** Customer view only — provider-side inbox is Section 5 (the thread summary query joins the provider's user, not the customer's).

**UAT on phone:** Open Inbox. With a booking that has a thread, confirm the provider's name + booking status/date render and tapping opens the conversation. Empty + pull-to-refresh states.

---

## Flow 3.5 — Inbox: send and receive messages in a thread ✅ _(2026-05-31)_

**Goal:** Customer opens a thread, sees message history, sends a new message (which passes through content moderation before insert).

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/inbox/[threadId].tsx` | ✅ message bubbles (mine/theirs + flagged style), composer, KeyboardAvoidingView, native header title = provider name |
| Data | `getMessages()`, `insertMessage()` | ✅ |
| Lib | `containsFlaggedContent()` in validators | ✅ (already wired into `insertMessage`) |
| Realtime | Supabase subscription for new messages on this thread | ✅ `thread:{threadId}` channel, INSERT → refetch, cleanup on unmount |

**UAT on phone:** Open a thread → history loads, header shows the provider name. Send a message → it appears and clears the input. Send something with a phone number / "Venmo me" → it posts as `[Message flagged for review]`. With a second device/session, a new message appears live.

---

## Flow 3.6 — Chat with Lug AI ✅ _(2026-05-31)_ — UI complete; edge fn awaits 🔒 key

**Goal:** Customer taps the floating Lug bubble (visible on every screen) and chats with the AI assistant about car care, services, and recommendations.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Component | `LugBubble` floating button | ✅ FAB, navigates to the full-screen Lug view |
| Component | `LugThread` conversation UI | ✅ chat + persistent "Talk to a person" CTA that becomes primary after 2 consecutive human-help turns (CLAUDE.md rule) |
| Screen | `app/(tabs)/more/lug.tsx` (full-screen view) | ✅ hosts LugThread; "Talk to a person" opens a support thread in the inbox |
| Edge Function | `lug-ai` (Anthropic Claude proxy with system prompt) | ✅ written — functional Deno scaffold with the CarApp system prompt; returns 503 until the key is set & it's deployed |
| External | `ANTHROPIC_API_KEY` set in Supabase secrets | 🔒 _(yours)_ — also `supabase functions deploy lug-ai` |
| Mount | Floating bubble must mount in `(tabs)/_layout.tsx` to be persistent | ✅ wraps `<Tabs>` so the FAB overlays every tab |

**Note (🔒 your step):** `supabase secrets set ANTHROPIC_API_KEY=…` then `supabase functions deploy lug-ai`. Optional `LUG_MODEL` env overrides the default (`claude-haiku-4-5-20251001`). Until then the UI shows a graceful fallback that points to the escalation CTA.

**UAT on phone:** Tap the gold Lug bubble (any tab) → Lug view. Ask a question → reply (once the key/deploy are in place). Confirm "Talk to a person" is visible without scrolling; ask for a human twice → it turns into a solid primary button; tap it → lands in a support thread.

---

## Flow 3.7 — Redeem promo code / gift card (deferred per CLAUDE.md "Post-MVP")

Per CLAUDE.md, promo/gift-card redemption is post-MVP. Data layer has `getPromotionByCode()` and `insertPromoRedemption()` but no UI is required for MVP.

---

# Section 4 — Provider Onboarding & Vetting

## Flow 4.1 — Existing customer opts in to provider mode ✅ _(2026-05-31)_

**Goal:** A customer toggles "Become a Provider" and is taken through the vetting flow.

**User journey:**
1. More tab → "Become a Provider"
2. Provider intro screen (what's expected, fees, founding program)
3. Choose provider type (Detailer / Mechanic — single-select; `provider_profiles` has one `provider_type_id`)
4. Continue to vetting flow

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/more/provider.tsx` | ✅ intro/opt-in + type pick → creates profile, role→both, routes to vetting; in-progress/approved states for existing providers |
| Screen | Provider intro / onboarding entry | ✅ (the customer state of `provider.tsx`) |
| Scaffold | `(provider)` route group + `vetting` hub + `VettingStepIndicator` + shared `vettingSteps` config | ✅ NEW — full-screen vetting stack outside the tabs |
| State | `providerDraft` Zustand store | ✅ |
| Data | `insertProviderProfile()`, `updateUser({ role: 'both' })` | ✅ |
| Gate | Root auth gate allows the `(provider)` group for signed-in users | ✅ |
| Backend | `create_provider_vetting_row` trigger seeds `provider_vetting` on profile insert | ✅ written in `schema.sql` — **🔒 apply migration to live DB** |

**Note (🔒 your step):** apply the new `create_provider_vetting_row` trigger to your Supabase project (it's in `carApp/supabase/schema.sql`). Without it the vetting row won't exist and step statuses stay "Not started".

**UAT on phone:** More → Become a Provider → pick Detailer → Start application → lands on the vetting hub showing 6 steps with statuses. Re-open More → Provider → "Continue application" returns to the hub.

---

## Flow 4.2 — Complete vetting: Identity (Persona / Stripe Identity) ✅ _(2026-05-31)_ — UI done; Persona glue stubbed

**Goal:** Provider verifies government ID + selfie match.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Identity step (`app/(provider)/identity.tsx`) | ✅ manual gov-ID photo upload via `VettingUploadStep` → `identity_status: 'submitted'` |
| Lib | `src/lib/persona/index.ts` | ✅ stub (`startPersonaInquiry` → not configured) |
| Edge Function | `persona-webhook` | ✅ stub (maps inquiry status → `identity_status`; 503 until secret set) |
| Component | `VettingStepIndicator` | ✅ |
| Component | `CredentialUpload` | ✅ |
| Data | `updateProviderVetting({ identity_status })` | ✅ |
| External | Persona API key + SDK | 🔒 _(yours)_ — automated verification wires in once set |

---

## Flow 4.3 — Complete vetting: Background check (Checkr) ✅ _(2026-05-31)_ — UI done; Checkr glue stubbed

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Background step (`app/(provider)/background.tsx`) | ✅ consent → `background_status: 'submitted'` via `VettingActionStep` |
| Lib | `src/lib/checkr/index.ts` | ✅ stub (`startBackgroundCheck` → not configured) |
| Edge Function | `checkr-webhook` | ✅ stub (maps report status → `background_status`; 503 until secret set) |
| Data | `updateProviderVetting({ background_status })` | ✅ |
| External | Checkr API key | 🔒 _(yours)_ — real report runs server-side once set |

---

## Flow 4.4 — Complete vetting: Insurance upload ✅ _(2026-05-31)_

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Insurance step (`app/(provider)/insurance.tsx`) | ✅ via shared `VettingUploadStep` |
| Component | `CredentialUpload` (reusable doc uploader) | ✅ |
| Storage | `vetting-documents` bucket | ✅ |
| Lib | `uploadVettingDocument()` | ✅ |
| Data | `updateProviderVetting({ insurance_status: 'submitted' })` | ✅ upload → "Under review"; admin approves manually |

**UAT on phone:** Vetting hub → Insurance → Upload insurance photo → step shows "Under review".

---

## Flow 4.5 — Complete vetting: Credentials (IDA / ASE) ✅ _(2026-05-31)_

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Credentials step (`app/(provider)/credentials.tsx`) | ✅ via shared `VettingUploadStep` |
| Component | `CredentialUpload` | ✅ |
| Storage / Data | (same as 4.4) → `credentials_status: 'submitted'` | ✅ |

**UAT on phone:** Vetting hub → Credentials → upload a cert photo → "Under review".

---

## Flow 4.6 — Complete vetting: Bank account (Stripe Connect onboarding) ✅ _(2026-05-31)_ — UI done; Connect glue stubbed

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Bank step (`app/(provider)/bank.tsx`) | ✅ "Connect with Stripe" via `VettingActionStep`; shows "not set up yet" until configured |
| Lib | Stripe Connect onboarding link generation (`src/lib/stripe/connect.ts`) | ✅ stub, separate from `stripe/index.ts` |
| Data | `updateProviderProfile({ stripe_account_id })` | ✅ (saved on onboarding return once configured) |
| External | Stripe Connect platform configured | 🔒 _(yours)_ |

---

## Flow 4.7 — Complete vetting: Profile (bio, photos, hours, coverage area) ✅ _(2026-05-31)_

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | Vetting → Profile step (`app/(provider)/profile.tsx`) | ✅ bio/coverage/radius → `updateProviderProfile`; recomputes `profile_completeness` |
| Component | `ServiceMenuEditor` | ✅ list + add/edit/delete service packages (dollars in, cents stored); surfaces "Pending review" for unapproved |
| Component | `AvailabilityCalendar` | ✅ weekly day picker (controlled) — **not yet persisted** (no `provider_profiles.availability` column) |
| Storage | `avatars` bucket | ✅ (provider photo reuses the Account avatar) |
| Data | `updateProviderProfile()`, `insertServicePackage()`, + new `getProviderOwnServicePackages()` | ✅ |

**Note:** availability is captured locally only; persisting it needs an `availability JSONB` column on `provider_profiles` + a `supabase gen types` regen (deferred, also relevant to Flow 5.2).

**UAT on phone:** Vetting hub → Profile. Write a bio (≥20 chars), coverage area, radius; add a service (enter $150 / 120 min → shows $150.00); pick availability days; Save → hub shows Profile = Approved (completeness ≥ 80).

---

## Flow 4.8 — Provider awaits approval ✅ _(2026-05-31)_

**Goal:** While `verification_status != 'approved'`, provider is held on a pending screen showing each vetting step's status.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(auth)/pending-approval.tsx` | ✅ + "Continue your application" → `(provider)/vetting` |
| Data | `getProviderVetting()` | ✅ |
| Gate | Block provider screens until approved | ✅ root gate hydrates `providerVerification` and holds **provider-only** unapproved accounts on pending-approval (while allowing the `(provider)` vetting flow); **hybrid `both` users are never blocked** — they keep customer access and vet at their own pace |

**Note:** closes the "unapproved provider routing gap" — provider-only accounts no longer land on `/(tabs)/search` on cold start; they resume on pending-approval until `verification_status = 'approved'`.

**UAT on phone:** Sign in as a provider-only account with `verification_status = 'pending'` → lands on pending-approval; "Continue your application" opens the vetting hub. Flip the row to `approved` in Supabase → next cold start lands on Search.

---

# Section 5 — Provider Active Use

## Flow 5.1 — Provider sees incoming booking requests & accepts/declines

**Goal:** Provider sees pending bookings in their dashboard and can accept, decline, or counter-offer.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Screen | `app/(tabs)/more/provider.tsx` (provider dashboard hub) | ⛔ empty file |
| Data | `getUpcomingBookingsForProvider()` | ✅ |
| Data | `updateBooking({ status: 'confirmed' })` | ✅ |
| Push | "New booking request" notification | ⛔ |

---

## Flow 5.2 — Provider manages availability calendar

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Component | `AvailabilityCalendar` | ⛔ empty file |
| Data | Availability fields on `provider_profiles` | 🟡 schema check needed |

---

## Flow 5.3 — Provider edits service menu

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Component | `ServiceMenuEditor` | ⛔ empty file |
| Data | `insertServicePackage()`, `updateServicePackage()`, `deleteServicePackage()` | ✅ |

---

## Flow 5.4 — Provider navigates to a job + sends live GPS

**Goal:** When a booking goes `en_route`, the provider app pushes GPS updates every 5 seconds to Redis (and periodically to Postgres for last-known fallback).

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `src/lib/location/index.ts` | ⛔ empty file |
| Lib | `src/lib/redis/index.ts` | ⛔ empty file |
| Component | `LiveMap` (provider-side view with directions to customer) | ⛔ empty file |
| External | `expo-location` background permission | ⛔ verify config |
| External | Redis URL in Supabase secrets | 🔒 |

---

## Flow 5.5 — Provider uploads before/after photos

**Goal:** Provider uses in-app camera to capture and upload required before/after photos (4 minimum to complete a job).

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Lib | `uploadBookingPhoto()` | ✅ |
| Data | `insertBookingPhoto()` | ✅ |
| UI | Camera screen + gallery in active-booking provider view | ⛔ |
| External | `expo-camera` permissions | ⛔ verify package |

---

## Flow 5.6 — Provider marks job complete → Stripe captures remainder

**Goal:** Provider taps "Complete Job" → backend captures remaining 85% via Stripe → payout queued.

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| UI | "Complete Job" button in provider's active booking view | ⛔ |
| Edge Function | `stripe-webhook` extended to handle balance capture | 🟡 only deposit creation today |
| Data | `updateBooking({ status: 'completed' })` | ✅ |

---

## Flow 5.7 — Provider views earnings & payouts

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Component | `EarningsDashboard` | ⛔ empty file |
| Data | `getPayoutsByProvider()`, `getPaymentsByUser()` | ✅ |
| Edge Function | `notify-payout-processed` | ⛔ |

---

## Flow 5.8 — Provider receives kudos / rating notifications

**Required pieces:**
| Type | Item | Status |
|---|---|---|
| Edge Function | `notify-kudos-received` | ⛔ |
| UI | Kudos history view on provider dashboard | ⛔ |
| Data | `getKudosForProviderUser()` | ✅ |

---

# Section 6 — Cross-Cutting

## Flow 6.1 — Dark mode

All components must support dark via `useColorScheme()` + design tokens. Already standard practice in built components. Audit pending in Phase 18 of build checklist.

| Item | Status |
|---|---|
| Design tokens — light & dark palettes | ✅ |
| Built screens honor `useColorScheme()` | ✅ where built |
| Full audit | ⛔ |

**UAT on phone:** Toggle system dark mode, walk through every built screen.

---

## Flow 6.2 — Push notification deep links

Per CLAUDE.md, each push payload must deep-link to a specific screen. Routing is correctly mapped in `app/+not-found.tsx` fallback today.

| Item | Status |
|---|---|
| Deep link scheme `carapp://` | ✅ |
| `+not-found.tsx` fallback | ✅ |
| FCM token registration | ⛔ |
| All 10 trigger types | ⛔ |

---

## Flow 6.3 — Network failure & retry

Per CLAUDE.md, no offline queueing; show error + retry CTA.

| Item | Status |
|---|---|
| Built list screens show 3 states (loading/empty/error) | ✅ where built |
| Toast / inline / fullscreen error patterns | 🟡 inconsistent |
| Sentry breadcrumbs at state transitions | ⛔ |

---

## Flow 6.4 — Content moderation (no off-platform contact)

| Item | Status |
|---|---|
| `containsFlaggedContent()` | ✅ |
| Wired into `insertMessage()` | ✅ |
| Admin queue for flagged messages | ⛔ |

---

## Flow 6.5 — Analytics & error monitoring

| Item | Status |
|---|---|
| Mixpanel events (per CLAUDE.md table) | ⛔ |
| Sentry init | ⛔ |
| Sentry breadcrumbs at key transitions | ⛔ |

---

# Build Priorities (Recommended Order)

Based on what unlocks the most UAT coverage with the least new code:

1. **Flow 1.1 onboarding screens** — without these, no real new-user testing is possible. Components and state already exist; only screens + `insertUser` mutation needed.
2. **Flow 2.6 booking detail screen** — unblocks the entire post-booking experience (tracking, rating, photos, cancel, message).
3. **Flow 2.7 past bookings screen** — small lift, completes the Bookings tab.
4. **Flow 3.3 More tab hub** — gives access to Account, Settings, Sign Out, Provider Mode.
5. **Flow 3.1 / 3.2 account & vehicle management** — small screens with existing data layer.
6. **Flow 3.4 / 3.5 inbox + thread view** — the data layer + moderation already exist; only UI needed.
7. **Flow 2.11 rating sheet** — finishes the customer post-service moment.
8. **Flow 4.x provider vetting + 5.x provider dashboard** — large body of work; sequence Persona → Checkr → Stripe Connect last.
9. **Flow 2.8 / 5.4 live tracking** — depends on Redis + location libs + Google Maps view.
10. **Flow 2.9 push notifications + Edge Functions** — backend-heavy.
11. **Flow 3.6 Lug AI** — Anthropic Edge Function + floating bubble.

---

# How to Use This Document

- Before starting a new task, find the relevant flow and confirm the precise scope of what's needed.
- When a flow becomes fully ✅, add a checkbox at the top of the flow and date it.
- When you finish work on a flow, run the "UAT on phone" steps end-to-end before marking complete.
- Keep the **Status Legend** symbols honest — a 🟡 stub is not a ✅.
