import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCalibration } from '../lib/api';
import { useAuth } from '../auth';
import type { CalibrationRow } from '../types';

// Phase 4 calibration reporting (Blueprint/quote_first_booking.md §2, §7, §8).
//
// Two questions, per provider:
//   • Do their quoted durations hold up? Suggested → quoted → actual, and how
//     often jobs run 15+ minutes over or start late.
//   • Are they bait pricing? There is no price cap (§2); instead quotes are
//     monitored against what the provider advertises. Sorted by the largest
//     markup, so the provider most worth a look is first.

const PERIODS = [30, 90, 365] as const;

// Flag thresholds. An average overrun past this means quoted times are not
// what customers get; a single quote this far over the menu price is worth a
// human looking at the itemisation.
const OVERRUN_FLAG_MINS = 15;
const MARKUP_FLAG_PCT = 25;

function mins(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)} min`;
}

function pct(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}%`;
}

function signedMins(value: number | null): string {
  if (value == null) return '—';
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded} min` : `${rounded} min`;
}

export function Calibration() {
  const { signOut } = useAuth();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const [rows, setRows] = useState<CalibrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchCalibration(days).then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error);
      else setRows(data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [days]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (b.max_quote_markup_pct ?? -1) - (a.max_quote_markup_pct ?? -1),
      ),
    [rows],
  );

  return (
    <div className="page">
      <header className="topbar">
        <div className="nav">
          <Link to="/" data-testid="queue-link">← Queue</Link>
          <h1>Calibration</h1>
        </div>
        <button onClick={signOut} data-testid="signout">Sign out</button>
      </header>

      <p className="muted">
        Per provider, over jobs scheduled in the period: how quoted durations compare with
        what jobs took, and how far quotes run above advertised prices. Flagged: an average
        overrun over {OVERRUN_FLAG_MINS} min, or a quote over {MARKUP_FLAG_PCT}% above the
        menu price.
      </p>

      <div className="segmented" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p}
            className={p === days ? 'active' : undefined}
            aria-pressed={p === days}
            onClick={() => setDays(p)}
            data-testid={`period-${p}`}
          >
            Last {p} days
          </button>
        ))}
      </div>

      {loading && <p data-testid="calibration-loading">Loading…</p>}
      {error && <p className="error" data-testid="calibration-error">{error}</p>}
      {!loading && !error && sorted.length === 0 && (
        <p className="muted" data-testid="calibration-empty">No jobs in this period yet.</p>
      )}

      {!loading && !error && sorted.length > 0 && (
        <table className="table" data-testid="calibration-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th className="num">Completed</th>
              <th className="num">Suggested → quoted → actual</th>
              <th className="num">Avg overrun</th>
              <th className="num">Within 15 / over / early</th>
              <th className="num">Late starts</th>
              <th className="num">Quotes with charges</th>
              <th className="num">Avg / max markup</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const overrunFlag = (r.avg_overrun_mins ?? 0) > OVERRUN_FLAG_MINS;
              const markupFlag = (r.max_quote_markup_pct ?? 0) > MARKUP_FLAG_PCT;
              return (
                <tr key={r.provider_id} data-testid="calibration-row">
                  <td>
                    <Link to={`/providers/${r.provider_id}`}>{r.provider_name ?? 'Unnamed provider'}</Link>
                  </td>
                  <td className="num">
                    {r.completed_jobs}
                    <span className="muted"> ({r.timed_jobs} timed)</span>
                  </td>
                  <td className="num">
                    {mins(r.avg_suggested_mins)} → {mins(r.avg_estimated_mins)} → {mins(r.avg_actual_mins)}
                  </td>
                  <td
                    className={overrunFlag ? 'num warn' : 'num'}
                    data-testid={overrunFlag ? 'overrun-flag' : undefined}
                    title={overrunFlag ? 'Jobs run well over the quoted duration' : undefined}
                  >
                    {signedMins(r.avg_overrun_mins)}
                  </td>
                  <td className="num">
                    {r.within_estimate_jobs} / {r.over_estimate_jobs} / {r.under_estimate_jobs}
                  </td>
                  <td className="num">{r.late_start_jobs}</td>
                  <td className="num">
                    {r.surcharged_jobs} of {r.quoted_jobs}
                  </td>
                  <td
                    className={markupFlag ? 'num warn' : 'num'}
                    data-testid={markupFlag ? 'markup-flag' : undefined}
                    title={markupFlag ? 'A quote ran far above the advertised price' : undefined}
                  >
                    {pct(r.avg_quote_markup_pct)} / {pct(r.max_quote_markup_pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
