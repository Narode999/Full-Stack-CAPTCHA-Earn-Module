import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { WalletProvider } from './context/WalletContext.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaptchaEarn from './pages/CaptchaEarn.jsx';
import History from './pages/History.jsx';
import Security from './pages/Security.jsx';

function AuthGate() {
  const { isAuthenticated, booting } = useAuth();

  if (booting) {
    return <div className="boot-screen">Loading your rewards…</div>;
  }

  if (!isAuthenticated) return <AuthScreen />;

  // Authenticated area. /earn is the default landing target.
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/earn" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/earn" element={<CaptchaEarn />} />
      <Route path="/history" element={<History />} />
      <Route path="/security" element={<Security />} />
      <Route path="*" element={<Navigate to="/earn" replace />} />
    </Routes>
  );
}

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login({ email: form.email, password: form.password });
      } else {
        await register(form);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <h1 className="title">
          VELOOP <span className="gold">REWARDS</span>
        </h1>
        <p className="subtitle">Sign in to start earning gems.</p>

        <div className="auth-toggle">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              <span>Name</span>
              <input name="name" value={form.name} onChange={handleChange} placeholder="Jane Doe" required />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WalletProvider>
          <AuthGate />
        </WalletProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
