# CarApp Architecture

## Stack

Layer

Technology

Notes

Mobile Framework

Expo ~55 / React Native 0.83

Managed workflow

Language

TypeScript 5.9 (strict)

Strict mode enabled

Routing

Expo Router ~55

File-based, like Next.js

Backend / DB

Supabase (PostgreSQL)

Auth, DB, Storage, Realtime

Auth Storage

Expo Secure Store

Encrypted session persistence

OAuth

Expo Auth Session + Web Browser

Google & Apple SSO (planned)

Payments

Stripe (planned)

Deposits + subscriptions

Push Notifications

Expo Push (planned)

Via Supabase Edge Functions

Maps / Geo

Google Maps (planned)

Provider radius search

Global State

Zustand

auth, search, bookingDraft, signUpDraft

Localized State

React Context

Feature-scoped trees only (forms, modals)

---

## Folder Structure

```
carApp/├── app/                          # Expo Router — file = route│   ├── _layout.tsx               # Root auth gate│   ├── (auth)/│   │   └── sign-in.tsx           # Login / registration│   └── (tabs)/│       ├── _layout.tsx           # Tab bar config│       ├── search/               # Browse providers│       ├── bookings/             # Appointment history│       ├── inbox/                # Messages│       ├── services/             # Provider: manage services│       └── more/                 # Settings, profile├── src/│   ├── lib/│   │   ├── supabase/│   │   │   ├── client.ts         # Supabase singleton│   │   │   ├── auth.ts           # signIn, signOut, OAuth helpers│   │   │   ├── queries.ts        # All SELECT operations│   │   │   ├── mutations.ts      # All INSERT / UPDATE operations│   │   │   └── storage.ts        # File uploads (profile pics, review images)│   │   ├── stripe/│   │   │   └── index.ts          # Payment intents, subscription billing│   │   ├── notifications/│   │   │   └── push.ts           # Expo push token registration, send│   │   └── location/│   │       └── index.ts          # Geocoding, distance calc│   ├── state/│   │   ├── auth.ts               # Authenticated user + session│   │   ├── search.ts             # Provider search filters + results│   │   ├── bookingDraft.ts       # In-progress appointment builder│   │   └── signUpDraft.ts        # Multi-step registration state│   ├── types/│   │   ├── models.ts             # Domain TypeScript interfaces│   │   ├── supabase.ts           # Auto-generated Supabase types│   │   └── navigation.ts         # Expo Router typed params│   ├── utils/│   │   ├── validators.ts         # Form validation + content moderation│   │   ├── money.ts              # Cents ↔ display formatting│   │   └── date.ts               # ISO string parsing and formatting│   ├── components/│   │   ├── ui/                   # Base: Button, Input, Card, Avatar│   │   ├── provider/             # ProviderCard, ServiceList, ReviewList│   │   ├── booking/              # DatePicker, ServiceSelector, Summary│   │   └── inbox/                # MessageBubble, ThreadItem│   └── design/│       ├── theme.ts              # Colors, spacing, radii│       └── typography.ts         # Font sizes and weights└── assets/    ├── icon.png    ├── splash.png    └── fonts/
```

---

## Data Models

All tables live in Supabase (PostgreSQL). TypeScript types are in `src/types/models.ts`.

### Entity Relationship Overview`​`

```
users (Supabase Auth)  ├── user_information      (1:1 — address, lat/lng)  ├── user_car_information  (1:many — vehicles)  ├── providers             (1:1 — becomes a provider)  │     └── provider_services  (1:many — services offered)  ├── appointments          (as customer or provider)  ├── reviews               (written by customer)  ├── message_threads       (as customer or provider)  │     └── messages  ├── notifications  └── subscriptions
```

### Core Tables

#### `users`

Column

Type

Notes

id

UUID

From Supabase Auth

first_name

text

last_name

text

profile_pic

text

Storage URL

is_provider

boolean

Dual-role flag

stripe_customer_id

text

Set on first payment

created_at

timestamptz

#### `providers`

Column

Type

Notes

id

UUID

user_id

UUID → users

provider_type_id

UUID → provider_types

DETAILER | MECHANIC

rating

numeric

Denormalized average

mile_radius

integer

Service radius

bio

text

is_approved

boolean

Admin approval gate

#### `appointments`

Column

Type

Notes

id

UUID

provider_id

UUID → providers

user_id

UUID → users

Customer

car_id

UUID → user_car_information

services

JSONB[]

Snapshot at booking time

status

enum

pending → confirmed → in_progress → completed | cancelled

scheduled_at

timestamptz

deposit_amount

numeric

Cents

total_estimate

numeric

Cents

stripe_payment_id

text

deposit_forfeited

boolean

Late cancellation

#### `provider_services`

Column

Type

Notes

id

UUID

provider_id

UUID → providers

catalog_id

UUID → service_catalog

null if custom

name

text

price

numeric

Cents

duration_mins

integer

is_custom

boolean

Provider-created vs catalog

is_approved

boolean

Admin approval for custom

#### `messages`

Column

Type

Notes

id

UUID

thread_id

UUID → message_threads

sender_id

UUID → users

body

text

Replaced with `[Message flagged for review]` if flagged

image_url

text

Optional attachment

is_flagged

boolean

Content moderation

---

## Key Design Decisions

### Service Snapshots (JSONB)

Booked services are snapshotted into `appointments.services` as JSONB at booking time. This means price or service changes by providers never retroactively alter existing appointments.

### Deposit Model

-   15% of `total_estimate` collected at booking via Stripe
-   If customer cancels within 24 hours of appointment, `deposit_forfeited = true` and deposit is not refunded
-   Remaining balance collected after service completion

### Content Moderation

All messages pass through `containsFlaggedContent()` before insert. Flagged content (phone numbers, emails, payment app references) is blocked to keep all transactions on-platform. Flag stored in `messages.is_flagged`.

### Dual-Role Users

A single `users` row can be both a customer and a provider (`is_provider = true`). Provider-specific data is in the `providers` table. This keeps auth simple while supporting role switching.

### Row Level Security

Every table has RLS enabled. Key patterns:

-   **Users own their data**: user_information, notifications, subscriptions
-   **Public read**: providers, provider_services (active + approved), reviews
-   **Bidirectional**: appointments (customer and provider can read/update their own)
-   **Thread participants only**: messages (customer_id + provider_id gate)

### Provider Approval Gate

New providers have `is_approved = false`. Custom services (`is_custom = true`) also require `is_approved = true` before appearing in search. This is an admin workflow (not yet built).

---

## Auth Flow

```
App Launch    │    ▼app/_layout.tsx    │    ├── No session ──► app/(auth)/sign-in    │                       │    │                  Email/Password  or  OAuth (Google/Apple)    │                       │    │                  Supabase Auth ──► session stored in SecureStore    │    └── Has session ──► app/(tabs)/                            │                       Check is_provider                            │                    ├── Customer tabs: Search, Bookings, Inbox, More                    └── Provider tabs: + Services tab
```

---

## Planned Integrations

Service

Purpose

Status

Stripe

Deposits, subscriptions

Planned

Expo Push

Booking/message notifications

Planned

Google Maps

Provider radius search, service location

Planned

Supabase Storage

Profile pics, review images

Planned

Supabase Realtime

Live messaging

Planned