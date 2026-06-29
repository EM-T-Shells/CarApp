import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchProvider, reviewProvider } from '../lib/api';
import type { ProviderDetail as Detail, ProviderVettingRow } from '../types';

const VETTING_FIELDS: { key: keyof ProviderVettingRow; label: string }[] = [
  { key: 'identity_status', label: 'Identity' },
  { key: 'background_status', label: 'Background check' },
  { key: 'insurance_status', label: 'Insurance certificate' },
  { key: 'credentials_status', label: 'Credentials' },
  { key: 'bank_status', label: 'Bank / payouts' },
];

export function ProviderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [provider, setProvider] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchProvider(id).then(({ data, error }) => {
      if (error) setError(error);
      else setProvider(data);
      setLoading(false);
    });
  }, [id]);

  async function act(action: 'approve' | 'reject') {
    if (!id) return;
    if (action === 'reject' && !reason.trim()) {
      setError('A reason is required to reject.');
      return;
    }
    setBusy(action);
    setError(null);
    const { data, error } = await reviewProvider(id, action, reason.trim() || undefined);
    setBusy(null);
    if (error || !data?.ok) {
      setError(error ?? 'Action failed');
      return;
    }
    const emailNote = data.email.ok ? 'email sent' : `email not sent (${data.email.error})`;
    setResult(`Provider ${data.verification_status} — ${emailNote}.`);
  }

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error && !provider) return <div className="page"><p className="error">{error}</p></div>;
  if (!provider) return <div className="page"><p>Not found.</p></div>;

  const vetting = provider.provider_vetting?.[0];

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" data-testid="back-link">← Queue</Link>
      </header>

      <h1 data-testid="provider-name">{provider.users?.full_name ?? 'Unnamed provider'}</h1>
      <p className="muted">{provider.users?.email ?? '—'} · {provider.users?.phone ?? 'no phone'}</p>
      <p className="muted">Status: <strong data-testid="provider-status">{provider.verification_status}</strong></p>

      <section className="card">
        <h3>Profile</h3>
        <p>{provider.bio || <span className="muted">No bio.</span>}</p>
        <p className="muted">Service radius: {provider.mile_radius ?? '—'} mi</p>
      </section>

      <section className="card">
        <h3>Vetting</h3>
        <table className="table">
          <tbody>
            {VETTING_FIELDS.map((f) => (
              <tr key={f.key}>
                <td>{f.label}</td>
                <td data-testid={`vetting-${f.key}`}>{(vetting?.[f.key] as string) ?? 'pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {vetting?.rejection_reason && (
          <p className="muted">Previous rejection: {vetting.rejection_reason}</p>
        )}
        <p className="muted">
          Insurance & ID documents live in the service-role storage bucket — open them in the
          Supabase dashboard until in-panel signed-URL preview ships (follow-up).
        </p>
      </section>

      {result ? (
        <section className="card" data-testid="review-result">
          <p>{result}</p>
          <button onClick={() => navigate('/')}>Back to queue</button>
        </section>
      ) : (
        <section className="card">
          <h3>Decision</h3>
          {error && <p className="error" data-testid="detail-error">{error}</p>}
          <textarea
            placeholder="Reason (required to reject)…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="reject-reason"
          />
          <div className="actions">
            <button
              className="primary"
              disabled={busy !== null}
              onClick={() => act('approve')}
              data-testid="approve-btn"
            >
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
            <button
              className="danger"
              disabled={busy !== null}
              onClick={() => act('reject')}
              data-testid="reject-btn"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
