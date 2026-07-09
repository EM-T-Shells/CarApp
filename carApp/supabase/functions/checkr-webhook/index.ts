// checkr-webhook Edge Function — STUB (Flow 4.3)
//
// Receives Checkr report webhook events and reconciles them into
// provider_vetting.background_status. Runs on Deno.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL SETUP (🔒 yours — see end_user_flows.md Flow 4.3):
//   supabase secrets set CHECKR_API_KEY=...
//   supabase secrets set CHECKR_WEBHOOK_SECRET=...
//   supabase functions deploy checkr-webhook
//   + configure the webhook in the Checkr dashboard
// Returns 503 until CHECKR_WEBHOOK_SECRET is set. The X-Checkr-Signature header
// (hex HMAC-SHA256 of the raw body) is verified before the payload is trusted;
// the status mapping is intentionally minimal.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCheckrSignature } from '../_shared/webhookSignature.ts';

const CHECKR_WEBHOOK_SECRET = Deno.env.get('CHECKR_WEBHOOK_SECRET') ?? '';

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
  if (!CHECKR_WEBHOOK_SECRET) {
    return json({ error: 'checkr-webhook is not configured yet.' }, 503);
  }

  // Read the raw body once — the signature is computed over these exact bytes,
  // so we must verify before JSON.parse (re-serializing would change them).
  const rawBody = await req.text();
  const signature = req.headers.get('X-Checkr-Signature');
  const validSignature = await verifyCheckrSignature(
    rawBody,
    signature,
    CHECKR_WEBHOOK_SECRET,
  );
  if (!validSignature) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event: { type?: string; data?: { object?: { status?: string; provider_id?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  const report = event?.data?.object;
  const providerId = report?.provider_id; // passed through Checkr report metadata
  const reportStatus = report?.status;
  if (!providerId || !reportStatus) {
    return json({ error: 'Missing report data' }, 400);
  }

  const backgroundStatus =
    reportStatus === 'clear' || reportStatus === 'complete'
      ? 'approved'
      : reportStatus === 'consider' || reportStatus === 'suspended'
        ? 'rejected'
        : 'submitted';

  const { error } = await supabase
    .from('provider_vetting')
    .update({ background_status: backgroundStatus })
    .eq('provider_id', providerId);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, background_status: backgroundStatus });
});
