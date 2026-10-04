'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ShieldCheck, Layers3, Truck, ChartNoAxesCombined } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { StaffWork } from '@/components/staff-work';
import { hasPermission, type Staff } from '@/server/permissions';
import { canAccessWorkspace } from '@/lib/workspace-access';
import { apiRequest } from '@/lib/api-client';
import { AuthContext } from '@/components/auth-context';
export { useAuth } from '@/components/auth-context';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const preview = process.env.NEXT_PUBLIC_CRM_MODE === 'preview' && process.env.NODE_ENV !== 'production';
  const pathname = usePathname() || '/';
  const [user, setUser] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    apiRequest<{ user: Staff }>('/api/auth/me', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUser(result.user); })
      .catch(failure => {
        if (!controller.signal.aborted && failure.status !== 401) setError(failure instanceof Error ? failure.message : 'Unable to check your staff session.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [preview]);
  async function logout() {
    setError('');
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      setUser(null);
      window.location.assign('/login');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign out did not complete. Please try again.');
    }
  }
  if (preview) return children;
  if (loading) return <main className="page"><p role="status">Loading staff session…</p></main>;
  if (!user) return <LoginForm initialError={error} onLogin={staff => {
    setUser(staff);
    setError('');
    if (window.location.pathname === '/login') window.location.assign('/');
  }} />;
  const permitted = canAccessWorkspace(user, pathname);
  return (
    <AuthContext.Provider value={{ user, logout }}>
      {error && <div className="ops-error" role="alert">{error}</div>}
      {!permitted ? (
        <main className="page access-denied">
          <ShieldCheck size={32} aria-hidden="true" />
          <h1>This workspace is restricted</h1>
          <p>Your {user.role} account does not have access to this page. No records from this workspace have been loaded.</p>
          <p>Contact a workspace manager if your responsibilities require additional access.</p>
          <div className="staff-work-actions"><a className="btn btn-primary" href="/">Return to my workspace</a><button className="btn" onClick={() => void logout()}>Sign out</button></div>
        </main>
      ) : hasPermission(user, 'commerce.read') ? children : <StaffWork />}
    </AuthContext.Provider>
  );
}

function LoginForm({ initialError, onLogin }: { initialError: string; onLogin: (staff: Staff) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <aside className="login-story">
        <a className="login-brand" href="/">amiro<span>.</span><small>AH INTERIORS</small></a>
        <div className="login-story-copy">
          <span className="login-kicker">YOUR BUSINESS, BEAUTIFULLY CONNECTED</span>
          <h1>Great interiors.<br />Seamless operations.</h1>
          <p>One home for your customers, your team and every detail in between.</p>
          <div className="login-features"><span><Layers3 size={18} />Every order in view</span><span><Truck size={18} />Every delivery connected</span><span><ChartNoAxesCombined size={18} />Every decision informed</span></div>
        </div>
        <div className="login-story-footer">Built around the way AH Interiors works.</div>
        <div className="login-orbit" aria-hidden="true" />
      </aside>
      <section className="login-main" aria-label="Staff sign in">
        <div className="login-card">
          <span className="login-emblem" aria-hidden="true">AH</span>
          <span className="login-kicker">WELCOME TO YOUR WORKSPACE</span>
          <h2>Good to see you.</h2><p>Sign in to keep your business moving.</p>
          <form aria-busy={busy} onSubmit={async event => {
            event.preventDefault();
            if (busy) return;
            setBusy(true); setError('');
            try {
              const result = await apiRequest<{ user: Staff }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
              setPassword(''); onLogin(result.user);
            } catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in failed.'); }
            finally { setBusy(false); }
          }}>
            <label className="ops-field">Work email<input className="input" type="email" autoComplete="username" placeholder="you@ahinteriors.co.uk" required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label>
            <label className="ops-field">Password<input className="input" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>
            {error && <p role="alert" className="ops-error">{error}</p>}
            <button type="submit" className="btn btn-primary ops-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={16} aria-hidden="true" /></button>
          </form>
          <p className="login-help">Need access? Contact your workspace manager.</p>
          <div className="login-secure"><ShieldCheck size={14} aria-hidden="true" />Your private staff workspace</div>
        </div>
        <footer>AH Interiors · Operations workspace</footer>
      </section>
    </main>
  );
}
