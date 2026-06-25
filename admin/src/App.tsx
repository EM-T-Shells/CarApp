import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Login } from './pages/Login';
import { Queue } from './pages/Queue';
import { ProviderDetail } from './pages/ProviderDetail';

/** Gate: requires a session AND is_admin. Otherwise routes to login / denied. */
function RequireAdmin({ children }: { children: JSX.Element }) {
  const { session, isAdmin, loading, signOut } = useAuth();

  if (loading) return <div className="center" data-testid="loading">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAdmin) {
    return (
      <div className="center" data-testid="not-authorized">
        <div className="card">
          <h2>Not authorized</h2>
          <p>This account isn’t an admin. Ask an existing admin to add you.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAdmin><Queue /></RequireAdmin>} />
      <Route path="/providers/:id" element={<RequireAdmin><ProviderDetail /></RequireAdmin>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
