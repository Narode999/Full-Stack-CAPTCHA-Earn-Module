import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, X, ShieldCheck, TrendingUp } from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import BackButton from '../components/BackButton.jsx';
import { Button, CountUp, Metric, PageHead, SectionHead, Stagger, Loading } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hr ago';
  return new Date(value).toLocaleDateString();
}

function statusLabel(status) {
  if (status === 'CLAIMED') return 'Claimed';
  if (status === 'FORFEIT') return 'Declined';
  return 'Pending';
}

/**
 * Reward command centre.
 *
 * Every figure here is derived from server responses; nothing is invented
 * client-side. The balance animates to whatever /api/wallet/gems returned.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { balance, refresh } = useWallet();

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [history, security] = await Promise.all([api.history(), api.securityStats()]);
      setEntries(history.history || []);
      setStats(security.stats);
    } catch {
      // A failed side-panel load must not blank the whole dashboard.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    load();
  }, [load, refresh]);

  const derived = useMemo(() => {
    const weekAgo = Date.now() - WEEK_MS;
    const completed = entries.filter(e => e.result === 'CORRECT');
    const thisWeek = completed.filter(
      e => new Date(e.completedAt || e.createdAt).getTime() >= weekAgo
    );
    return {
      weekGems: thisWeek.reduce((s, e) => s + Number(e.rewardAmount || 0), 0),
      completedCount: completed.length,
      claimed: completed.filter(e => e.rewardStatus === 'CLAIMED').length
    };
  }, [entries]);

  const recent = entries.slice(0, 5);
  const firstName = String(user ? user.name : 'there').split(' ')[0];
  const score = stats
    ? Math.max(0, 100 - Math.round((stats.invalidPayloads + stats.replaysBlocked) * 4))
    : null;

  const badge =
    stats && stats.blockedAttempts > 0 ? (
      <span className="pill pill--green">
        <span className="dot dot--pulse" aria-hidden="true" />
        {stats.blockedAttempts} blocked
      </span>
    ) : (
      <span className="pill">All clear</span>
    );

  const rows = recent.map(entry => {
    const ok = entry.result === 'CORRECT';
    return (
      <motion.li
        key={entry.challengeId}
        className={'timeline__row' + (ok ? ' timeline__row--reward' : '')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="timeline__mark" aria-hidden="true">
          {ok ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
        </span>
        <span className="timeline__body">
          <span className="timeline__title">
            {ok ? 'Security verification' : 'Verification attempt'}
          </span>
          <span className="timeline__meta">
            {relativeTime(entry.completedAt || entry.createdAt)} + ' - ' + statusLabel(entry.rewardStatus)
          </span>
        </span>
        <span className={'timeline__value' + (ok ? '' : ' timeline__value--flat')}>
          {(ok ? '+' : '') + Number(entry.rewardAmount || 0).toFixed(2)}
        </span>
      </motion.li>
    );
  });

  const activity = loading ? (
    <Loading label="Loading activity" />
  ) : recent.length === 0 ? (
    <div className="state">
      <GemMark size={40} tone="purple" />
      <p className="state__title">No activity yet</p>
      <p>Complete your first verification to start earning.</p>
    </div>
  ) : (
    <ul className="timeline">{rows}</ul>
  );

  return (
    <div className="stack" style={{ gap: 'var(--s-6)' }}>

      <BackButton to="/earn" />
      <PageHead
        label="Overview"
        title={greeting() + ', ' + firstName}
        sub="Your reward journey"
        aside={badge}
      />

      <motion.section
        className="panel panel--hero hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Current gem balance"
      >
        <GemMark size={420} tone="gold" className="hero__watermark" />

        <div>
          <p className="label label--gold hero__label">Current balance</p>
          <p className="hero__value">
            <CountUp value={Number(balance) || 0} />
            <span className="hero__unit">Gems</span>
          </p>
          <p className="hero__delta">
            <TrendingUp size={15} style={{ color: 'var(--success)' }} aria-hidden="true" />
            <span>
              <b>+{derived.weekGems.toFixed(2)}</b> this week
            </span>
          </p>
        </div>

        <div className="hero__gem">
          <GemMark size={150} tone="gold" pulse title="Gem" />
        </div>
      </motion.section>

      <Stagger index={1}>
        <div className="grid grid--4">
          <Metric value={derived.weekGems.toFixed(2)} foot="This week" tone="gold" />
          <Metric value={derived.completedCount} foot="Tasks completed" tone="purple" />
          <Metric value={derived.claimed} foot="Rewards claimed" tone="green" />
          <Metric
            value={score === null ? '--' : score + '%'}
            foot="Security level"
            tone={score === null ? 'default' : 'green'}
          />
        </div>
      </Stagger>

      <div className="grid grid--split">
        <section className="panel">
          <div className="panel__body">
            <SectionHead
              label="Recent activity"
              title="Latest rewards"
              action={
                <Link to="/history" className="link-btn">
                  View all <ArrowRight size={15} aria-hidden="true" />
                </Link>
              }
            />
            {activity}
          </div>
        </section>

        <div className="stack" style={{ gap: 'var(--s-4)' }}>
          <section className="safe">
            <ShieldCheck size={26} style={{ flex: 'none' }} aria-hidden="true" />
            <div>
              <p className="safe__title">Protected</p>
              <p className="safe__sub">
                {stats
                  ? stats.blockedAttempts +
                    ' suspicious ' +
                    (stats.blockedAttempts === 1 ? 'attempt' : 'attempts') +
                    ' blocked'
                  : 'Checking your account...'}
              </p>
            </div>
            <Link to="/security" className="link-btn" style={{ marginLeft: 'auto' }}>
              <span className="sr-only">Open security monitor</span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </section>

          <section className="panel">
            <div className="panel__body stack" style={{ gap: 'var(--s-4)' }}>
              <div>
                <p className="label">Next step</p>
                <h2 className="shead__title" style={{ marginTop: 6 }}>Run a verification</h2>
                <p className="muted" style={{ fontSize: '0.875rem', marginTop: 6 }}>
                  Takes under a minute. Pays 1.00 gem every time.
                </p>
              </div>
              <Button as={Link} to="/earn" variant="primary" size="lg" block>
                Earn Gems <ArrowRight size={17} aria-hidden="true" />
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}