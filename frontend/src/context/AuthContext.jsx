import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const STORAGE_KEY = 'veloop-auth';

const AuthContext = createContext(null);

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.token ? parsed : null;
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
    const next = { token: data.token, user: data.user, balance: data.balance ?? 0 };
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

  const setBalance = useCallback(balance => {
    setSession(prev => {
      if (!prev) return prev;
      const next = { ...prev, balance };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      token: session ? session.token : null,
      user: session ? session.user : null,
      balance: session ? session.balance : 0,
      isAuthenticated: Boolean(session && session.token),
      booting,
      login,
      register,
      logout,
      setBalance
    }),
    [session, booting, login, register, logout, setBalance]
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
