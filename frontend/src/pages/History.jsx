import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, ShieldCheck } from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import { PageHead, SectionHead, Loading } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' }
];

const WINDOWS = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(ts) {
  const today = startOfDay(Date.now());
  if (ts >= today) return 'Today';
  if (ts >= today - WINDOWS.today) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function statusLabel(status) {
  if (status === 'CLAIMED') return 'Claimed';
  if (status === 'FORFEIT') return 'Declined';
  return 'Pending';
}

function clockTime(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}



/**
 * Reward activity timeline.
 *
 * GET /api/captcha/history — every row is server-supplied. `correctOption` is
 * never selected by that endpoint, and no reward arithmetic happens here.
 */
export default function History() {
  const { token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

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

  const visible = useMemo(() => {
    if (filter === 'all') return entries;
    const cutoff = Date.now() - WINDOWS[filter];
    return entries.filter(e => new Date(e.completedAt || e.createdAt).getTime() >= cutoff);
  }, [entries, filter]);

  // Group by calendar day so the list reads as a timeline, not a table.
  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach(entry => {
      const ts = new Date(entry.completedAt || entry.createdAt).getTime();
      const key = startOfDay(ts);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...entry, ts });
    });
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([key, rows]) => ({
        key,
        label: dayLabel(key),
        rows: rows.sort((a, b) => b.ts - a.ts)
      }));
  }, [visible]);

  const totals = useMemo(() => {
    const monthCutoff = Date.now() - WINDOWS.month;
    const month = entries.filter(
      e => new Date(e.completedAt || e.createdAt).getTime() >= monthCutoff
    );
    return {
      total: entries.reduce((s, e) => s + Number(e.rewardAmount || 0), 0),
      monthTotal: month.reduce((s, e) => s + Number(e.rewardAmount || 0), 0),
      count: entries.length
    };
  }, [entries]);

  return (
    <div className="stack" style={{ gap: 'var(--s-6)' }}>
      <PageHead
        label="Activity"
        title="Reward activity"
        sub="Every challenge you have completed, straight from the server."
      />

      <div className="summary">
        <div className="summary__cell">
          <span className="summary__val">{totals.total.toFixed(2)}</span>
          <span className="label">Total earned</span>
        </div>
        <div className="summary__cell">
          <span className="summary__val">{totals.monthTotal.toFixed(2)}</span>
          <span className="label">This month</span>
        </div>
        <div className="summary__cell">
          <span className="summary__val">{totals.count}</span>
          <span className="label">Activities</span>
        </div>
      </div>

      <div className="filters" role="group" aria-label="Filter activity">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel__body">
          <SectionHead label="Timeline" title="All rewards" />

          {loading ? (
            <Loading label="Loading your activity" />
          ) : error ? (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          ) : groups.length === 0 ? (
            <div className="state">
              <GemMark size={44} tone="purple" />
              <p className="state__title">Nothing here yet</p>
              <p>
                {filter === 'all'
                  ? 'Complete a verification and your rewards will appear here.'
                  : 'No activity in this period. Try a wider range.'}
              </p>
            </div>
          ) : (
            groups.map(group => (
              <div className="timeline__group" key={group.key}>
                <div className="timeline__head">
                  <p className="label">{group.label}</p>
                  <span className="timeline__meta">
                    {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <ul className="timeline">
                  {group.rows.map(entry => {
                    const ok = entry.result === 'CORRECT';
                    return (
                      <motion.li
                        key={entry.challengeId}
                        className={`timeline__row ${ok ? 'timeline__row--reward' : ''}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <span className="timeline__mark" aria-hidden="true">
                          {ok ? (
                            <Check size={15} strokeWidth={3} />
                          ) : (
                            <X size={15} strokeWidth={3} />
                          )}
                        </span>

                        <span className="timeline__body">
                          <span className="timeline__title">
                            {ok ? 'Security verification' : 'Verification attempt'}
                          </span>
                          <span className="timeline__meta">
                            {clockTime(entry.completedAt || entry.createdAt)} ·{' '}
                            {statusLabel(entry.rewardStatus)}
                          </span>
                        </span>

                        <span className={`timeline__value${ok ? '' : ' timeline__value--flat'}`}>
                          {ok ? '+' : ''}
                          {Number(entry.rewardAmount || 0).toFixed(2)}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="notice notice--info">
        <ShieldCheck
          size={16}
          style={{ color: 'var(--success)', flex: 'none' }}
          aria-hidden="true"
        />
        <span>Correct answers are never shown here — they stay on the server.</span>
      </p>
    </div>
  );
}


