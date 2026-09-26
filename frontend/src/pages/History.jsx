import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gem, Check, X, Loader2, Clock, ShieldCheck } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

const STATUS_LABEL = {
  PENDING: 'Reward pending',
  CLAIMED: 'Claimed',
  FORFEIT: 'Declined'
};

/**
 * GET /api/captcha/history  (spec sections 45 and 75)
 *
 * Every row is server-supplied. `correctOption` is never selected by that
 * endpoint, and no reward arithmetic happens here.
 */
export default function History() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { balance } = useWallet();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.history();
      setEntries(data.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app-shell">
      <CinematicBackdrop mood="challenge" />

      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back to earn"
          onClick={() => navigate('/earn')}
        >
          <ChevronLeft size={20} />
        </button>

        <div className="brand">
          <span className="brand-name">VELOOP</span>
          <span className="brand-sub">HISTORY</span>
        </div>

        <div className="balance-pill">
          <Gem size={16} className="gem-icon" />
          <span>{Number(balance || 0).toFixed(2)}</span>
        </div>
      </header>

      <main className="card">
        <h1 className="title">
          Your <span className="gold">History</span>
        </h1>
        <p className="subtitle">Every challenge you have completed, straight from the server.</p>

        {loading ? (
          <div className="state-box">
            <Loader2 size={22} className="spin" />
            <p>Loading your activity…</p>
          </div>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : entries.length === 0 ? (
          <div className="state-box">
            <Clock size={22} />
            <p>No completed challenges yet.</p>
          </div>
        ) : (
          <ul className="history-list">
            {entries.map((entry, i) => {
              const isCorrect = entry.result === 'CORRECT';
              return (
                <motion.li
                  className="history-row"
                  key={entry.challengeId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <span className={`history-icon ${isCorrect ? 'ok' : 'no'}`}>
                    {isCorrect ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
                  </span>

                  <span className="history-body">
                    <strong>{entry.captchaText}</strong>
                    <span className="history-date">
                      {new Date(entry.completedAt || entry.createdAt).toLocaleString()}
                    </span>
                    <span className={`history-status st-${entry.rewardStatus}`}>
                      {STATUS_LABEL[entry.rewardStatus] || entry.rewardStatus}
                    </span>
                  </span>

                  <span className="history-reward">
                    <Gem size={14} className="gem-icon" />
                    +{entry.rewardAmount}
                  </span>
                </motion.li>
              );
            })}
          </ul>
        )}

        <p className="note-row">
          <ShieldCheck size={16} />
          <span>Correct answers are never shown here — they stay on the server.</span>
        </p>
      </main>

      <div className="history-footer">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/earn')}>
          Earn More Gems
        </button>
      </div>
    </div>
  );
}
