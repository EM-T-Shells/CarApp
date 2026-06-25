// Pure-logic spec for admin-review-provider (Blocker #9 — admin panel).
//
// The Edge Function runs on Deno and imports remote modules, so it can't be
// imported into Jest directly. Following the repo convention (see
// stripe-webhook/__tests__/cancellation-policy.test.ts), these tests
// re-implement the exact decision logic from index.ts and lock it down — a
// change to validateReviewBody / buildReviewEmail / the admin gate must be a
// deliberate edit here too.

// ── Mirror of index.ts validateReviewBody ───────────────────────────────
type ReviewAction = 'approve' | 'reject';
interface ReviewBody {
  action?: string;
  provider_id?: string;
  reason?: string;
}
interface ValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
  action?: ReviewAction;
  reason?: string;
}

function validateReviewBody(body: ReviewBody): ValidationResult {
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

// ── Mirror of the admin gate in the handler ─────────────────────────────
function authorizeAdmin(caller: { is_admin?: boolean } | null): { ok: boolean; status?: number } {
  if (!caller?.is_admin) return { ok: false, status: 403 };
  return { ok: true };
}

// ── Mirror of index.ts buildReviewEmail (subject + reason inclusion) ─────
function buildReviewEmail(action: ReviewAction, name: string | null, reason?: string) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  if (action === 'approve') {
    return {
      subject: "You're approved on Stabl 🎉",
      html: `<p>${hi}</p><p>Great news — your <strong>Stabl provider application has been approved</strong>.</p>`,
    };
  }
  return {
    subject: 'An update on your Stabl application',
    html: `<p>${hi}</p><p><strong>Reason:</strong> ${reason}</p>`,
  };
}

describe('validateReviewBody', () => {
  it('rejects a missing action', () => {
    const r = validateReviewBody({ provider_id: 'p1' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('rejects an invalid action', () => {
    const r = validateReviewBody({ action: 'suspend', provider_id: 'p1' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('rejects a missing provider_id', () => {
    const r = validateReviewBody({ action: 'approve' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('rejects a reject with no reason', () => {
    const r = validateReviewBody({ action: 'reject', provider_id: 'p1' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('rejects a reject with a blank/whitespace reason', () => {
    const r = validateReviewBody({ action: 'reject', provider_id: 'p1', reason: '   ' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('accepts a valid approve', () => {
    const r = validateReviewBody({ action: 'approve', provider_id: 'p1' });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('approve');
  });

  it('accepts a valid reject and trims the reason', () => {
    const r = validateReviewBody({ action: 'reject', provider_id: 'p1', reason: '  incomplete docs  ' });
    expect(r.ok).toBe(true);
    expect(r.action).toBe('reject');
    expect(r.reason).toBe('incomplete docs');
  });
});

describe('authorizeAdmin', () => {
  it('returns 403 for a non-admin caller', () => {
    expect(authorizeAdmin({ is_admin: false })).toEqual({ ok: false, status: 403 });
  });

  it('returns 403 for an unknown caller', () => {
    expect(authorizeAdmin(null)).toEqual({ ok: false, status: 403 });
  });

  it('allows an admin caller', () => {
    expect(authorizeAdmin({ is_admin: true })).toEqual({ ok: true });
  });
});

describe('buildReviewEmail', () => {
  it('uses the approval subject for approve', () => {
    const e = buildReviewEmail('approve', 'Sam');
    expect(e.subject).toContain('approved');
    expect(e.html).toContain('Hi Sam,');
  });

  it('uses the application-update subject and includes the reason for reject', () => {
    const e = buildReviewEmail('reject', 'Sam', 'insurance expired');
    expect(e.subject).toBe('An update on your Stabl application');
    expect(e.html).toContain('insurance expired');
  });

  it('falls back to a generic greeting with no name', () => {
    const e = buildReviewEmail('approve', null);
    expect(e.html).toContain('Hi,');
  });
});
