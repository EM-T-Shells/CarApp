// admin-review-provider Edge Function (Blocker #9 — admin panel).
//
// Single privileged entry point for the provider vetting decision made from the
// desktop web admin panel. The caller's JWT is verified to belong to an admin
// (users.is_admin) before anything happens, then the decision is applied with
// the service-role client (RLS-bypassing) and an approval/rejection email is
// sent via Resend inside the request — that satisfies the "approval email
// within 60s" story (Workflow L). This is also the seed for the later
// server-side refund / dispute admin tools.
//
// Invoke from the admin web app:
//   supabase.functions.invoke('admin-review-provider', {
//     body: { action: 'approve' | 'reject', provider_id, reason? }
//   })
//
// Approve: provider_profiles.verification_status = 'approved', approved_at = now
//   (this fires the founding-provider trigger from Blocker #8), and every
//   provider_vetting doc status -> 'approved' with reviewed_by / reviewed_at.
// Reject:  verification_status = 'rejected'; provider_vetting.rejection_reason +
//   reviewed_by / reviewed_at recorded (per-doc statuses left as-is).
//
// Runs on Deno. Secrets via Deno.env.get().

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEmail, type EmailMessage } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// Service-role client — bypasses RLS to apply the decision after we verify the
// caller is an admin from their JWT.
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

export type ReviewAction = 'approve' | 'reject';

export interface ReviewBody {
  action?: string;
  provider_id?: string;
  reason?: string;
}

// ── Pure logic (mirrored + locked in __tests__/admin-review-provider.test.ts) ──

export interface ValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
  action?: ReviewAction;
  reason?: string;
}

/** Validates the request body. Reject requires a non-empty reason. */
export function validateReviewBody(body: ReviewBody): ValidationResult {
  if (body.action !== 'approve' && body.action !== 'reject') {
    return { ok: false, status: 400, error: "action must be 'approve' or 'reject'" };
  }
  if (!body.provider_id) {
    return { ok: false, status: 400, error: 'provider_id is required' };
  }
  if (body.action === 'reject' && !body.reason?.trim()) {
    return { ok: false, status: 400, error: 'reason is required to reject' };
  }
  return { ok: true, action: body.action, reason: body.reason?.trim() };
}

/** The provider-facing email for each decision. */
export function buildReviewEmail(
  action: ReviewAction,
  to: string,
  name: string | null,
  reason?: string,
): EmailMessage {
  const hi = name ? `Hi ${name},` : 'Hi,';
  if (action === 'approve') {
    return {
      to,
      subject: "You're approved on Stabl 🎉",
      text: `${hi}\n\nGreat news — your Stabl provider application has been approved. You can now receive and accept bookings. Open the app to set your availability and go live.\n\n— The Stabl Team`,
      html: `<p>${hi}</p><p>Great news — your <strong>Stabl provider application has been approved</strong>. You can now receive and accept bookings.</p><p>Open the app to set your availability and go live.</p><p>— The Stabl Team</p>`,
    };
  }
  return {
    to,
    subject: 'An update on your Stabl application',
    text: `${hi}\n\nThank you for applying to Stabl. After review, we're unable to approve your provider application at this time.\n\nReason: ${reason}\n\nIf you believe this was a mistake or you'd like to reapply, reply to this email.\n\n— The Stabl Team`,
    html: `<p>${hi}</p><p>Thank you for applying to Stabl. After review, we're unable to approve your provider application at this time.</p><p><strong>Reason:</strong> ${reason}</p><p>If you believe this was a mistake or you'd like to reapply, reply to this email.</p><p>— The Stabl Team</p>`,
  };
}

// ── Handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the caller from the bearer token.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse({ error: 'Missing authorization' }, 401);
    }
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }
    const callerId = userData.user.id;

    // 2. Gate: caller must be an admin.
    const { data: caller } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', callerId)
      .maybeSingle();
    if (!caller?.is_admin) {
      return jsonResponse({ error: 'Not authorized' }, 403);
    }

    // 3. Validate.
    const body = (await req.json()) as ReviewBody;
    const v = validateReviewBody(body);
    if (!v.ok) {
      return jsonResponse({ error: v.error }, v.status ?? 400);
    }
    const action = v.action as ReviewAction;
    const providerId = body.provider_id as string;
    const reason = v.reason;

    // 4. Load the provider + owner (for the email).
    const { data: profile, error: pErr } = await supabase
      .from('provider_profiles')
      .select('id, user_id')
      .eq('id', providerId)
      .maybeSingle();
    if (pErr || !profile) {
      return jsonResponse({ error: 'Provider not found' }, 404);
    }
    const { data: owner } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', profile.user_id)
      .maybeSingle();

    // 5. Apply the decision (service role → RLS bypassed).
    const nowIso = new Date().toISOString();
    if (action === 'approve') {
      const { error: e1 } = await supabase
        .from('provider_profiles')
        .update({ verification_status: 'approved', approved_at: nowIso })
        .eq('id', providerId);
      if (e1) return jsonResponse({ error: e1.message }, 500);
      await supabase
        .from('provider_vetting')
        .update({
          identity_status: 'approved',
          background_status: 'approved',
          insurance_status: 'approved',
          credentials_status: 'approved',
          bank_status: 'approved',
          reviewed_by: callerId,
          reviewed_at: nowIso,
        })
        .eq('provider_id', providerId);
    } else {
      const { error: e1 } = await supabase
        .from('provider_profiles')
        .update({ verification_status: 'rejected' })
        .eq('id', providerId);
      if (e1) return jsonResponse({ error: e1.message }, 500);
      await supabase
        .from('provider_vetting')
        .update({
          rejection_reason: reason,
          reviewed_by: callerId,
          reviewed_at: nowIso,
        })
        .eq('provider_id', providerId);
    }

    // 6. Email the provider (best-effort; the decision is already persisted).
    let email = { ok: false, error: 'no_recipient' } as Awaited<ReturnType<typeof sendEmail>>;
    if (owner?.email) {
      email = await sendEmail(buildReviewEmail(action, owner.email, owner.full_name ?? null, reason));
    }

    return jsonResponse(
      {
        ok: true,
        action,
        provider_id: providerId,
        verification_status: action === 'approve' ? 'approved' : 'rejected',
        email,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
