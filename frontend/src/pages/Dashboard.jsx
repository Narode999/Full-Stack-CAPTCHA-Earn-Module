import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Gem, ShieldCheck, History, Zap, LogOut, Gift } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

/** Landing page. The back chevron on the earn screen returns here. */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { balance } = useWallet();

  return (
    <div className="app-shell">
      <CinematicBackdrop mood="challenge" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-name">VELOOP</span>
          <span className="brand-sub">REWARDS</span>
        </div>

        <button type="button" className="logout-btn" onClick={logout}>
          <LogOut size={16} />
          Logout
        </button>
      </header>

      <main className="card">
        <p className="greeting">Welcome back, {user ? user.name : 'there'}</p>

        <div className="balance-hero">
          <span className="balance-hero-label">Your Gem Balance</span>
          <span className="balance-hero-value">
            <Gem size={30} className="gem-icon" />
            {Number(balance || 0).toFixed(2)}
          </span>
        </div>

        <div className="dash-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/earn')}>
            <Zap size={17} />
            Earn Gems
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/history')}>
            <History size={17} />
            View History
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/security')}>
            <ShieldCheck size={17} />
            Threat Monitor
          </button>
        </div>

        <p className="note-row">
          <ShieldCheck size={16} />
          <span>Every reward is decided and paid on the server.</span>
        </p>

        <div className="reward-banner">
          <Gift size={20} className="gem-icon" />
          <span>
            Complete a quick security check
            <br />
            <strong>and earn Gems</strong>
          </span>
        </div>
      </main>
    </div>
  );
}
