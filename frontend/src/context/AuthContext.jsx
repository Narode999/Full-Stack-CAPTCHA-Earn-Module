import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const STORAGE_KEY = 'veloop-auth';

const AuthContext = createContext(null);

/**
 * Only the token and the user profile are persisted.
 *
 * The gem balance is deliberately NOT stored here (spec section 43). If it
 * were, a user could edit one value in devtools and the UI would render a
 * balance the server never agreed to. The balance is always read from
 * `GET /api/wallet/gems`, which the WalletContext owns.
 */
function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token) return null;
    // Rebuild the shape defensively so an older payload that still carries a
    // cached balance cannot leak back into the app on the next write.
    return { token: parsed.token, user: parsed.user || null };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (!session) localStorage.removeItem(STORAGE_KEY);
    setBooting(false);
  }, [session]);

  const persist = useCallback(data => {
    const next = { token: data.token, user: data.user || null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    return next;
  }, []);

  const login = useCallback(async credentials => persist(await api.login(credentials)), [persist]);

  const register = useCallback(async payload => persist(await api.register(payload)), [persist]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      token: session ? session.token : null,
      user: session ? session.user : null,
      isAuthenticated: Boolean(session && session.token),
      booting,
      login,
      register,
      logout
    }),
    [session, booting, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

