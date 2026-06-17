// lug-ai Edge Function (Flow 3.6)
//
// Anthropic Claude proxy that powers the in-app "Lug" assistant. The mobile
// client calls this via supabase.functions.invoke('lug-ai', { body: { messages } })
// where `messages` is the running [{ role: 'user' | 'assistant', content }] history.
//
// Runs on Deno. The model is reached with a CarApp-specific system prompt so
// Lug stays on-topic (car care + the CarApp catalog) and always points users to
// the in-app "Talk to a person" escalation rather than off-platform contact.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL SETUP (handled outside this code — see end_user_flows.md Flow 3.6 🔒):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy lug-ai
// Until ANTHROPIC_API_KEY is set this function returns 503 and the client shows
// a graceful fallback that surfaces the human-escalation CTA.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const LUG_MODEL = Deno.env.get('LUG_MODEL') ?? 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 600;

// System prompt — constrains Lug to the CarApp service catalog and to NoVA/DC.
const SYSTEM_PROMPT = `You are Lug, the friendly in-app assistant for CarApp — a two-sided marketplace that connects vehicle owners in the Northern Virginia / Washington DC metro area with vetted independent mobile car detailers and (soon) mechanics.

What you help with:
- Recommending the right service for a customer's vehicle and goals (e.g. interior detail, exterior wash & wax, full detail, ceramic coating, paint correction, and basic mechanical services).
- Explaining how CarApp works: searching for providers, booking, the 15% deposit at booking with the remainder on completion, live tracking, ratings/kudos, and the dispute window.
- General car-care tips.

Rules:
- Stay on topic: car care and CarApp. Politely decline unrelated requests.
- Never ask for or share off-platform contact info (phone numbers, emails, external payment handles). All contact and payment happens inside CarApp.
- You cannot make bookings, issue refunds, change orders, or access a user's account. For anything account-specific, billing, disputes, or when the user wants a human, tell them to tap "Talk to a person" to reach CarApp support in their inbox.
- Be concise and warm. Prices vary by provider, so give ranges/guidance, not firm quotes.`;

interface InboundMessage {
  role: 'user' | 'assistant';
  content: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    // External setup not done yet — fail soft so the client can escalate.
    return json({ error: 'Lug is not configured yet.' }, 503);
  }

  let messages: InboundMessage[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // Anthropic requires the conversation to start with a user turn, so drop any
  // leading assistant messages (e.g. Lug's canned greeting).
  const firstUser = messages.findIndex((m) => m.role === 'user');
  const trimmed = firstUser === -1 ? [] : messages.slice(firstUser);
  if (trimmed.length === 0) {
    return json({ error: 'No user message to respond to.' }, 400);
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: LUG_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: trimmed.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Upstream error (${res.status}): ${detail}` }, 502);
    }

    const data = await res.json();
    const reply =
      Array.isArray(data?.content) && data.content[0]?.type === 'text'
        ? data.content[0].text
        : '';

    if (!reply) return json({ error: 'Empty response from model.' }, 502);
    return json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return json({ error: message }, 500);
  }
});
