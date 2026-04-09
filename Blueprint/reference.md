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

