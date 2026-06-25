// Shared transactional email sender (Resend) for admin/ops Edge Functions.
//
// Added for Blocker #9 (admin panel): the provider approve/reject decision must
// trigger an email to the provider within 60s. All existing notify-* functions
// are push-only (FCM); this is the first email path.
//
// Set the secrets before going live (see Blueprint/external_setup.md):
//   supabase secrets set RESEND_API_KEY='re_...'
//   supabase secrets set EMAIL_FROM='Stabl <noreply@your-verified-domain>'
//
// Email is best-effort: callers persist their state change first and treat a
// failed send as non-fatal (returned in EmailResult), so a transient Resend
// outage never blocks an approval. If the secrets are unset, sendEmail returns
// { ok: false, error: 'email_not_configured' } rather than throwing.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) {
    return { ok: false, error: 'email_not_configured' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return { ok: false, error: `resend_${res.status}: ${detail}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'send_failed',
    };
  }
}
