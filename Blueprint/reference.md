# CarApp — File Reference Log
[src/lib/supabase/client.ts] — Initializes and exports the Supabase singleton client used by all queries, mutations, auth, and storage operations throughout the app.

[src/types/supabase.ts] — Auto-generated TypeScript types from the Supabase schema; never edited manually — regenerated after any schema change.

[src/types/models.ts] — Hand-authored domain TypeScript interfaces for all core entities (User, Booking, Provider, Vehicle, etc.) used across components and state.

[src/types/navigation.ts] — Typed route params for Expo Router; ensures all navigation and deep link targets are type-safe across the app.

[src/design/tokens.ts] — Single source of truth for all color, spacing, radius, and font family values; imported by every component to enforce visual consistency.

[src/design/typography.ts] — Defines all font sizes, weights, line heights, and pre-composed text styles used across the app.

[src/design/theme.ts] — Combines tokens and typography into a single importable theme object; components import from here when they need values from multiple token groups.

[src/utils/money.ts] — All monetary formatting and calculation helpers; converts between cents and display strings, computes deposits, platform fees, service fees, and provider payouts.

[src/utils/date.ts] — All date/time parsing, formatting, and comparison helpers; handles ISO string display, relative time, and business-logic checks for the 24h cancellation and 48h dispute windows.

[src/utils/validators.ts] — Form validation helpers (email, phone, name, vehicle, review, promo, rating) and containsFlaggedContent() content moderation that detects phone numbers, emails, and off-platform payment/contact attempts in messages.

[src/lib/supabase/auth.ts] — Auth helpers wrapping Supabase Auth: OAuth sign-in (Google/Apple via expo-auth-session), email/phone OTP send and verify, sign-out, and isNewUser check against the users table.

[src/state/auth.ts] — Zustand auth store that holds the Supabase session, hydrated users row, resolved role, and hydration flag; single source of truth for "am I signed in?" consumed by the root auth gate and every authenticated screen.

[src/state/signUpDraft.ts] — Zustand draft store for the customer multi-step signup flow (profile → role → vehicle → review); reset on submit or cancel so no stale state leaks into the next onboarding run.

[src/state/providerDraft.ts] — Zustand draft store for the provider onboarding + vetting flow covering profile, services, and the five vetting statuses (identity, background, insurance, credentials, bank) plus Persona, Checkr, and Stripe Connect ids.

[src/components/auth/StepIndicator.tsx] — Horizontal progress bar that renders a dot per step with an active highlight; shared by both the customer signup and the provider vetting flows to show current position.

[src/components/auth/RoleSelector.tsx] — Card-based radio group letting a new user pick customer, provider, or both during onboarding; mirrors the three allowed values of users.role.

[src/components/auth/VehicleForm.tsx] — Controlled multi-field form writing the primary vehicle (year/make/model + optional trim/color/plate) into the signUpDraft store with inline validation via utils/validators.ts.

[src/components/auth/ServicePicker.tsx] — Multi-select list of service_catalog rows used in the provider services step; adds/removes ServicePackageDraft entries in the providerDraft store with dedup by catalog id.

[app/_layout.tsx] — Root Expo Router layout owning the Supabase auth lifecycle; subscribes to onAuthStateChange, hydrates useAuthStore with the users row, and routes between (auth) and (tabs) based on session + user presence.

[app/(auth)/_layout.tsx] — Headerless Stack layout for every unauthenticated screen (sign-in, otp-entry, otp-verify, pending-approval) with slide-from-right animation.

[app/(auth)/sign-in.tsx] — Single entry screen for unauthenticated users offering Google OAuth, Apple OAuth, and the Email/Phone OTP path that navigates to otp-entry.

[app/(auth)/otp-entry.tsx] — Email/phone OTP send screen with tab-style method toggle, inline validation, E.164 normalization, and navigation to otp-verify with the contact preserved as query params.

[app/(auth)/otp-verify.tsx] — 6-digit OTP verify screen that calls verifyOtp, surfaces errors inline, supports resend, and lets the root auth gate handle post-session navigation.

[app/(auth)/pending-approval.tsx] — Provider gating screen shown while provider_vetting is incomplete; lists the five vetting steps with status badges, shows an approved-of-total counter, and exposes sign-out.

[src/components/ui/Text.tsx] — Branded typography wrapper that maps every textStyle variant from design/typography.ts to a React Native Text element with automatic dark-mode color resolution via the design token palette.

[src/lib/supabase/queries.ts] — Centralized SELECT layer for every Supabase read in the app (users, vehicles, providers, bookings, messages, ratings, payouts, notifications, promotions, location cache); wraps each query in try/catch and returns a typed `{ data, error }` tuple so screens never call `supabase.from()` directly.

[src/components/ui/Button.tsx] — Multi-variant accessible button (primary/secondary/success/danger/ghost, sm/md/lg sizes) built with React.forwardRef, Pressable, and design tokens; supports loading/disabled states, left/right icons, dark mode, and meets WCAG 2.1 AA 44dp touch target.

[src/components/ui/TextField.tsx] — Labeled text input with focus/error/disabled border states, inline error and hint text, left/right icon slots, built-in secure-text show/hide toggle, multiline support, dark mode, and WCAG 2.1 AA compliant touch targets.

[src/components/ui/Card.tsx] — Flexible surface container with elevated/outlined/flat variants, optional press interaction (Pressable with disabled/accessibility support), dark mode shadow and background tokens, and 12px card border radius per design spec.

[src/components/ui/Avatar.tsx] — Profile photo component rendering a Supabase Storage image URI or a hash-derived initials fallback; supports xs/sm/md/lg/xl sizes, an optional online/offline presence dot, optional press interaction with WCAG 2.1 AA 44pt hit targets, and full dark-mode support.

[src/lib/supabase/mutations.ts] — Centralized INSERT/UPDATE/DELETE layer for every Supabase write in the app (users, vehicles, providers, vetting, service packages, bookings, photos, ratings, kudos, messages, notifications, promo redemptions); wraps each mutation in try/catch and returns a typed `{ data, error }` tuple, with message content moderation via containsFlaggedContent() before insert.

[src/lib/supabase/storage.ts] — Centralized file upload/download/delete layer for Supabase Storage across three buckets (avatars, booking-photos, vetting-documents); validates mime type and file size, builds deterministic paths, provides convenience wrappers for each bucket, and returns typed `{ data, error }` tuples with signed URL support for private buckets.

[src/components/ui/Rating.tsx] — General-purpose 1–5 star rating widget used across provider cards, booking history, and rating prompts; supports read-only display with fractional half-star rendering, interactive tappable input with WCAG 2.1 AA hit targets, an optional label string, sm/md/lg sizes, and full dark-mode support via the gearGold design token.

[src/components/ui/GearRating.tsx] — 4-dimension gear rating widget (Quality, Timeliness, Communication, Value) that composes the Rating component into independently controlled 1–5 star rows; supports read-only display with fractional rendering, interactive per-dimension input, and an optional Overall row showing the arithmetic mean in gearGold with full dark-mode support.

[src/components/ui/KudosBadge.tsx] — Pill badge for the 6 fixed kudos types (Meticulous, Reliable, Magic Hands, Great Value, Fast Worker, Communicator); renders a Lucide icon + label + optional received-count in display or interactive/selectable mode with gearGold-fill selected state and deepIndigo outlined unselected state, WCAG 2.1 AA 44pt touch targets, and full dark-mode support.

[app/(tabs)/_layout.tsx] — Expo Router Tabs layout configuring the 5-tab bottom navigation bar (Search, Services, Bookings, Inbox, More) with Lucide icons, design token colors, and automatic dark-mode support via useColorScheme.

[src/components/ui/Sheet.tsx] — Bottom drawer modal used for confirmations, filter panels, and action sheets; springs in/out via Reanimated, supports swipe-to-dismiss via gesture handler, backdrop tap, optional title header with close button, keyboard avoidance for form content, and full dark-mode support.
