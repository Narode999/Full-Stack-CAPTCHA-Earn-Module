import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const WalletContext = createContext(null);

/**
 * Wallet balance lives here so that the captcha screen and the header can
 * never disagree. The value is only ever written from a server response.
 */
export function WalletProvider({ children }) {
  const [balance, setBalanceState] = useState(125.5);
  const [syncing, setSyncing] = useState(false);

  const setBalance = useCallback(next => {
    const value = Number(next);
    if (Number.isFinite(value)) setBalanceState(value);
  }, []);

  const refresh = useCallback(async () => {
    setSyncing(true);
    try {
      const data = await api.walletBalance();
      setBalance(data.balance);
      return data.balance;
    } catch {
      return null;
    } finally {
      setSyncing(false);
    }
  }, [setBalance]);

  const value = useMemo(
    () => ({ balance, setBalance, refresh, syncing }),
    [balance, setBalance, refresh, syncing]
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
