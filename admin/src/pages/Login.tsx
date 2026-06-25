import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <div className="center">
      <form className="card" onSubmit={onSubmit} data-testid="login-form">
        <h1>Stabl Admin</h1>
        <p className="muted">Sign in with your admin email. We’ll send a magic link.</p>
        {sent ? (
          <p data-testid="login-sent">Check your inbox for the sign-in link.</p>
        ) : (
          <>
            <input
              type="email"
              required
              placeholder="you@stabl.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
            {error && <p className="error" data-testid="login-error">{error}</p>}
            <button type="submit" disabled={busy} data-testid="login-submit">
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
