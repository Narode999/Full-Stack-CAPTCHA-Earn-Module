import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck, AlertTriangle, Radio, RefreshCcw, Gem, Ban, Fingerprint } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.jsx';
import { api } from '../lib/api.js';

const POLL_MS = 4000;

const TONE_ICON = {
  danger: Ban,
  warn: AlertTriangle,
  ok: ShieldCheck,
  neutral: Radio
};

/**
 * Live threat monitor.
 *
 * Renders the caller's own append-only audit trail. Every blocked attempt
 * appears here as it happens, which is the point: the defences are not just
 * claimed, they are observable.
 */
export default function Security() {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(true);
  const [error, setError] = useState('');
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const [threats, s] = await Promise.all([api.securityThreats(30), api.securityStats()]);
      setEvents(threats.events || []);
      setStats(s.stats);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    clearInterval(timer.current);
    if (live) timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [live, load]);

  return (
    <div className="app-shell">
      <CinematicBackdrop mood={stats && stats.blockedAttempts > 0 ? 'verifying' : 'challenge'} />

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
          <span className="brand-sub">SECURITY</span>
        </div>

        <button
          type="button"
          className={`live-toggle ${live ? 'on' : ''}`}
          onClick={() => setLive(v => !v)}
          aria-pressed={live}
        >
          <span className="live-dot" aria-hidden="true" />
          {live ? 'LIVE' : 'PAUSED'}
        </button>
      </header>

      <main className="card">
        <h1 className="title">
          Threat <span className="gold">Monitor</span>
        </h1>
        <p className="subtitle">
          Every blocked attempt against your account, straight from the audit log.
        </p>

        {stats && (
          <div className="stat-grid">
            <motion.div className="stat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <AlertTriangle size={17} className="stat-icon danger" />
              <strong>{stats.blockedAttempts}</strong>
              <span>Attacks blocked</span>
            </motion.div>
            <motion.div
              className="stat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
            >
              <Fingerprint size={17} className="stat-icon warn" />
              <strong>{stats.injectionsBlocked + stats.replaysBlocked}</strong>
              <span>Cheats rejected</span>
            </motion.div>
            <motion.div
              className="stat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
            >
              <Gem size={17} className="stat-icon gold" />
              <strong>{Number(stats.gemsEarned).toFixed(1)}</strong>
              <span>Gems earned</span>
            </motion.div>
          </div>
        )}

        <div className="threat-head">
          <span>RECENT EVENTS</span>
          <button type="button" className="new-code" onClick={load} aria-label="Refresh">
            <RefreshCcw size={13} /> Refresh
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}

        {!error && events.length === 0 ? (
          <div className="state-box">
            <ShieldCheck size={22} />
            <p>No security events yet. Run the Postman negative tests to watch attacks get blocked live.</p>
          </div>
        ) : (
          <ul className="threat-list">
            <AnimatePresence initial={false}>
              {events.map(e => {
                const Icon = TONE_ICON[e.tone] || Radio;
                return (
                  <motion.li
                    key={e.id}
                    className={`threat-row tone-${e.tone}`}
                    initial={{ opacity: 0, x: -14, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 14, height: 0 }}
                    transition={{ duration: 0.3 }}
                    layout
                  >
                    <span className="threat-icon">
                      <Icon size={15} />
                    </span>
                    <span className="threat-body">
                      <strong>{e.label}</strong>
                      {e.detail && <span className="threat-detail">{e.detail}</span>}
                    </span>
                    <span className="threat-time">{new Date(e.createdAt).toLocaleTimeString()}</span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}

        <p className="note-row">
          <ShieldCheck size={16} />
          <span>
            Scoped to your account - it never shows another user&apos;s activity, and never a
            correct answer.
          </span>
        </p>
      </main>

      <div className="history-footer">
        <button type="button" className="btn btn-primary" onClick={() => navigate('/earn')}>
          Back to Earn
        </button>
      </div>
    </div>
  );
}

