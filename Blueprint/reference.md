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

[src/components/ui/Spacer.tsx] — Invisible layout utility that inserts vertical or horizontal blank space between elements using named spacing tokens or exact pixel values; also supports a flex-grow mode to fill remaining space in a flex container.

[src/state/search.ts] — Zustand search store holding location query, provider search filters (sort, min rating, provider type), and fetched results; exposes fetchResults which calls searchProviders from the data layer, plus selectors for active filter count.

[src/components/search/LocationSearchBar.tsx] — Location text input with MapPin icon and clear button that reads/writes the search store's locationQuery; used on the search home screen to capture the customer's service location.

[src/components/search/FiltersSheet.tsx] — Bottom drawer sheet for refining provider search results; exposes sort-by and minimum-rating filters via a local draft that only applies on Apply, composing Sheet, Rating, and Button UI primitives.

[src/components/search/ProviderCard.tsx] — Elevated card tile displaying a ProviderSearchResult with avatar, name, provider type label, gear rating, job count, kudos count, bio excerpt, and coverage area; tapping navigates to the provider detail screen.

[app/(tabs)/search/_layout.tsx] — Stack navigator layout for the Search tab; hides the header on the home screen and styles Stack headers for results, provider detail, and booking screens.

[app/(tabs)/search/index.tsx] — Search home screen with LocationSearchBar, primary search button, and Detailing/Mechanical category quick-filter tiles that navigate to the results list.

[app/(tabs)/search/results.tsx] — Filtered provider results list rendering ProviderCard tiles in a FlatList with a filter bar, FiltersSheet drawer, and loading/empty/error states.

[app/(tabs)/search/provider/[id].tsx] — Provider profile detail screen showing avatar, bio, gear rating, stats, coverage area, service packages with prices and duration, and a sticky Book Now CTA.

[app/(tabs)/services/_layout.tsx] — Headerless Stack layout for the Services tab so the screen renders its own header content.

[app/(tabs)/services/index.tsx] — Service catalog browse screen that fetches the admin-managed service_catalog table, groups entries by category, and renders them in a SectionList.

[src/state/bookingDraft.ts] — Zustand store for the in-progress booking draft; tracks selected services (snapshotted with prices in cents), vehicle, address, schedule, and exposes selectors for subtotal, service fee, total, deposit, balance, duration, and readiness.

[src/components/booking/AddressPicker.tsx] — Text-based address input with MapPin icon for the booking flow; wraps TextField with service-address-specific label, placeholder, and hint (no Google Maps for MVP).

[src/components/booking/DateTimePicker.tsx] — Date and time selector rendering two tappable cards that open the native platform picker; merges date and time selections into a single ISO string for the booking draft.

[src/components/booking/PriceBreakdown.tsx] — Itemised price display showing each selected service, the 2% customer service fee, and the computed total; all values rendered from cents via money.ts.

[src/components/booking/DepositSummary.tsx] — Payment summary card showing the 15% deposit due now, remaining balance on completion, total, and the 24-hour cancellation forfeiture policy note.

[src/lib/stripe/index.ts] — Stripe integration module that proxies deposit payment intent creation through the stripe-webhook Edge Function and wraps @stripe/stripe-react-native's confirmPayment for client-side confirmation.

[app/(tabs)/search/book/[providerId].tsx] — Multi-step booking flow screen (Services → Details → Review) that loads the provider's packages and customer vehicles, accumulates selections in the bookingDraft store, creates the booking row, and initiates the 15% deposit payment via Stripe.

[supabase/functions/stripe-webhook/index.ts] — Deno Edge Function handling app-invoked payment intent creation (deposit) and Stripe webhook events (payment_intent.succeeded → confirms booking, payment_intent.payment_failed → marks payment failed).
[carApp/src/lib/stripe/__tests__/index.test.ts] — Unit tests for the Stripe client module; covers createDepositPaymentIntent (success, edge-function error, missing clientSecret, exception) and confirmDepositPayment (success, card declined, empty error, SDK exception, non-Error throw).
[carApp/e2e/auth-flow.yaml] — Maestro E2E test for the full email-OTP sign-in path, resend flow, and phone entry path.
[carApp/e2e/booking-flow.yaml] — Maestro E2E test covering search → provider profile → 3-step booking form → Stripe deposit payment confirmation.
[carApp/e2e/provider-onboarding.yaml] — Maestro E2E test for provider sign-in, pending-approval screen vetting rows, and sign-out.
[carApp/app/(tabs)/bookings/_layout.tsx] — Stack navigator layout for the Bookings tab; hides the header on the index screen and provides styled Stack headers for past, detail ([id]), and live tracking sub-screens.
[carApp/app/(tabs)/bookings/index.tsx] — Upcoming bookings list screen showing pending/confirmed/en_route/in_progress bookings with booking cards (provider, date, vehicle, status pill, price); supports customer/provider tab toggle for dual-role users, pull-to-refresh, and loading/empty/error states.
[carApp/app/+not-found.tsx] — Branded fallback screen for unmatched routes (e.g. stale push notification deep links or OAuth callback URLs); renders a spinner while the root auth gate in _layout.tsx redirects the user to (auth) or (tabs) based on session state.
[carApp/e2e/oauth-flow.yaml] — Maestro E2E smoke test that verifies the Google and Apple sign-in entry points render on the sign-in screen and that tapping each button triggers iOS's ASWebAuthenticationSession permission sheet without crashing the app.
[carApp/src/lib/supabase/mutations.ts] — Added insertUser mutation so the customer onboarding review step can write the initial users row using the authenticated session id, email/phone, full name, and role.
[carApp/app/(auth)/onboarding/_layout.tsx] — Headerless Stack layout for the 4-step customer onboarding flow (profile → role → vehicle → review) with swipe-back disabled so users move forward via the screen CTAs only.
[carApp/app/(auth)/onboarding/profile.tsx] — Onboarding step 1 collecting the new user's full name with inline validation via isValidFullName, writing through useSignUpDraftStore.setProfile and advancing to the role step.
[carApp/app/(auth)/onboarding/role.tsx] — Onboarding step 2 composing RoleSelector to capture customer / provider / both, defaulting to customer per CLAUDE.md, and routing provider-only signups straight to review (no personal vehicle).
[carApp/app/(auth)/onboarding/vehicle.tsx] — Onboarding step 3 wrapping VehicleForm to collect the new customer's primary vehicle (year/make/model required, trim/color/plate optional) and gating Continue on selectVehicleComplete.
[carApp/app/(auth)/onboarding/review.tsx] — Onboarding step 4 summarising the captured profile/role/vehicle, calling insertUser (and insertVehicle for customer/both) using the Supabase session id/email/phone, pushing the new user into useAuthStore so the root gate lands them on (tabs)/search, and resetting the signUpDraft.
[carApp/app/_layout.tsx] — Updated root auth gate to route sessions that have no users row into the onboarding sub-stack (/(auth)/onboarding/profile) instead of bouncing back to the splash, and to leave users alone while they navigate within onboarding.
[carApp/app/(auth)/_layout.tsx] — Registered the onboarding sub-stack as a child route of the (auth) group so the onboarding screens render under the shared headerless auth layout.
[carApp/src/lib/supabase/auth.ts] — Updated signInWithApple to use the native expo-apple-authentication flow on iOS (signInAsync → supabase.auth.signInWithIdToken) with a soft cancel on ERR_REQUEST_CANCELED, falling back to the existing web OAuth flow on Android, per App Store policy requiring native Sign in with Apple when third-party logins are offered.
[carApp/ios/carapp/carapp.entitlements] — Added the com.apple.developer.applesignin entitlement so the native Apple Sign In sheet can authenticate against the registered App ID com.emre.carapp.
[carApp/app/(tabs)/more/index.tsx] — Promoted the previously __DEV__-gated sign-out button to a real user-facing affordance on the More tab landing, with a native Alert confirmation before calling signOut; lives here until the Account sub-screen is built in Phase 15.
[carApp/app/(tabs)/more/_layout.tsx] — Stack layout for the More tab so the account/admin/lug/provider/settings sub-screens stay nested under one bottom-tab entry instead of each becoming its own tab and breaking the declared tab order.
[carApp/app/(tabs)/inbox/_layout.tsx] — Stack layout for the Inbox tab so the [threadId] message detail screen stays nested under one bottom-tab entry instead of registering as its own tab.
[Blueprint/seeds/service_catalog.sql] — Idempotent seed inserting the curated MVP service_catalog rows (8 detailer services, 3 detailer add-ons, 12 mechanic services, 2 mechanic add-ons) keyed to provider_types by name; runnable standalone in the Supabase SQL editor and mirrored in schema_policies.sql for fresh-DB provisioning.
[carApp/supabase/schema.sql] — Relocated and renamed from Blueprint/schema_policies.sql; unified schema, RLS policies, and initial seeds applied once to a fresh Supabase project, now colocated with the Edge Functions and seeds under carApp/supabase/.
[carApp/supabase/seeds/service_catalog.sql] — Relocated from Blueprint/seeds/service_catalog.sql; same idempotent service_catalog seed, now living alongside the schema under carApp/supabase/seeds/ for re-runnable post-schema seeding.
[carApp/app/(tabs)/more/index.tsx] — Rebuilt the More-tab placeholder into the real hub (Flow 3.3): a profile summary card linking to Account plus grouped navigation rows for Account, Settings, Booking history, Ask Lug, and Provider mode (label adapts to role), keeping the confirm-before-signing-out behaviour.
[carApp/app/(tabs)/more/__tests__/index.test.tsx] — Unit tests for the More hub covering profile summary rendering, per-row navigation routing, the role-adaptive Provider row, and the sign-out confirmation alert.
[carApp/app/(tabs)/more/account.tsx] — Account screen (Flows 3.1/3.2): editable display name + avatar (expo-image-picker → uploadAvatar → updateUser, mirrored into the auth store) and full vehicle CRUD (list/add/edit/delete/set-primary) via a self-contained editor sheet that reuses the vehicle validators without coupling to signUpDraft.
[carApp/app/(tabs)/more/settings.tsx] — Settings screen (Flow 3.2): notification-preference switches backed by the settings store plus Terms/Privacy links and app version; includes a note that push delivery also depends on OS permissions.
[carApp/src/state/settings.ts] — Zustand settings store holding notification preferences, persisted to the device via AsyncStorage (zustand persist middleware) because the users table has no preference columns yet; notify-* Edge Functions should later honor these.
[carApp/app/(tabs)/more/__tests__/account.test.tsx] — Unit tests for the Account screen: vehicle list/empty/error states, name save → updateUser + auth-store update, delete-with-confirm, make-primary swap, editor sheet open, and avatar permission guard.
[carApp/app/(tabs)/more/__tests__/settings.test.tsx] — Unit tests for the Settings screen notification toggles wired to the settings store + app-version rendering.
[carApp/src/state/__tests__/settings.test.ts] — Unit tests for the settings store: defaults, single toggle, partial merge, and reset.
[carApp/app/(tabs)/inbox/index.tsx] — Inbox thread list (Flow 3.4): customer's message threads via getThreadsForCustomer rendered as rows (provider avatar + name + booking-status/date context) with loading/empty/error states and pull-to-refresh; tapping routes to the thread detail.
[carApp/app/(tabs)/inbox/__tests__/index.test.tsx] — Unit tests for the inbox list covering fetch-by-user, row rendering, navigation, support fallback, and empty/error states.
[carApp/app/(tabs)/inbox/[threadId].tsx] — Message thread detail (Flow 3.5): renders message history as mine/theirs bubbles (flagged messages styled), a moderated composer (insertMessage), and a Supabase Realtime subscription (thread:{id}) that refetches on INSERT and cleans up on unmount; native header title is set to the provider's name.
[carApp/app/(tabs)/inbox/__tests__/[threadId].test.tsx] — Unit tests for the thread view: message load/render, realtime subscribe + cleanup, moderated send + optimistic append, whitespace-guard, and error state.
[carApp/src/components/lug/LugThread.tsx] — Lug AI conversation UI (Flow 3.6): local chat history, calls the lug-ai Edge Function via supabase.functions.invoke, graceful error fallback, and the CLAUDE.md-mandated persistent "Talk to a person" escalation CTA that becomes the primary action after two consecutive human-help turns.
[carApp/src/components/lug/LugBubble.tsx] — Persistent floating Lug button (FAB) mounted once in (tabs)/_layout so it overlays every tab; navigates to the full-screen Lug view.
[carApp/app/(tabs)/more/lug.tsx] — Full-screen Lug view hosting LugThread and wiring "Talk to a person" to open a support message thread (no provider attached) in the inbox.
[carApp/supabase/functions/lug-ai/index.ts] — Deno Edge Function proxying Anthropic's Messages API with a CarApp-specific system prompt; trims leading assistant turns, returns { reply }, and fails soft with 503 until ANTHROPIC_API_KEY is set and the function is deployed.
[carApp/app/(tabs)/_layout.tsx] — Wrapped the Tabs navigator in a flex container and mounted <LugBubble/> alongside it so the Lug FAB is persistent across all tab screens.
[carApp/src/components/lug/__tests__/LugThread.test.tsx] — Unit tests for LugThread: greeting, send→invoke→reply, error fallback, human-help detection, escalation promotion after two consecutive requests + counter reset, and the escalation callback.
[carApp/src/components/lug/__tests__/LugBubble.test.tsx] — Unit tests for the Lug FAB navigation (default route + custom onPress).
[carApp/supabase/schema.sql] — Added the create_provider_vetting_row SECURITY DEFINER trigger that seeds a provider_vetting row on provider_profiles insert (Flow 4.1); provider_vetting RLS is UPDATE-only so clients never insert it directly.
[carApp/app/_layout.tsx] — Root auth gate now allows authenticated users to remain in the (provider) route group (the full-screen vetting flow) instead of bouncing them back to (tabs).
[carApp/src/components/provider/VettingStepIndicator.tsx] — Horizontally scrollable vetting progress tracker: numbered circles per step with status-driven colors (approved=green check, submitted=gold, rejected=red) and an optional active highlight; shared by the vetting hub and step screens.
[carApp/src/components/provider/vettingSteps.ts] — Shared config (key/label/route/status-field) for the six vetting steps plus the profile-completeness threshold, imported by the hub and step screens.
[carApp/app/(provider)/_layout.tsx] — Stack layout for the full-screen provider vetting flow (vetting hub + the six step screens), kept outside the bottom tab bar like (auth).
[carApp/app/(provider)/vetting.tsx] — Vetting hub (Flow 4.1): reads the provider profile + provider_vetting, renders the VettingStepIndicator and six tappable step rows with status badges, refreshes on focus, and surfaces the approved banner once verification_status is approved.
[carApp/app/(provider)/identity.tsx, background.tsx, insurance.tsx, credentials.tsx, bank.tsx, profile.tsx] — Placeholder vetting step screens registered in the (provider) stack so the hub navigates without dead links; each is replaced with its real UI in Flows 4.2–4.7.
[carApp/app/(tabs)/more/provider.tsx] — Provider screen (Flow 4.1): "Become a Provider" intro (perks/fees/founding program) + single provider-type pick that creates the provider_profiles row, seeds providerDraft, promotes role→both, and opens the vetting flow; shows in-progress/approved states for existing providers.
[carApp/src/components/provider/__tests__/VettingStepIndicator.test.tsx] — Unit tests for the step indicator (labels render; approved shows a check, others show their index).
[carApp/app/(tabs)/more/__tests__/provider.test.tsx] — Unit tests for the Provider screen: intro + type options, start→insertProviderProfile/role-promotion/navigation, and the in-progress/approved provider states.
[carApp/app/(provider)/__tests__/vetting.test.tsx] — Unit tests for the vetting hub: six step rows with mapped statuses, row→step navigation, approved banner, and the missing-profile error state.
[carApp/src/lib/supabase/queries.ts] — Added getProviderOwnServicePackages (owner-facing service packages query without the is_approved filter) so the provider's service-menu editor can see/manage packages still pending approval.
[carApp/src/components/provider/ServiceMenuEditor.tsx] — Provider service-menu editor (Flows 4.7/5.3): lists packages and adds/edits/deletes via a sheet form, entering prices in dollars and storing integer cents to match the app's money convention; flags unapproved packages as "Pending review".
[carApp/src/components/provider/AvailabilityCalendar.tsx] — Controlled weekly availability picker (day-level) for the provider profile/availability UIs; pure component — persistence awaits a provider_profiles.availability column + type regen.
[carApp/app/(provider)/profile.tsx] — Vetting Profile step (Flow 4.7): bio/coverage/radius persisted via updateProviderProfile, embedded ServiceMenuEditor + AvailabilityCalendar, and recomputes provider_vetting.profile_completeness on save.
[carApp/src/components/provider/__tests__/AvailabilityCalendar.test.tsx] — Unit tests for the availability picker (renders 7 days; toggles on/off via onChange).
[carApp/src/components/provider/__tests__/ServiceMenuEditor.test.tsx] — Unit tests for the service-menu editor: list + formatted price, add storing dollars→cents, and the pending-review badge.
[carApp/app/(provider)/__tests__/profile.test.tsx] — Unit tests for the Profile step: loads the profile, saves fields, and recomputes profile_completeness (100) before navigating back.
[carApp/src/components/provider/CredentialUpload.tsx] — Reusable vetting document uploader (Flows 4.2/4.4/4.5): picks an image via expo-image-picker and uploads to the private vetting-documents bucket through uploadVettingDocument, reporting the stored path back to the host step.
[carApp/src/components/provider/VettingUploadStep.tsx] — Shared body for upload-based vetting steps (insurance, credentials): loads provider + current status, renders CredentialUpload, and sets the relevant *_status to 'submitted' on upload for manual admin approval.
[carApp/app/(provider)/insurance.tsx] — Vetting Insurance step (Flow 4.4): thin wrapper over VettingUploadStep for insurance_status.
[carApp/app/(provider)/credentials.tsx] — Vetting Credentials step (Flow 4.5): thin wrapper over VettingUploadStep for credentials_status.
[carApp/src/components/provider/__tests__/CredentialUpload.test.tsx] — Unit tests for the uploader: permission-denied guard and successful pick→upload→onUploaded path.
[carApp/src/components/provider/__tests__/VettingUploadStep.test.tsx] — Unit tests for the shared upload step: renders title/status and flips status to submitted after upload.
[carApp/src/components/provider/VettingActionStep.tsx] — Shared body for action-based vetting steps (background, bank): loads provider + status, renders an explanation + primary action button, and reflects the status the host's onAction resolves to (or alerts on error).
[carApp/src/lib/persona/index.ts] — STUB Persona identity-verification client (startPersonaInquiry → not configured) pending PERSONA_API_KEY + SDK; the Identity step falls back to manual ID-photo upload until then.
[carApp/supabase/functions/persona-webhook/index.ts] — STUB Deno webhook that maps Persona inquiry status → provider_vetting.identity_status; 503 until PERSONA_WEBHOOK_SECRET is set.
[carApp/app/(provider)/identity.tsx] — Vetting Identity step (Flow 4.2): manual government-ID photo upload via VettingUploadStep (identity_status → submitted); automated Persona path arrives when configured.
[carApp/src/lib/checkr/index.ts] — STUB Checkr background-check client (startBackgroundCheck → not configured) pending CHECKR_API_KEY; the Background step records consent and marks submitted.
[carApp/supabase/functions/checkr-webhook/index.ts] — STUB Deno webhook that maps Checkr report status → provider_vetting.background_status; 503 until CHECKR_WEBHOOK_SECRET is set.
[carApp/app/(provider)/background.tsx] — Vetting Background step (Flow 4.3): consent button → background_status submitted via VettingActionStep; real report runs server-side once Checkr is wired.
[carApp/src/lib/stripe/connect.ts] — STUB Stripe Connect onboarding client (startConnectOnboarding → not configured), kept separate from stripe/index.ts; the Bank step shows "not set up yet" until the Connect platform is configured.
[carApp/app/(provider)/bank.tsx] — Vetting Bank step (Flow 4.6): "Connect with Stripe" via VettingActionStep; opens hosted onboarding + saves stripe_account_id once Connect is configured.
[carApp/src/components/provider/__tests__/VettingActionStep.test.tsx] — Unit tests for the action step: runs onAction and reflects status; alerts and preserves status on error.
[carApp/src/lib/__tests__/vetting-stubs.test.ts] — Guards that the persona/checkr/stripe-connect integration stubs report not-configured until wired.
[carApp/src/state/auth.ts] — Added providerVerification (provider_profiles.verification_status) + setProviderVerification to the auth store (reset by clear) so the root gate can hold unapproved provider-only accounts.
[carApp/app/_layout.tsx] — Flow 4.8 gate: hydrates providerVerification for provider/both roles and holds provider-only-unapproved users on pending-approval (allowing the (provider) vetting flow), closing the unapproved-provider routing gap; hybrid 'both' users keep customer access.
[carApp/app/(auth)/pending-approval.tsx] — Added a "Continue your application" button routing to /(provider)/vetting so held provider-only accounts can finish vetting.
[carApp/src/components/booking/StatusTimeline.tsx] — Horizontal 5-step booking lifecycle indicator (pending → confirmed → en_route → in_progress → completed); renders a single "Cancelled" pill for cancelled bookings. Used by the booking detail screen.
[carApp/src/components/booking/__tests__/StatusTimeline.test.tsx] — Unit tests for StatusTimeline: verifies step labels, accessibilityValue progression for each status, cancelled-state rendering, and unknown-status fallback to step 0.
[carApp/app/(tabs)/bookings/[id].tsx] — Booking detail screen (Flow 2.4 post-success + Flow 2.6): renders provider header, StatusTimeline, schedule/vehicle/address/notes, PriceBreakdown, DepositSummary, and wires Track/Message/Reschedule/Cancel — Cancel within 24h forfeits the deposit per CLAUDE.md.
[carApp/app/(tabs)/bookings/past.tsx] — Past bookings screen (Flow 2.7): completed/cancelled history with status pills and a "Book Again" CTA that routes back into the booking flow for the same provider.
[carApp/src/lib/location/index.ts] — Location utilities (Flow 2.8): Haversine distanceKm/Miles, bearingDegrees, ETA estimate with configurable speed, formatters, and regionForPoints helper for map fitting.
[carApp/src/lib/location/__tests__/location.test.ts] — Unit tests for the location lib (20 cases): distance, bearing, ETA edge cases, formatters, region-fitting minimum deltas.
[carApp/src/components/tracking/JobStatusBar.tsx] — Status pill bar overlaid on the tracking map (Flow 2.8); color-coded by booking lifecycle state with provider name on the left.
[carApp/src/components/tracking/ETADisplay.tsx] — Bottom ETA card on the tracking screen (Flow 2.8): ETA / distance / last-updated rendering; falls back to a "waiting for provider's location" state when no GPS fix yet.
[carApp/src/components/tracking/LiveMap.tsx] — Live tracking map (Flow 2.8) using react-native-maps + OpenStreetMap UrlTile (no Google Maps key); auto-fits camera to provider + destination pins.
[carApp/app/(tabs)/bookings/tracking/[bookingId].tsx] — Live tracking screen (Flow 2.8): polls provider_location_cache every 5s, renders LiveMap + JobStatusBar + ETADisplay, and provides Message Provider CTA.
[carApp/src/lib/notifications/push.ts] — FCM client (Flow 2.9): permission/token registration, refresh subscription, foreground + background message handlers, deep-link routing per CLAUDE.md push → screen map.
[carApp/supabase/functions/_shared/fcm.ts] — Shared FCM sender used by every notify-* Edge Function; uses Legacy HTTP API with FCM_SERVER_KEY secret and also records an in-app row in `notifications`.
[carApp/supabase/functions/notify-booking-confirmed/index.ts] — Edge Function (Flow 2.9): fans out a "booking confirmed" push to both the customer and the provider after the deposit lands.
[carApp/supabase/functions/notify-provider-enroute/index.ts] — Edge Function (Flow 2.9): notifies the customer when the provider taps "On My Way" and the booking transitions to en_route; deep-links to the live tracking screen.
[carApp/supabase/functions/notify-job-complete/index.ts] — Edge Function (Flow 2.9): sends a "Rate your provider" push to the customer when the booking completes; deep-links back to the booking detail with the review sheet open.
[carApp/src/components/booking/BookingPhotoGallery.tsx] — Before/after photo gallery (Flow 2.10): groups uploaded photos by type, renders horizontal scrolling thumbs, opens full-screen lightbox on tap.
[carApp/src/components/kudos/KudosBadgeSelector.tsx] — Interactive kudos picker (Flow 2.11) used in the rating sheet; multi-select with optional max, plus kudosToStorage/kudosFromStorage mappers between display names and the snake_case DB enum.
[carApp/src/components/kudos/KudosDisplay.tsx] — Read-only kudos badge summary (Flow 2.11) that aggregates raw rows or accepts pre-counted maps; used on provider profiles and post-rating confirmation.
[carApp/src/components/booking/ReviewSheet.tsx] — Post-service review sheet (Flow 2.11): wraps GearRating + KudosBadgeSelector + 500-char review text; emits structured ReviewSubmission to the parent.
[carApp/supabase/schema.sql] — Added users.fcm_token / fcm_token_platform / fcm_token_updated_at columns (Flow 2.9); apply as ALTER on the live DB then rerun `supabase gen types typescript ...`.
[carApp/src/lib/supabase/mutations.ts] — Added updateUserPushToken (Flow 2.9) — typed FCM token writer; uses a localized `as never` cast until generated supabase.ts types include the new columns.
[carApp/src/lib/stripe/index.ts] — Added refundDeposit() (Flow 2.12) — invokes the stripe-webhook `refund_deposit` action so the cancel flow can refund the deposit on non-forfeit cancellations.
[carApp/supabase/functions/stripe-webhook/index.ts] — Added `refund_deposit` action (Flow 2.12): looks up the succeeded deposit payment, issues a Stripe refund, marks the original payment refunded and inserts a refund row; idempotent.
[carApp/app/(tabs)/more/provider-manage.tsx] — Provider profile management screen (Flows 5.2/5.3): edits bio/coverage/radius, persists weekly availability, and hosts ServiceMenuEditor for approved providers; reached from More → Provider.
[carApp/app/(tabs)/bookings/job/[bookingId].tsx] — Provider active-job screen (Flows 5.4/5.5/5.6): job lifecycle buttons (Start Travel → Arrived → Complete), 5s GPS streaming, before/after photo capture, and balance capture on completion.
[carApp/src/components/provider/JobPhotoCapture.tsx] — Before/after photo capture (Flow 5.5): expo-image-picker camera/library → uploadBookingPhoto → signed URL → insertBookingPhoto.
[carApp/src/lib/location/tracking.ts] — sendProviderLocation (Flow 5.4): client GPS sender that invokes the update-provider-location Edge Function (keeps the app off provider_location_cache directly).
[carApp/supabase/functions/update-provider-location/index.ts] — Edge Function (Flow 5.4): verifies the caller owns the provider profile, then upserts provider_location_cache with the service role.
[carApp/supabase/functions/stripe-webhook/index.ts] — Added capture_balance action (Flow 5.6): off-session charge of the remaining 85%, records a balance payment, completes the booking, queues the provider payout; deposit intent now saves the card via setup_future_usage.
[carApp/src/components/provider/EarningsDashboard.tsx] — Provider earnings summary (Flow 5.7): paid + pending payout totals and a dated payout history list from getPayoutsByProvider.
[carApp/app/(tabs)/more/provider-earnings.tsx] — Provider earnings + kudos screen (Flows 5.7/5.8): hosts EarningsDashboard and a KudosDisplay history of customer kudos.
[carApp/app/(tabs)/more/provider.tsx] — Approved providers now get a dashboard hub (Flow 5.1) with rows into My Jobs, Services & Availability, and Earnings & Kudos.
[carApp/supabase/functions/notify-payout-processed/index.ts] — Edge Function (Flow 5.7): pushes "Payout sent" to the provider when a payout is paid.
[carApp/supabase/functions/notify-kudos-received/index.ts] — Edge Function (Flow 5.8): pushes "You earned a kudos" to the provider on kudos insert; deep-links to More → Provider.
