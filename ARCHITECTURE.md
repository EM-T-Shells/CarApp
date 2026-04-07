# Stabl Architecture

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
| Analytics | Mixpanel | Funnel analysis, retention |
| Error Monitoring | Sentry | Crash reporting, performance |
| AI / LLM | Anthropic Claude API | Lug AI assistant |

---

## Folder Structure
stabl/ 
├── app/ 
│   ├── _layout.tsx                   # Root auth gate 
│   ├── (auth)/ 
│   │   ├── sign-in.tsx               # Google + Apple SSO 
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
│   │   │   ├── auth.ts               # signIn, signOut, OAuth helpers 
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
├── e2e/                              # Maestro E2E flows 
├── assets/ 
│   ├── fonts/ 
│   └── images/ 
├── Blueprint/                        # Schema, policies, dependencies, build plan docs 
├── CLAUDE.md 
├── ARCHITECTURE.md 
└── .claudeignore 


---

## Data Models
Full schema and RLS policies live in `Blueprint/schema_policies.md` — that is the source of truth.

All tables live in Supabase (PostgreSQL). TypeScript types are in `src/types/models.ts`.
`src/types/supabase.ts` is auto-generated — never edit manually.

---
### Entity Relationship Overview
users
├── vehicles                    (1:many — customer vehicles)
├── provider_profiles           (1:1 — opt-in provider mode)
│     ├── provider_vetting      (1:1 — vetting step statuses)
│     ├── service_packages      (1:many — provider's offered services)
│     └── provider_location_cache (1:1 — last known GPS position)
├── bookings                    (as customer or provider)
│     ├── booking_photos        (before/after photos)
│     ├── payments              (deposit, balance, refund)
│     ├── payouts               (provider payout per booking)
│     ├── ratings               (4-dimension gear rating)
│     └── kudos                 (freeform positive badges)
├── message_threads             (as customer or provider)
│     └── messages
├── notifications
├── subscriptions
└── promo_redemptions
     └── promotions

### Auth Flow 

App Launch
     │
     ▼
app/_layout.tsx — onAuthStateChange
     │
     ├── No session ──► app/(auth)/sign-in
     │                        │
     │              Google / Apple OAuth
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