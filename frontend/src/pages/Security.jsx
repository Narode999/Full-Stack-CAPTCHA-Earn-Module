import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ban, AlertTriangle, ShieldCheck, Radio, RefreshCcw, Fingerprint } from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import { PageHead, SectionHead, Loading } from '../components/ui.jsx';
import { api } from '../lib/api.js';

const POLL_MS = 4000;
const TONE_ICON = { danger: Ban, warn: AlertTriangle, ok: ShieldCheck, neutral: Radio };

function clock(value) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

/**
 * Live threat monitor.
 *
 * Renders the caller's own append-only audit trail. Every blocked attempt
 * appears here as it happens, which is the point: the defences are not just
 * claimed, they are observable.
 */
export default function Security() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    clearInterval(timer.current);
    if (live) timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [live, load]);

  const score = stats
    ? Math.max(0, 100 - Math.round((stats.invalidPayloads + stats.replaysBlocked) * 4))
    : null;
  const blocked = stats ? stats.blockedAttempts : 0;

  return (
    <div className="stack" style={{ gap: 'var(--s-6)' }}>
      <PageHead
        label="Security"
        title="Security status"
        sub="Your account's own audit trail, updating live."
        aside={
          <button
            type="button"
            className={`pill${live ? ' pill--green' : ''}`}
            onClick={() => setLive(v => !v)}
            aria-pressed={live}
            style={{ cursor: 'pointer', minHeight: 34 }}
          >
            <span className={`dot${live ? ' dot--pulse' : ''}`} aria-hidden="true" />
            {live ? 'Live' : 'Paused'}
          </button>
        }
      />

      <motion.section
        className="console"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Account security status"
      >
        <div className="console__status">
          <span className="dot dot--pulse" aria-hidden="true" />
          <span className="console__title">Protected</span>
        </div>

        <div className="readout">
          <div className="readout__item">
            <p className="label">Account</p>
            <p className="readout__val" style={{ color: 'var(--success)' }}>Protected</p>
          </div>
          <div className="readout__item">
            <p className="label">Last verification</p>
            <p className="readout__val">
              {stats && stats.lastVerificationAt
                ? new Date(stats.lastVerificationAt).toLocaleTimeString(undefined, {
                    hour: '2-digit', minute: '2-digit'
                  })
                : '—'}
            </p>
          </div>
          <div className="readout__item">
            <p className="label">Login activity</p>
            <p className="readout__val">{stats ? stats.successfulLogins : '—'}</p>
          </div>
          <div className="readout__item">
            <p className="label">Suspicious activity</p>
            <p className="readout__val" style={{ color: 'var(--success)' }}>
              {blocked === 0 ? 'None detected' : blocked + ' blocked'}
            </p>
          </div>
        </div>

        {score !== null && (
          <div className="readout__item" style={{ marginTop: 'var(--s-5)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="label">Security level</p>
              <p className="label label--green">{score}%</p>
            </div>
            <div className="meter">
              <span className="meter__fill" style={{ width: score + '%' }} />
            </div>
          </div>
        )}
      </motion.section>

      <div className="grid grid--4">
        <div className="metric">
          <span className="metric__value" style={{ color: 'var(--danger)' }}>
            {stats ? blocked : '—'}
          </span>
          <span className="metric__foot">Attacks blocked</span>
        </div>
        <div className="metric">
          <span className="metric__value metric__value--gold">
            {stats ? stats.invalidPayloads + stats.replaysBlocked : '—'}
          </span>
          <span className="metric__foot">Cheats rejected</span>
        </div>
        <div className="metric">
          <span className="metric__value metric__value--green">
            {stats ? Number(stats.gemsEarned).toFixed(1) : '—'}
          </span>
          <span className="metric__foot">Gems earned</span>
        </div>
        <div className="metric">
          <span className="metric__value metric__value--purple">
            {stats ? stats.expiredChallenges : '—'}
          </span>
          <span className="metric__foot">Expired challenges</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel__body">
          <SectionHead
            label="Event stream"
            title="Recent events"
            action={
              <button type="button" className="link-btn" onClick={load}>
                <RefreshCcw size={15} aria-hidden="true" /> Refresh
              </button>
            }
          />

          {error ? (
            <p className="notice notice--error" role="alert">{error}</p>
          ) : loading ? (
            <Loading label="Connecting to the audit log" />
          ) : events.length === 0 ? (
            <div className="state">
              <GemMark size={44} tone="green" />
              <p className="state__title">No security events</p>
              <p>Nothing has been blocked on your account. Run the Postman negative tests to watch attacks get rejected live.</p>
            </div>
          ) : (
            <ul className="timeline">
              <AnimatePresence initial={false}>
                {events.map(e => {
                  const Icon = TONE_ICON[e.tone] || Radio;
                  return (
                    <motion.li
                      key={e.id}
                      className={`event event--${e.tone || 'neutral'}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      layout
                    >
                      <span className="event__icon" aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <span className="timeline__body">
                        <span className="event__label">{e.label}</span>
                        {e.detail ? <span className="event__detail">{e.detail}</span> : null}
                      </span>
                      <span className="event__time">{clock(e.createdAt)}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>

      <p className="notice notice--green">
        <Fingerprint size={16} style={{ color: 'var(--success)', flex: 'none' }} aria-hidden="true" />
        <span>Scoped to your account — it never shows another user&apos;s activity, and never a correct answer.</span>
      </p>
    </div>
  );
}