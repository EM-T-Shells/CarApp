# CarApp Architecture

## Stack

The table below reflects the **target** architecture. Items marked **(planned)** are not yet wired into the app — see [Claude.md §Tech Stack](Claude.md) for the current installed vs. planned breakdown before importing or referencing.

| Layer | Technology | Notes |
|---|---|---|
| Mobile Framework | Expo / React Native | Managed workflow |
| Language | TypeScript (strict) | Strict mode enabled |
| Routing | Expo Router | File-based, like Next.js |
| Backend / DB | Supabase (PostgreSQL) | Auth, DB, Storage, Realtime, Edge Functions |
| Caching / Ephemeral | Redis | Live GPS, rate limiting, short-lived tokens **(planned — `ioredis` approved, not yet implemented)** |
| Auth Storage | Expo Secure Store | Encrypted session persistence |
| OAuth | Expo Auth Session + Web Browser | Google & Apple SSO |
| Payments | Stripe Connect | Deposits, split payments, payouts, 1099s |
| Push Notifications | Firebase Cloud Messaging | iOS + Android push |
| Maps / Geo | `react-native-maps` + OpenStreetMap `<UrlTile>` | Google Maps is **out for MVP** due to billing (no API key). Live tracking is built: `LiveMap.tsx` renders OSM tiles; distance/bearing/ETA math in `src/lib/location/` (Haversine, constant-speed ETA). Forward geocoding (`geocodeAddress`) uses OSM **Nominatim** (no key, US-biased) — resolves the customer's searched location and provider `coverage_area` to lat/lng for distance-sorted provider search |
| Global State | Zustand | auth, search, bookingDraft, signUpDraft, providerDraft |
| Localized State | React Context | Feature-scoped trees only (forms, modals) |
| Styling | React Native `StyleSheet` + design tokens | **(planned: NativeWind + Tailwind CSS — not yet wired)** |
| Analytics | Mixpanel | **(planned — not yet installed)** Funnel analysis, retention |
| Error Monitoring | Sentry | **(planned — not yet installed)** Crash reporting, performance |
| Identity Verification | Persona | Provider identity checks |
| Background Checks | Checkr | Provider background screening |
| OTP Auth | Supabase Auth (built-in) | Email and phone one-time password via Supabase's OTP API |
| SMS Provider | Twilio | Phone OTP delivery — configured at Supabase project level, not in app code |
| AI / LLM | Anthropic Claude API | Lug AI assistant (via Edge Function) |

---

## Folder Structure
CarApp/                                   # Git repo root
├── Blueprint/                            # Schema, policies, dependencies, build plan docs
├── ARCHITECTURE.md
├── Claude.md
├── .claudeignore
├── admin/                               # Desktop web admin panel (Blocker #9) — Vite + React SPA
│   ├── src/
│   │   ├── pages/                       # Login, Queue, ProviderDetail
│   │   ├── lib/                         # supabase.ts (anon key), api.ts (queue + reviewProvider)
│   │   ├── auth.tsx                     # AuthProvider: session + is_admin gate
│   │   ├── types.ts                     # type-imports carApp/src/types/supabase.ts (single source)
│   │   └── App.tsx                      # RequireAdmin routes
│   └── e2e/vetting.spec.ts             # Playwright (hermetic)
└── carApp/                               # Expo app root
    ├── app/ 
    │   ├── _layout.tsx                   # Root auth gate 
    │   ├── +not-found.tsx                # 404 fallback route 
    │   ├── (auth)/ 
    │   │   ├── index.tsx                 # Landing / entry for signed-out users 
    │   │   ├── sign-in.tsx               # Google + Apple SSO + Email/Phone OTP 
    │   │   ├── otp-entry.tsx             # OTP code input screen (email + phone)
    │   │   ├── otp-verify.tsx            # OTP verification + session handoff
    │   │   ├── pending-approval.tsx      # Provider awaiting vetting approval 
    │   │   └── onboarding/               # Customer multi-step signup (signUpDraft) 
    │   │       ├── role.tsx              #   role selection (customer / provider / both) 
    │   │       ├── profile.tsx          #   name / contact 
    │   │       ├── vehicle.tsx          #   primary vehicle (customer path) 
    │   │       └── review.tsx           #   confirm + insert users row 
    │   ├── (provider)/                   # Full-screen provider vetting flow (outside tabs) 
    │   │   ├── _layout.tsx 
    │   │   ├── vetting.tsx               # Vetting hub — 6 steps + statuses 
    │   │   ├── identity.tsx             # Persona (stub → manual gov-ID upload) 
    │   │   ├── background.tsx           # Checkr (stub) 
    │   │   ├── insurance.tsx            # Insurance doc upload 
    │   │   ├── credentials.tsx          # IDA / ASE cert upload 
    │   │   ├── bank.tsx                 # Real Stripe Connect Express onboarding 
    │   │   └── profile.tsx              # Bio / coverage / services / availability 
    │   ├── (tabs)/                       # Customer dashboard (mounted for customers + 'both' in customer mode) 
    │       ├── _layout.tsx               # 5-tab bar config (Search, Services, Bookings, Inbox, More) 
    │       ├── search/ 
    │       │   ├── index.tsx 
    │       │   ├── location.tsx             # Location picker overlay (current location / anywhere / recents / popular areas) 
    │       │   ├── results.tsx 
    │       │   ├── provider/[id].tsx 
    │       │   └── book/[providerId].tsx 
    │       ├── services/ 
    │       │   ├── index.tsx                # Catalog browse (Detailing / Mechanical); tap a service → provider list 
    │       │   └── [catalogId].tsx          # Providers offering the tapped service (getProvidersByService → ProviderCard) 
    │       ├── bookings/                 # Customer bookings only (provider jobs live in (provider-tabs)) 
    │       │   ├── index.tsx 
    │       │   ├── past.tsx 
    │       │   ├── [id].tsx                # Customer booking detail + cancel 
    │       │   └── tracking/[bookingId].tsx 
    │       ├── inbox/ 
    │       │   ├── index.tsx 
    │       │   └── [threadId].tsx          # Shared thread detail (reused by (provider-tabs) inbox) 
    │       └── more/ 
    │           ├── index.tsx               # Hosts the "Switch to Provider Dashboard" control (dual-role only) 
    │           ├── account.tsx 
    │           ├── provider.tsx           # Provider opt-in intro / application status (approved → redirect to (provider-tabs)) 
    │           ├── settings.tsx 
    │           └── lug.tsx                 # (ops admin is the separate web app in /admin, not a screen here) 
    │   └── (provider-tabs)/               # Provider dashboard (mounted for approved providers + 'both' in provider mode) 
    │       ├── _layout.tsx               # 4-tab bar config (Jobs, Inbox, Earnings, More) 
    │       ├── jobs/ 
    │       │   ├── index.tsx              # Active job queue 
    │       │   ├── past.tsx               # Past jobs history 
    │       │   └── [bookingId].tsx        # Provider active-job lifecycle (accept/decline, photos, complete, no-show) 
    │       ├── inbox/ 
    │       │   └── index.tsx              # Provider thread list → shared (tabs)/inbox/[threadId] detail 
    │       ├── earnings/ 
    │       │   └── index.tsx              # Earnings + payout list + kudos 
    │       └── more/ 
    │           ├── index.tsx              # Provider hub + "Switch to Customer Dashboard" control 
    │           └── manage.tsx             # Manage services + availability 
    ├── src/ 
    │   ├── lib/ 
    │   │   ├── supabase/ 
    │   │   │   ├── client.ts             # Supabase singleton 
    │   │   │   ├── auth.ts               # signIn, signOut, OAuth + OTP helpers 
    │   │   │   ├── queries.ts            # All SELECT operations 
    │   │   │   ├── mutations.ts          # All INSERT / UPDATE operations 
    │   │   │   └── storage.ts            # File uploads (photos, identity docs) 
    │   │   ├── redis/ 
    │   │   │   └── index.ts              # GPS caching / tokens — EMPTY STUB (deferred, do not import) 
    │   │   ├── stripe/ 
    │   │   │   ├── index.ts              # Payment intents, deposit/balance capture, refunds 
    │   │   │   └── connect.ts            # Stripe Connect onboarding + status 
    │   │   ├── checkr/ 
    │   │   │   └── index.ts              # Background check — STUB (awaits CHECKR_API_KEY) 
    │   │   ├── persona/ 
    │   │   │   └── index.ts              # Identity verification — STUB (awaits PERSONA_API_KEY) 
    │   │   ├── notifications/ 
    │   │   │   └── push.ts               # Firebase Cloud Messaging 
    │   │   └── location/ 
    │   │       └── index.ts              # Geocoding, distance calc, GPS helpers 
    │   ├── state/                        # Zustand stores (no React Context for app state) 
    │   │   ├── auth.ts                   # Session, users row, role, provider verification status 
    │   │   ├── search.ts                 # Provider search filters + results 
    │   │   ├── bookingDraft.ts           # In-progress booking builder 
    │   │   ├── signUpDraft.ts            # Customer multi-step registration state 
    │   │   ├── providerDraft.ts          # Provider onboarding multi-step form state 
    │   │   ├── settings.ts               # Notification prefs (AsyncStorage-persisted) 
    │   │   └── mode.ts                    # Active dashboard (customer|provider) for dual-role users (AsyncStorage-persisted) 
    │   ├── types/ 
    │   │   ├── models.ts                 # Domain TypeScript interfaces 
    │   │   ├── supabase.ts               # Auto-generated Supabase types — never edit manually 
    │   │   └── navigation.ts             # Expo Router typed params 
    │   ├── utils/ 
    │   │   ├── validators.ts             # Form validation + content moderation 
    │   │   ├── money.ts                  # Cents ↔ display formatting 
    │   │   └── date.ts                   # ISO string parsing and formatting 
    │   ├── components/ 
    │   │   ├── ui/                       # Button, Text, TextField, Card, Avatar, Rating, Sheet, Spacer, GearRating, KudosBadge 
    │   │   ├── search/                   # LocationSearchBar, LocationSuggestionRow, ProviderCarousel, ProviderCard, ProvidersMap, FiltersSheet 
    │   │   ├── booking/                  # DateTimePicker, AddressPicker, PriceBreakdown, DepositSummary, StatusTimeline, ReviewSheet, BookingPhotoGallery 
    │   │   ├── tracking/                 # LiveMap, JobStatusBar, ETADisplay 
    │   │   ├── provider/                 # CredentialUpload, AvailabilityCalendar, VettingStepIndicator, VettingUploadStep, VettingActionStep, ServiceMenuEditor, EarningsDashboard, JobPhotoCapture 
    │   │   ├── kudos/                    # KudosBadgeSelector, KudosDisplay 
    │   │   ├── lug/                      # LugBubble, LugThread 
    │   │   └── auth/                     # StepIndicator, OnboardingHeader, RoleSelector, ServicePicker, VehicleForm 
    │   └── design/ 
    │       ├── theme.ts 
    │       ├── tokens.ts                 # All color, spacing, radius tokens — source of truth 
    │       └── typography.ts 
    ├── supabase/ 
    │   └── functions/                    # Edge Functions (Deno runtime — not Node) — 14 total 
    │       ├── _shared/                   # fcm.ts, email.ts (Resend), webhookSignature.ts (HMAC verify), shared helpers 
    │       ├── stripe-webhook/            # Payment engine: intents, capture, refunds, accept/decline, cancel, no-show, Connect, payouts 
    │       ├── admin-review-provider/     # Service-role provider approve/reject + Resend email 
    │       ├── checkr-webhook/            # STUB (awaits CHECKR_API_KEY) — HMAC signature verified via _shared/webhookSignature.ts 
    │       ├── persona-webhook/           # STUB (awaits PERSONA_API_KEY) — HMAC signature verified via _shared/webhookSignature.ts 
    │       ├── notify-booking-requested/  # Deposit → provider 2h-window request + customer "sent" 
    │       ├── notify-booking-confirmed/ 
    │       ├── notify-booking-declined/   # Decline / expiry refund notice 
    │       ├── notify-booking-cancelled/  # Cancel / no-show notice 
    │       ├── notify-provider-enroute/ 
    │       ├── notify-job-complete/ 
    │       ├── notify-payout-processed/ 
    │       ├── notify-kudos-received/ 
    │       ├── update-provider-location/  # Provider GPS write path → provider_location_cache (Flow 5.4) 
    │       └── lug-ai/                     # Anthropic Claude proxy (503 until ANTHROPIC_API_KEY) 
    ├── e2e/                              # Maestro E2E flows 
    └── assets/ 
        ├── fonts/ 
        └── images/ 


---

## Data Models

Full schema and RLS policies live in `carApp/supabase/schema.sql` — that is the source of truth. Re-runnable seed scripts live in `carApp/supabase/seeds/`.

All tables live in Supabase (PostgreSQL). TypeScript types are in `src/types/models.ts`.
`src/types/supabase.ts` is auto-generated — never edit manually.

---

### Entity Relationship Overview

```
provider_types                  (admin-managed: 'DETAILER', 'MECHANIC')
service_catalog                 (admin-managed preset service list, scoped by provider_type)

users
├── vehicles                    (1:many — customer vehicles)
├── provider_profiles           (1:1 — opt-in provider mode; `base_lat`/`base_lng` = geocoded base from `coverage_area`, powers distance-sorted search)
│     ├── provider_vetting      (1:1 — vetting step statuses: identity, background, insurance, credentials, bank)
│     ├── service_packages      (1:many — provider's offered services, linked to service_catalog)
│     ├── provider_location_cache (1:1 — last known GPS position; live GPS in Redis)
│     └── payouts               (1:many — provider payout per booking)
├── bookings                    (as customer or provider)
│     ├── booking_photos        (1:many — before/after photos)
│     ├── payments              (1:many — deposit, balance, refund)
│     ├── ratings               (1:1 per reviewer — 4-dimension gear rating)
│     └── kudos                 (1:many — freeform positive badges)
├── message_threads             (as customer or provider)
│     └── messages
├── notifications
├── subscriptions               (recurring bookings with a provider)
└── promo_redemptions
     └── promotions             (referral, gift_card, discount)
```

### Auth Flow 

App Launch
     │
     ▼
app/_layout.tsx — onAuthStateChange
     │
     ├── No session ──► app/(auth)/sign-in
     │                        │
     │              ┌─────────┴─────────┐
     │              │                   │
     │     Google / Apple OAuth    Email/Phone OTP
     │              │                   │
     │              │          otp-entry.tsx (enter email/phone)
     │              │                   │
     │              │          Supabase Auth signInWithOtp
     │              │                   │
     │              │          otp-verify.tsx (enter OTP code)
     │              │                   │
     │              └─────────┬─────────┘
     │                        │
     │              Supabase Auth ──► session stored in SecureStore
     │                        │
     │              isNewUser check
     │                  ├── New user ──► multi-step onboarding (signUpDraft)
     │                  │                    └── role selection
     │                  │                         ├── Customer → vehicle setup → (tabs)/
     │                  │                         └── Provider → providerDraft → vetting flow → pending-approval
     │                  └── Existing user ──► (tabs)/
     │
     └── Has session ──► role + activeMode gate (app/_layout.tsx §useProtectedRoute)
                              │
                         ├── customer ───────────────► (tabs)/          [Search, Services, Bookings, Inbox, More]
                         ├── provider (approved) ────► (provider-tabs)/ [Jobs, Inbox, Earnings, More]
                         └── both:
                              ├── activeMode 'customer' ──► (tabs)/
                              └── activeMode 'provider' & approved ──► (provider-tabs)/
                                   (switch via the "Switch Dashboard" control in either More hub)

---

## Key Design Decisions

- **Dual-role users & isolated dashboards**: All users default to Customer. Provider mode is opt-in post-signup (`role` column supports `'customer'`, `'provider'`, `'both'`). A user can be both simultaneously, but the two personas get **fully separate tab bars** — the customer `(tabs)` group and the provider `(provider-tabs)` group — so a screen never blends customer and provider actions. `activeMode` (`src/state/mode.ts`, persisted, `customer` | `provider`) chooses which group a `'both'` user is mounted into; it is only consulted for `'both'` accounts. A `'both'` user flips it via the "Switch Dashboard" control in either More hub, which sets `activeMode` and `router.replace`s into the other group. Pure `customer`/`provider` accounts have no switcher (a single fixed destination).
- **Provider vetting gate**: A provider must pass all 6 vetting steps (identity via Persona, background check via Checkr, insurance, credentials, bank account via Stripe Connect, profile completeness ≥ 80%) before `verification_status` is set to `approved`. Until approved, the provider cannot receive bookings. **Routing (by design, `app/_layout.tsx` §useProtectedRoute):** a pure `provider` account with `verification_status != 'approved'` is held on `/(auth)/pending-approval` (or inside the `(provider)` vetting flow) on every session resume — the null-guard waits for status so the tabs never flash. A hybrid `'both'` account is **intentionally not blocked** — because they are also a customer, they pass through to the customer tabs and finish vetting at their own pace from More → Provider; the gate only mounts `(provider-tabs)` for a `'both'` user once `activeMode === 'provider'` **and** they are approved.
- **Service snapshots**: Services are snapshotted as JSONB in the `bookings.services` column at booking time. Price or name changes by providers never alter existing bookings.
- **Deposit model**: 15% of booking total collected at booking via Stripe; remainder captured on job completion.
- **Cancellation policy** (server-enforced in the `stripe-webhook` Edge Function — the client never decides the refund amount): customer cancels ≤24h before scheduled time → `$15` flat late-cancel fee retained, remainder of the deposit refunded (>24h → full refund); provider cancels ≤24h → full customer refund + `$25` penalty recorded on the booking (ops deducts from a future payout); customer no-show → provider marks No Show, customer forfeits the full amount. Columns: `cancellation_fee`, `cancelled_by`, `no_show_at`; `no_show` is a `bookings.status` value.
- **Fee structure**: Provider platform fee is **3%** (`platform_fee_rate` default `0.030`). Founding Providers — the first 100 approved, controlled by `is_founding_provider` — pay **0% for 90 days** (`founding_provider_expires_at`), then auto-convert to 3% via a daily `pg_cron` sweep. Enrollment is a DB trigger on the transition to `verification_status = 'approved'` under an advisory lock (100-provider cap, race-safe). Customer service fee is 2% added at checkout.
- **Live GPS architecture**: Provider location updates every 5 seconds during active bookings. The app never writes `provider_location_cache` directly — the provider app (`src/lib/location/tracking.ts`) posts each fix to the `update-provider-location` Edge Function, which verifies ownership and upserts the row with the service role (Flow 5.4). Redis (live cache + TTL) is deferred; the Edge Function persists straight to Postgres for now, and the same contract holds when Redis is added. Customers with an active booking (`en_route` or `in_progress`) read the cached location via RLS by polling `getProviderLocation` every 5s.
- **Content moderation**: ALL outbound messages must pass through `containsFlaggedContent()` in `validators.ts` before insert. Flagged content **blocks the send** — `insertMessage()` throws `FlaggedContentError` and never inserts (no sanitized copy is stored); the thread screen surfaces an inline warning and preserves the draft so the sender can edit. Auto-detection of phone numbers, email addresses, and external payment handles ('Venmo me') triggers the block. (The legacy `is_flagged` bubble styling now only renders pre-existing flagged rows. Server-side RLS/trigger enforcement of API-direct sends is a noted follow-on.)
- **Kudos vs Gear Ratings**: Kudos are freeform positive badges (`'meticulous'`, `'reliable'`, `'magic_hands'`, `'great_value'`, `'fast_worker'`, `'communicator'`) stored in the `kudos` table. Gear ratings are structured 4-dimension scores (Quality, Timeliness, Communication, Value — 1–5 each) stored in `ratings` with a weighted composite `overall_score`. Both are tied to a booking but serve different purposes.
- **Dispute window**: 48 hours post-service for either party to flag a rating for admin review (`dispute_window_end` in `ratings`).
- **RLS everywhere**: Every table has Row Level Security enabled. Queries must work under the correct Supabase auth role. See `carApp/supabase/schema.sql` for all policies.
- **Admin panel (Blocker #9)**: A separate desktop web surface (`/admin`, Vite + React SPA) — not the RN app. It shares the same Supabase project + generated types, so a decision there flips the same row the app reads. Admins are identified by `users.is_admin` (allowlist) and the `is_admin()` SECURITY DEFINER helper; admins get read-all RLS on `provider_profiles`/`provider_vetting`/`users` for the queue. The privileged approve/reject **write** never happens from the client — it goes through the `admin-review-provider` Edge Function (service role), which re-verifies the caller is an admin, sets `verification_status` (+ founding trigger) and `provider_vetting` audit fields, and emails the provider via Resend (`_shared/email.ts`). This is the seed for the later server-side refund/dispute admin tools.
- **Lug AI**: Lug is powered by the Anthropic Claude API via the `lug-ai` Edge Function. Responses are constrained by a system prompt referencing the CarApp service catalog. Always provides a human escalation path.

---

## Post-MVP (Do Not Build Now)

These features are planned but explicitly out of scope for the initial build. Do not implement unless instructed.

- Recurring subscription bookings (schema exists in `subscriptions` table but UI/logic is deferred)
- Provider subscription tiers (Basic / Pro / Elite)
- Mechanics expansion (Phase 1b — `provider_types` supports it, but only detailing flows are built)
- Lug 2.0 proactive push alerts
- Geographic expansion beyond NoVA / DC Metro
- CarApp Care membership
- Offline resilience (queuing, optimistic UI, local caching)