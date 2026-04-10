# CarApp — Build Checklist

## Phase 0 — Foundation
- [x] `src/lib/supabase/client.ts` — Supabase singleton
- [x] `src/types/supabase.ts` — generate from schema (supabase gen types)
- [x] `src/types/models.ts` — domain TypeScript interfaces
- [x] `src/types/navigation.ts` — Expo Router typed params
- [x] `src/design/tokens.ts` — all color, spacing, radius tokens
- [x] `src/design/typography.ts` — font sizes, weights, families
- [x] `src/design/theme.ts` — combined theme object
- [x] `src/utils/money.ts` — cents ↔ display formatting
- [x] `src/utils/date.ts` — ISO string parsing and formatting
- [x] `src/utils/validators.ts` — form validation + containsFlaggedContent()

---

## Phase 1 — Auth Layer
- [x] `src/lib/supabase/auth.ts` — signInWithGoogle, signInWithApple, signInWithOtp, signOut, isNewUser
- [x] `app/(auth)/otp-entry.tsx` — OTP code input screen (email + phone)
- [x] `app/(auth)/otp-verify.tsx` — OTP verification + session handoff
- [x] `src/state/auth.ts` — Zustand auth store (session, user, role)
- [x] `src/state/signUpDraft.ts` — customer multi-step onboarding state
- [x] `src/state/providerDraft.ts` — provider onboarding multi-step state
- [x] `src/components/auth/StepIndicator.tsx`
- [x] `src/components/auth/RoleSelector.tsx`
- [x] `src/components/auth/VehicleForm.tsx`
- [x] `src/components/auth/ServicePicker.tsx`
- [x] `app/_layout.tsx` — root auth gate (onAuthStateChange)
- [x] `app/(auth)/_layout.tsx`
- [x] `app/(auth)/sign-in.tsx` — Google + Apple SSO + Email/Phone OTP entry
- [x] `app/(auth)/pending-approval.tsx` — provider awaiting vetting

---

## Phase 2 — UI Component Library
- [x] `src/components/ui/Text.tsx`
- [ ] `src/components/ui/Button.tsx`
- [ ] `src/components/ui/TextField.tsx`
- [ ] `src/components/ui/Card.tsx`
- [ ] `src/components/ui/Avatar.tsx`
- [ ] `src/components/ui/Rating.tsx`
- [ ] `src/components/ui/GearRating.tsx`
- [ ] `src/components/ui/KudosBadge.tsx`
- [ ] `src/components/ui/Sheet.tsx`
- [ ] `src/components/ui/Spacer.tsx`

---

## Phase 3 — Supabase Data Layer
- [x] `src/lib/supabase/queries.ts` — all SELECT operations
- [ ] `src/lib/supabase/mutations.ts` — all INSERT/UPDATE operations
- [ ] `src/lib/supabase/storage.ts` — file uploads (photos, identity docs)

---

## Phase 4 — Tab Shell & Navigation
- [ ] `app/(tabs)/_layout.tsx` — 5-tab bar config
- [ ] `app/(tabs)/search/index.tsx` — empty shell
- [ ] `app/(tabs)/services/index.tsx` — empty shell
- [ ] `app/(tabs)/bookings/index.tsx` — empty shell
- [ ] `app/(tabs)/inbox/index.tsx` — empty shell
- [ ] `app/(tabs)/more/index.tsx` — empty shell

---

## Phase 5 — Search & Provider Discovery
- [ ] `src/state/search.ts` — Zustand search store (filters, results)
- [ ] `src/components/search/LocationSearchBar.tsx`
- [ ] `src/components/search/FiltersSheet.tsx`
- [ ] `src/components/search/ProviderCard.tsx`
- [ ] `app/(tabs)/search/index.tsx` — search home with location bar
- [ ] `app/(tabs)/search/results.tsx` — filtered provider list
- [ ] `app/(tabs)/search/provider/[id].tsx` — provider profile
- [ ] `app/(tabs)/services/index.tsx` — CarApp service catalog browse

---

## Phase 6 — Booking Flow
- [ ] `src/state/bookingDraft.ts` — in-progress booking builder
- [ ] `src/components/booking/AddressPicker.tsx`
- [ ] `src/components/booking/DateTimePicker.tsx`
- [ ] `src/components/booking/PriceBreakdown.tsx`
- [ ] `src/components/booking/DepositSummary.tsx`
- [ ] `src/lib/stripe/index.ts` — payment intents, deposit capture
- [ ] `app/(tabs)/search/book/[providerId].tsx` — full booking flow

---

## Phase 7 — Payments
- [ ] `src/lib/stripe/index.ts` — Stripe Connect, deposit, balance capture, payouts
- [ ] Stripe webhook handler (Supabase Edge Function) — payment succeeded, payout processed

---

## Phase 8 — Active Booking & Live Tracking
- [ ] `src/lib/location/index.ts` — GPS helpers, geocoding, distance calc
- [ ] `src/lib/redis/index.ts` — GPS caching, rate limiting, short-lived tokens
- [ ] `src/components/tracking/LiveMap.tsx`
- [ ] `src/components/tracking/JobStatusBar.tsx`
- [ ] `src/components/tracking/ETADisplay.tsx`
- [ ] `app/(tabs)/bookings/[id].tsx` — active booking detail
- [ ] `app/(tabs)/bookings/tracking/[bookingId].tsx` — live GPS map screen

---

## Phase 9 — Bookings Management
- [ ] `app/(tabs)/bookings/index.tsx` — upcoming bookings list
- [ ] `app/(tabs)/bookings/past.tsx` — completed bookings history

---

## Phase 10 — Push Notifications
- [ ] `src/lib/notifications/push.ts` — FCM token registration, all 10 trigger types
- [ ] Supabase Edge Function — booking confirmed trigger
- [ ] Supabase Edge Function — provider en route trigger
- [ ] Supabase Edge Function — job complete / rate now trigger
- [ ] Supabase Edge Function — payout processed trigger
- [ ] Supabase Edge Function — kudos received trigger

---

## Phase 11 — Inbox & Messaging
- [ ] `app/(tabs)/inbox/index.tsx` — thread list
- [ ] `app/(tabs)/inbox/[threadId].tsx` — message thread view

---

## Phase 12 — Ratings, Kudos & Reviews
- [ ] `src/components/kudos/KudosBadgeSelector.tsx`
- [ ] `src/components/kudos/KudosDisplay.tsx`
- [ ] Post-service review flow (gear rating + kudos + review text)

---

## Phase 13 — Provider Dashboard
- [ ] `src/components/provider/AvailabilityCalendar.tsx`
- [ ] `src/components/provider/ServiceMenuEditor.tsx`
- [ ] `src/components/provider/EarningsDashboard.tsx`
- [ ] `src/components/provider/VettingStepIndicator.tsx`
- [ ] `src/components/provider/CredentialUpload.tsx`
- [ ] `app/(tabs)/more/provider.tsx` — provider dashboard hub

---

## Phase 14 — Provider Vetting
- [ ] `src/lib/persona/index.ts` — identity verification flow
- [ ] `src/lib/checkr/index.ts` — background check webhook
- [ ] Checkr webhook handler (Supabase Edge Function)
- [ ] Persona webhook handler (Supabase Edge Function)
- [ ] Vetting multi-step flow screens

---

## Phase 15 — More Tab & Account
- [ ] `app/(tabs)/more/account.tsx` — customer profile, vehicles
- [ ] `app/(tabs)/more/settings.tsx` — preferences, notifications
- [ ] `app/(tabs)/more/lug.tsx` — Lug AI screen

---

## Phase 16 — Lug AI
- [ ] `src/components/lug/LugBubble.tsx` — persistent floating chat button
- [ ] `src/components/lug/LugThread.tsx` — conversation thread UI
- [ ] Anthropic Claude API integration (Supabase Edge Function with system prompt + catalog context)

---

## Phase 17 — Admin Panel (React Web)
- [ ] Admin app scaffold (React web, separate from mobile)
- [ ] User management — search, view, suspend
- [ ] Provider vetting queue — review docs, approve/reject
- [ ] Booking management — view all, force-cancel, reassign
- [ ] Dispute resolution — review flagged bookings, issue refunds
- [ ] Content moderation — review flagged messages
- [ ] Financial overview — gross bookings, fee breakdown, payout reports
- [ ] Promo management — create/expire codes, gift card inventory

---

## Phase 18 — Polish & Pre-Launch
- [ ] Dark mode — verify all components against dark tokens
- [ ] Accessibility audit — 44x44pt touch targets, WCAG AA contrast
- [ ] Error states — empty states, network failures, timeout handling
- [ ] Sentry integration — `@sentry/react-native` wired up
- [ ] Mixpanel integration — booking funnel events instrumented
- [ ] `app/+not-found.tsx` — 404 screen
- [ ] E2E flows — `e2e/auth-flow.yaml`, `e2e/booking-flow.yaml`, `e2e/provider-onboarding.yaml`

---

## Post-MVP (Do Not Build Now)
- [ ] Recurring subscription bookings
- [ ] Provider subscription tiers (Basic / Pro / Elite)
- [ ] Mechanics expansion (Phase 1b)
- [ ] Lug 2.0 proactive push alerts
- [ ] Geographic expansion
- [ ] CarApp Care membership
- [ ] Gift card purchase + redemption flow
- [ ] Referral code generation + redemption at checkout
- [ ] Promo code entry at checkout