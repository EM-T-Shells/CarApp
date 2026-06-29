import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPendingProviders } from '../lib/api';
import { useAuth } from '../auth';
import type { QueueRow } from '../types';

export function Queue() {
  const { signOut } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetchPendingProviders().then(({ data, error }) => {
      if (error) setError(error);
      else setRows(data ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.users?.full_name, r.users?.email, r.id]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Provider vetting queue</h1>
        <button onClick={signOut} data-testid="signout">Sign out</button>
      </header>

      <input
        className="search"
        placeholder="Search name, email, or ID…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="queue-search"
      />

      {loading && <p data-testid="queue-loading">Loading…</p>}
      {error && <p className="error" data-testid="queue-error">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="muted" data-testid="queue-empty">No providers awaiting review. 🎉</p>
      )}

      {filtered.length > 0 && (
        <table className="table" data-testid="queue-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Applied</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} data-testid="queue-row">
                <td>{r.users?.full_name ?? '—'}</td>
                <td>{r.users?.email ?? '—'}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td>
                  <Link to={`/providers/${r.id}`} data-testid="queue-review-link">Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
