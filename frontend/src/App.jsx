import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { WalletProvider } from './context/WalletContext.jsx';
import AppShell from './components/AppShell.jsx';
import GemMark from './components/GemMark.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CaptchaEarn from './pages/CaptchaEarn.jsx';
import History from './pages/History.jsx';
import Security from './pages/Security.jsx';

function BootScreen() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'center',
        gap: 20
      }}
    >
      <GemMark size={56} tone="gold" pulse />
      <p className="label">Loading your rewards</p>
    </div>
  );
}

function AuthenticatedArea() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/earn" element={<CaptchaEarn />} />
        <Route path="/history" element={<History />} />
        <Route path="/security" element={<Security />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

function AuthGate() {
  const { isAuthenticated, booting } = useAuth();

  if (booting) return <BootScreen />;
  if (!isAuthenticated) return <AuthPage />;
  return <AuthenticatedArea />;
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

