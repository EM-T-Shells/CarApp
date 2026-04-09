# CarApp Architecture

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile Framework | Expo / React Native | Managed workflow |
| Language | TypeScript (strict) | Strict mode enabled |
| Routing | Expo Router | File-based, like Next.js |
| Backend / DB | Supabase (PostgreSQL) | Auth, DB, Storage, Realtime, Edge Functions |
| Caching / Ephemeral | Redis | Live GPS, rate limiting, short-lived tokens |
| Auth Storage | Expo Secure Store | Encrypted session persistence |
| OAuth | Expo Auth Session + Web Browser | Google & Apple SSO |
| Payments | Stripe Connect | Deposits, split payments, payouts, 1099s |
| Push Notifications | Firebase Cloud Messaging | iOS + Android push |
| Maps / Geo | Google Maps SDK + react-native-maps | Live tracking, navigation, radius search |
| Global State | Zustand | auth, search, bookingDraft, signUpDraft, providerDraft |
| Localized State | React Context | Feature-scoped trees only (forms, modals) |
| Styling | NativeWind + Tailwind CSS | Utility-first styling for React Native |
| Analytics | Mixpanel | Funnel analysis, retention |
| Error Monitoring | Sentry | Crash reporting, performance |
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
├── CLAUDE.md
├── .claudeignore
└── carApp/                               # Expo app root
    ├── app/ 
    │   ├── _layout.tsx                   # Root auth gate 
    │   ├── (auth)/ 
    │   │   ├── sign-in.tsx               # Google + Apple SSO + Email/Phone OTP 
    │   │   ├── otp-entry.tsx             # OTP code input screen (email + phone)
    │   │   ├── otp-verify.tsx            # OTP verification + session handoff
    │   │   └── pending-approval.tsx      # Provider awaiting vetting approval 
    │   └── (tabs)/ 
    │       ├── _layout.tsx               # 5-tab bar config 
    │       ├── search/ 
    │       │   ├── index.tsx 
    │       │   ├── results.tsx 
    │       │   ├── provider/[id].tsx 
    │       │   └── book/[providerId].tsx 
    │       ├── services/ 
    │       │   └── index.tsx 
    │       ├── bookings/ 
    │       │   ├── index.tsx 
    │       │   ├── past.tsx 
    │       │   ├── [id].tsx 
    │       │   └── tracking/[bookingId].tsx 
    │       ├── inbox/ 
    │       │   ├── index.tsx 
    │       │   └── [threadId].tsx 
    │       └── more/ 
    │           ├── index.tsx 
    │           ├── account.tsx 
    │           ├── provider.tsx 
    │           ├── settings.tsx 
    │           ├── lug.tsx 
    │           └── admin.tsx 
    ├── src/ 
    │   ├── lib/ 
    │   │   ├── supabase/ 
    │   │   │   ├── client.ts             # Supabase singleton 
    │   │   │   ├── auth.ts               # signIn, signOut, OAuth + OTP helpers 
    │   │   │   ├── queries.ts            # All SELECT operations 
    │   │   │   ├── mutations.ts          # All INSERT / UPDATE operations 
    │   │   │   └── storage.ts            # File uploads (photos, identity docs) 
    │   │   ├── redis/ 
    │   │   │   └── index.ts              # GPS caching, rate limiting, short-lived tokens 
    │   │   ├── stripe/ 
    │   │   │   └── index.ts              # Connect, payment intents, payouts 
    │   │   ├── checkr/ 
    │   │   │   └── index.ts              # Background check webhook handling 
    │   │   ├── persona/ 
    │   │   │   └── index.ts              # Identity verification flow 
    │   │   ├── notifications/ 
    │   │   │   └── push.ts               # Firebase Cloud Messaging 
    │   │   └── location/ 
    │   │       └── index.ts              # Geocoding, distance calc, GPS helpers 
    │   ├── state/ 
    │   │   ├── auth.ts                   # Authenticated user + session 
    │   │   ├── search.ts                 # Provider search filters + results 
    │   │   ├── bookingDraft.ts           # In-progress booking builder 
    │   │   ├── signUpDraft.ts            # Customer multi-step registration state 
    │   │   └── providerDraft.ts          # Provider onboarding multi-step form state 
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
    │   │   ├── search/                   # LocationSearchBar, ProviderCard, FiltersSheet 
    │   │   ├── booking/                  # DateTimePicker, AddressPicker, PriceBreakdown, DepositSummary 
    │   │   ├── tracking/                 # LiveMap, JobStatusBar, ETADisplay 
    │   │   ├── provider/                 # CredentialUpload, AvailabilityCalendar, VettingStepIndicator, ServiceMenuEditor, EarningsDashboard 
    │   │   ├── kudos/                    # KudosBadgeSelector, KudosDisplay 
    │   │   ├── lug/                      # LugBubble, LugThread 
    │   │   └── auth/                     # StepIndicator, RoleSelector, ServicePicker, VehicleForm 
    │   └── design/ 
    │       ├── theme.ts 
    │       ├── tokens.ts                 # All color, spacing, radius tokens — source of truth 
    │       └── typography.ts 
    ├── supabase/ 
    │   └── functions/                    # Edge Functions (Deno runtime — not Node) 
    │       ├── stripe-webhook/ 
    │       ├── checkr-webhook/ 
    │       ├── persona-webhook/ 
    │       ├── notify-booking-confirmed/ 
    │       ├── notify-provider-enroute/ 
    │       ├── notify-job-complete/ 
    │       ├── notify-payout-processed/ 
    │       ├── notify-kudos-received/ 
    │       └── lug-ai/ 
    ├── e2e/                              # Maestro E2E flows 
    └── assets/ 
        ├── fonts/ 
        └── images/ 


---

## Data Models

Full schema and RLS policies live in `Blueprint/schema_policies.sql` — that is the source of truth.

All tables live in Supabase (PostgreSQL). TypeScript types are in `src/types/models.ts`.
`src/types/supabase.ts` is auto-generated — never edit manually.

---

### Entity Relationship Overview

```
provider_types                  (admin-managed: 'DETAILER', 'MECHANIC')
service_catalog                 (admin-managed preset service list, scoped by provider_type)

users
├── vehicles                    (1:many — customer vehicles)
├── provider_profiles           (1:1 — opt-in provider mode)
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
     └── Has session ──► (tabs)/
                              │
                         role check
                         ├── customer: Search, Bookings, Inbox, Services, More
                         └── provider mode: same tabs + provider views in More/provider.tsx

---

## Key Design Decisions

- **Dual-role users**: All users default to Customer. Provider mode is opt-in post-signup (`role` column supports `'customer'`, `'provider'`, `'both'`). A user can be both simultaneously — the UI shows provider-specific views in the More tab when provider mode is active.
- **Provider vetting gate**: A provider must pass all 6 vetting steps (identity via Persona, background check via Checkr, insurance, credentials, bank account via Stripe Connect, profile completeness ≥ 80%) before `verification_status` is set to `approved`. Until approved, the provider cannot receive bookings.
- **Service snapshots**: Services are snapshotted as JSONB in the `bookings.services` column at booking time. Price or name changes by providers never alter existing bookings.
- **Deposit model**: 15% of booking total collected at booking via Stripe; remainder captured on job completion. `deposit_forfeited = true` on late cancellations (within 24 hours of scheduled time).
- **Fee structure**: Provider platform fee is 5% (0% for Founding Providers for first 3 months, controlled by `is_founding_provider` and `platform_fee_rate`). Customer service fee is 2% added at checkout.
- **Live GPS architecture**: Provider location updates every 5 seconds during active bookings. Live position is written to Redis (never directly to Postgres from the app). `provider_location_cache` in Postgres stores last-known position, persisted server-side. Customers with an active booking (`en_route` or `in_progress`) can read their provider's cached location via RLS policy.
- **Content moderation**: ALL outbound messages must pass through `containsFlaggedContent()` in `validators.ts` before insert. Flagged body is replaced with `[Message flagged for review]`. Auto-detection of phone numbers, email addresses, and external payment handles ('Venmo me') triggers flagging.
- **Kudos vs Gear Ratings**: Kudos are freeform positive badges (`'meticulous'`, `'reliable'`, `'magic_hands'`, `'great_value'`, `'fast_worker'`, `'communicator'`) stored in the `kudos` table. Gear ratings are structured 4-dimension scores (Quality, Timeliness, Communication, Value — 1–5 each) stored in `ratings` with a weighted composite `overall_score`. Both are tied to a booking but serve different purposes.
- **Dispute window**: 48 hours post-service for either party to flag a rating for admin review (`dispute_window_end` in `ratings`).
- **RLS everywhere**: Every table has Row Level Security enabled. Queries must work under the correct Supabase auth role. See `Blueprint/schema_policies.sql` for all policies.
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