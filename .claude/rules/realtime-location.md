---
globs: "src/**/*location*,src/**/*LiveMap*,src/**/*realtime*,app/**/*tracking*"
---

# Realtime and Location

- Use Supabase Realtime for active message threads and active booking status.
- Do not use Supabase Realtime for GPS.
- Poll `provider_location_cache` every five seconds for customer tracking.
- Provider GPS writes must go through the server-side location flow.
- Subscribe on mount and unsubscribe during cleanup.
- Use channel names `booking:{bookingId}` and `thread:{threadId}`.
- Map tiles use OpenStreetMap through `react-native-maps` `<UrlTile>`.
- Do not introduce a Google Maps key.
- Distance and ETA calculations belong in `src/lib/location/index.ts`.
