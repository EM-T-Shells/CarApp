// Provider GPS sender (Flow 5.4) — the write half of live tracking.
//
// Kept separate from ./index.ts (pure distance/ETA math, no network deps) so
// that module stays dependency-free. This file talks to Supabase via the
// update-provider-location Edge Function, which writes provider_location_cache
// with the service role after verifying ownership. The app never writes that
// table directly (CLAUDE.md). The customer side reads it back via
// getProviderLocation (queries.ts) by polling.

import { supabase } from '../supabase/client';
import type { LatLng } from './index';

export type SendLocationResult =
  | { ok: true; error: null }
  | { ok: false; error: Error };

/**
 * Pushes a single GPS fix for the given provider. Best-effort: callers
 * typically fire this on a 5-second interval and can ignore transient
 * failures (the next tick retries).
 */
export async function sendProviderLocation(
  providerId: string,
  position: LatLng,
): Promise<SendLocationResult> {
  try {
    const { error } = await supabase.functions.invoke('update-provider-location', {
      body: {
        provider_id: providerId,
        latitude: position.latitude,
        longitude: position.longitude,
      },
    });
    if (error) {
      return { ok: false, error: new Error(error.message ?? 'Location update failed') };
    }
    return { ok: true, error: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
