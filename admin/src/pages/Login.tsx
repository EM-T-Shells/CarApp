import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

// Email OTP code login — matches the mobile app's flow (signInWithOtp → typed
// code → verifyOtp). The project's shared "Magic Link" email template delivers a
// 6-digit code (no link), so the admin panel verifies that code rather than
// relying on a redirect. shouldCreateUser:false so only existing accounts can
// request a code; admin access is still gated by users.is_admin after sign-in.
export function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setStep('code');
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    // On success, onAuthStateChange sets the session and the <Navigate> redirects.
    if (err) setError(err.message);
  }

  return (
    <div className="center">
      <form
        className="card"
        onSubmit={step === 'email' ? requestCode : verifyCode}
        data-testid="login-form"
      >
        <h1>Stabl Admin</h1>
        {step === 'email' ? (
          <>
            <p className="muted">Sign in with your admin email. We’ll email you a 6-digit code.</p>
            <input
              type="email"
              required
              placeholder="you@stabl.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email"
            />
            {error && (
              <p className="error" data-testid="login-error">
                {error}
              </p>
            )}
            <button type="submit" className="primary" disabled={busy} data-testid="login-submit">
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <p className="muted">Enter the 6-digit code we emailed to {email}.</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-testid="login-code"
            />
            {error && (
              <p className="error" data-testid="login-error">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit" className="primary" disabled={busy} data-testid="login-verify">
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError(null);
                }}
                data-testid="login-back"
              >
                Use a different email
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
