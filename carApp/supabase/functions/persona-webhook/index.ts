// persona-webhook Edge Function — STUB (Flow 4.2)
//
// Receives Persona inquiry webhook events and reconciles them into
// provider_vetting.identity_status (approved when the inquiry is approved,
// rejected otherwise). Runs on Deno.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL SETUP (🔒 yours — see end_user_flows.md Flow 4.2):
//   supabase secrets set PERSONA_API_KEY=...
//   supabase secrets set PERSONA_WEBHOOK_SECRET=...
//   supabase functions deploy persona-webhook
//   + configure the webhook URL + inquiry template in the Persona dashboard
// Until PERSONA_WEBHOOK_SECRET is set this returns 503. The Persona-Signature
// header (t=<ts>,v1=<hex HMAC-SHA256 of "<t>.<body>">) is verified before the
// payload is trusted; the status mapping is intentionally minimal.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyPersonaSignature } from '../_shared/webhookSignature.ts';

const PERSONA_WEBHOOK_SECRET = Deno.env.get('PERSONA_WEBHOOK_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!PERSONA_WEBHOOK_SECRET) {
    return json({ error: 'persona-webhook is not configured yet.' }, 503);
  }

  // Read the raw body once — the signature is computed over these exact bytes,
  // so we must verify before JSON.parse (re-serializing would change them).
  const rawBody = await req.text();
  const signature = req.headers.get('Persona-Signature');
  const validSignature = await verifyPersonaSignature(
    rawBody,
    signature,
    PERSONA_WEBHOOK_SECRET,
  );
  if (!validSignature) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event: {
    data?: {
      attributes?: {
        payload?: {
          data?: { attributes?: { status?: string; 'reference-id'?: string } };
        };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  const inquiry = event?.data?.attributes?.payload?.data?.attributes;
  const providerId = inquiry?.['reference-id']; // we pass provider_id as reference-id
  const personaStatus = inquiry?.status;
  if (!providerId || !personaStatus) {
    return json({ error: 'Missing inquiry data' }, 400);
  }

  const identityStatus =
    personaStatus === 'approved' || personaStatus === 'completed'
      ? 'approved'
      : personaStatus === 'declined' || personaStatus === 'failed'
        ? 'rejected'
        : 'submitted';

  const { error } = await supabase
    .from('provider_vetting')
    .update({ identity_status: identityStatus })
    .eq('provider_id', providerId);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, identity_status: identityStatus });
});
