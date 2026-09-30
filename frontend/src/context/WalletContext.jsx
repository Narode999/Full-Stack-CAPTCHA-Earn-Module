import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const WalletContext = createContext(null);

/**
 * Server-authoritative wallet (spec sections 42 and 43).
 *
 * Nothing about the balance is persisted in the browser. It is fetched from
 * `GET /api/wallet/gems` and refreshed after any action that can move it, so
 * a user editing devtools or localStorage cannot change what they own.
 */
export function WalletProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [balance, setBalanceState] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const setBalance = useCallback(next => {
    const value = Number(next);
    if (Number.isFinite(value)) setBalanceState(value);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) {
      setBalanceState(0);
      setLoaded(true);
      return null;
    }
    setSyncing(true);
    try {
      const data = await api.walletBalance();
      setBalanceState(Number(data.balance) || 0);
      return data.balance;
    } catch {
      return null;
    } finally {
      setSyncing(false);
      setLoaded(true);
    }
  }, [token]);

  // Fetch once the session exists, and again whenever identity changes.
  useEffect(() => {
    if (!isAuthenticated) {
      setBalanceState(0);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    refresh();
  }, [isAuthenticated, token, refresh]);

  const value = useMemo(
    () => ({ balance, setBalance, refresh, syncing, loaded }),
    [balance, setBalance, refresh, syncing, loaded]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}


export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
