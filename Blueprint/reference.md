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
