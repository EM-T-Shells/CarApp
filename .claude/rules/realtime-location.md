---
paths:
  - carApp/src/lib/location/**
  - carApp/src/components/tracking/**
  - carApp/src/components/**/*Map*.tsx
  - carApp/app/**/tracking/**
  - carApp/app/**/inbox/**
  - carApp/app/**/bookings/**
  - carApp/supabase/functions/update-provider-location/**
---

# Realtime and Location

- Use Supabase Realtime only for the `messages` table (active thread) and
  the `bookings` table (active booking status).
- Do not use Supabase Realtime for GPS.
- Poll `provider_location_cache` every five seconds for customer tracking.
- Provider GPS writes must go through the server-side location flow.
- Subscribe on mount and unsubscribe during cleanup.
- Use channel names `booking:{bookingId}` and `thread:{threadId}`.
- Map tiles use OpenStreetMap through `react-native-maps` `<UrlTile>`.
- Forward geocoding uses OpenStreetMap Nominatim through `geocodeAddress()` in
  `carApp/src/lib/location/index.ts`. Do not add another geocoding provider.
- Respect Nominatim's usage policy: at most one request per second, no bulk
  geocoding, and keep the identifying User-Agent header on every request.
- Do not introduce a Google Maps key or any other paid maps or geocoding key.
  Google Maps is out for MVP because of billing.
- Distance, bearing, and ETA calculations use the Haversine helpers in
  `carApp/src/lib/location/index.ts`.
