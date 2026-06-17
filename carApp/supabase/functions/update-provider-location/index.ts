// update-provider-location Edge Function (Flow 5.4)
//
// Receives a provider's live GPS fix from the provider app every ~5s while a
// job is en_route / in_progress, and writes it to provider_location_cache.
//
// Why an Edge Function: CLAUDE.md forbids the app writing to
// provider_location_cache directly (the app uses the anon key under RLS; the
// location cache is server-owned). This function runs with the service role
// after verifying the caller actually owns the provider profile, so the write
// path stays trusted. The customer tracking screen (Flow 2.8) polls the same
// table, so this closes the live-tracking loop.
//
// Redis: the eventual design caches the live fix in Redis (sub-second reads,
// TTL) and only periodically persists to Postgres. Redis is deferred, so for
// now we persist every fix straight to Postgres. When Redis lands, write it
// here first and keep the Postgres upsert as the last-known fallback — the
// app-facing contract (this function + getProviderLocation) won't change.
//
// Runs on Deno. Secrets via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Service-role client — bypasses RLS to write the server-owned cache after we
// verify ownership from the caller's JWT.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the caller from the bearer token.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse({ error: 'Missing authorization' }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    const body = (await req.json()) as {
      provider_id?: string;
      latitude?: number;
      longitude?: number;
    };

    if (!body.provider_id) {
      return jsonResponse({ error: 'provider_id is required' }, 400);
    }
    if (!isValidCoord(body.latitude, body.longitude)) {
      return jsonResponse({ error: 'Invalid latitude/longitude' }, 400);
    }

    // Verify the caller owns this provider profile.
    const { data: profile, error: profileError } = await supabase
      .from('provider_profiles')
      .select('id, user_id')
      .eq('id', body.provider_id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: 'Provider profile not found' }, 404);
    }
    if (profile.user_id !== userId) {
      return jsonResponse({ error: 'Not authorized for this provider' }, 403);
    }

    const { error: upsertError } = await supabase
      .from('provider_location_cache')
      .upsert(
        {
          provider_id: body.provider_id,
          latitude: body.latitude,
          longitude: body.longitude,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider_id' },
      );

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 500);
    }

    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
