import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Gem, ShieldCheck, RefreshCcw, Loader2, Gift, Zap, Smartphone, Lock, Sparkles, ChevronLeft } from 'lucide-react';
import OptionCard from '../components/OptionCard.jsx';
import CheckingState from '../components/CheckingState.jsx';
import ResultModal from '../components/ResultModal.jsx';
import CinematicBackdrop from '../components/CinematicBackdrop.jsx';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

const SCAN_DURATION_MS = 500;
const DEAD_CHALLENGE_CODES = ['CHALLENGE_EXPIRED', 'CHALLENGE_ALREADY_COMPLETED', 'CHALLENGE_UNAVAILABLE'];

/** The five trust points shown beneath the card in the reference design. */
const FEATURES = [
  { icon: ShieldCheck, title: 'SECURE', copy: 'Advanced protection for your account', tone: '#4c8dff' },
  { icon: Gift, title: 'REWARDING', copy: 'Earn gems for completing verification', tone: '#a78bfa' },
  { icon: Zap, title: 'FAST', copy: 'Quick verification and rewards', tone: '#f5c451' },
  { icon: Smartphone, title: 'MOBILE FIRST', copy: 'Optimized experience on every device', tone: '#4ade80' },
  { icon: Lock, title: 'TRUSTED', copy: 'Your security is our priority', tone: '#fbbf24' }
];

function FeatureStrip() {
  return (
    <ul className="features">
      {FEATURES.map(({ icon: Icon, title, copy, tone }) => (
        <li className="feature" key={title}>
          <span className="feature-icon" style={{ color: tone }}>
            <Icon size={20} />
          </span>
          <span className="feature-body">
            <strong>{title}</strong>
            <span>{copy}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The five states of the reference flow:
 *   loading -> challenge -> selected -> verifying -> result
 */
export default function CaptchaEarn() {
  const { user, token, balance: authBalance, setBalance: setAuthBalance } = useAuth();
  const { balance, setBalance } = useWallet();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading');
  const [challenge, setChallenge] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimStep, setClaimStep] = useState('idle');
  const scanTimer = useRef(null);

  const headerBalance = Number(balance || authBalance || 0).toFixed(2);

  // Which of the three visually distinct screens is on stage.
  const stageKey =
    phase === 'verifying' ? 'verifying' : phase === 'result' ? 'result' : 'challenge';

  // The backdrop takes its colour from the outcome, so success glows green
  // and failure glows red without any extra plumbing.
  const mood = useMemo(() => {
    if (stageKey === 'verifying') return 'verifying';
    if (stageKey === 'result') return 'result';
    return 'challenge';
  }, [stageKey]);

  // Cinematic crossfade between screens. When the user prefers reduced
  // motion we drop to a plain opacity fade with no movement or blur.
  const stageVariants = useMemo(
    () => ({
      enter: reduceMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 26, scale: 0.985, filter: 'blur(10px)' },
      center: reduceMotion
        ? { opacity: 1, transition: { duration: 0.2 } }
        : {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: 'blur(0px)',
            transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
          },
      exit: reduceMotion
        ? { opacity: 0, transition: { duration: 0.15 } }
        : {
            opacity: 0,
            y: -18,
            scale: 1.02,
            filter: 'blur(10px)',
            transition: { duration: 0.26, ease: [0.4, 0, 1, 1] }
          }
    }),
    [reduceMotion]
  );

  // The card itself lifts very slightly on the result screens, so the
  // success/failure state reads as a beat rather than a plain swap.
  const cardVariants = useMemo(
    () => ({
      challenge: { boxShadow: '0 24px 60px rgba(3, 5, 16, 0.65)' },
      verifying: { boxShadow: '0 24px 70px rgba(76, 60, 200, 0.34)' },
      result: reduceMotion
        ? {}
        : {
            boxShadow:
              stageKey === 'result'
                ? '0 30px 80px rgba(3, 5, 16, 0.8)'
                : '0 24px 60px rgba(3, 5, 16, 0.65)'
          }
    }),
    [stageKey, reduceMotion]
  );

  const loadChallenge = useCallback(
    async (forceNew = false) => {
      if (!token) return;
      setError('');
      setSelected(null);
      setResult(null);
      setScanning(false);
      try {
        const data = forceNew ? await api.newChallenge() : await api.currentChallenge();
        setChallenge(data.challenge);
        setPhase('challenge');
      } catch (err) {
        setError(err.message);
        setPhase('challenge');
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return undefined;
    loadChallenge(false);
    return () => clearTimeout(scanTimer.current);
  }, [token, loadChallenge]);

  // Expiry countdown - the server is still the authority, this is only a hint.
  useEffect(() => {
    if (!challenge || phase === 'result' || phase === 'verifying') return undefined;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.round((new Date(challenge.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
      if (remaining === 0) setError('This code has expired. Request a new one to continue.');
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [challenge, phase]);

  const handleSelect = option => {
    if (phase !== 'challenge' && phase !== 'selected') return;
    setSelected(option);
    setError('');
    setPhase('selected');

    // ~0.5s scanning sweep across the chosen card.
    clearTimeout(scanTimer.current);
    setScanning(true);
    scanTimer.current = setTimeout(() => setScanning(false), SCAN_DURATION_MS);
  };

  const handleSubmit = async () => {
    if (!challenge || !selected || phase === 'verifying') return;

    setPhase('verifying');
    setError('');

    try {
      const data = await api.verifyCaptcha({
        challengeId: challenge.challengeId,
        selectedOption: selected,
        signature: challenge.signature
      });

      setResult({
        outcome: data.result,
        rewardAmount: data.reward?.amount ?? 0,
        balanceBefore: data.balanceBefore,
        newBalance: data.newBalance,
        rewardStatus: 'PENDING',
        challengeId: data.challengeId || challenge.challengeId
      });

      // The reward is only PENDING now. The wallet has NOT changed yet.
      setPhase('result');
    } catch (err) {
      setError(err.message);
      setPhase('challenge');

      // A dead challenge cannot be retried - swap in a fresh one.
      if (err instanceof ApiError && DEAD_CHALLENGE_CODES.includes(err.code)) {
        loadChallenge(true);
      }
    }
  };

  const handleNewCode = async () => {
    setRefreshing(true);
    await loadChallenge(true);
    setRefreshing(false);
  };

  /**
   * Claim the pending reward (spec sections 29-32).
   *
   * A short "preparing" beat stands in for the rewarded-ad step the spec
   * describes in section 36. No real ad network is involved.
   */
  const handleClaim = async () => {
    if (!result || result.rewardStatus === 'CLAIMED' || claiming) return;


    setClaiming(true);
    setClaimStep('preparing');

    // Mock rewarded-ad beat (~1.2s), clearly a dev/demo state.
    await new Promise(resolve => setTimeout(resolve, 1200));
    setClaimStep('reward');

    try {
      const data = await api.claimReward({ challengeId: result.challengeId });

      setResult(prev => ({
        ...prev,
        rewardStatus: 'CLAIMED',
        balanceBefore: data.balanceBefore,
        newBalance: data.newBalance
      }));

      // Balance is refreshed from the server, never computed locally.
      const balanceNow = Number(data.newBalance);
      setBalance(balanceNow);
      setAuthBalance(balanceNow);
    } catch (err) {
      setError(err.message);
    } finally {
      setClaiming(false);
      setClaimStep('idle');
    }
  };

  /** "No Thanks" (spec section 33) - forfeit the reward, then a fresh challenge. */
  const handleDecline = async () => {
    if (!result || claiming) return;
    setClaiming(true);
    try {
      await api.declineReward({ challengeId: result.challengeId });
    } catch {
      // Forfeiting is best-effort: the user still gets a new challenge.
    } finally {
      setClaiming(false);
      await loadChallenge(true);
    }
  };

  return (
    <div className="app-shell">
      <CinematicBackdrop mood={mood} />

      <header className="topbar">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back to dashboard"
          onClick={() => navigate('/dashboard')}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="brand">
          <span className="brand-name">VELOOP</span>
          <span className="brand-sub">REWARDS</span>
        </div>

        <div className="balance-pill">
          <Gem size={16} className="gem-icon" />
          <span>{headerBalance}</span>
        </div>
      </header>

      {user && <p className="greeting">Welcome back, {user.name}</p>}

      <motion.main
        className="card"
        animate={cardVariants[stageKey] || cardVariants.challenge}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stageKey}
            className="stage"
            variants={stageVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {phase === 'verifying' ? (
              <CheckingState selectedOption={selected} />
            ) : phase === 'result' && result ? (
              <ResultModal
                outcome={result.outcome}
                rewardAmount={result.rewardAmount}
                balanceBefore={result.balanceBefore}
                newBalance={result.newBalance}
                rewardStatus={result.rewardStatus}
                claiming={claiming}
                onClaim={handleClaim}
                onDecline={handleDecline}
              />
            ) : (
              <>
            <h1 className="title">
              Earn <span className="gold">Gems</span>
            </h1>
            <p className="subtitle">Complete a quick security check to earn rewards.</p>

            <div className="code-panel">
              {challenge && challenge.difficulty && (
                <span className={`difficulty-tag lvl-${challenge.difficulty.level}`}>
                  {challenge.difficulty.label}
                </span>
              )}

              <p className="code-value">
                {challenge ? challenge.captchaText : '\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7'}
              </p>

              <button type="button" className="new-code" onClick={handleNewCode} disabled={refreshing}>
                {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                New Code
              </button>
            </div>

            <p className="pick-hint">Select the matching code</p>

            <div className="options-grid">
              {(challenge ? challenge.options : []).map((option, index) => (
                <OptionCard
                  key={option}
                  option={option}
                  index={index}
                  selected={selected}
                  scanning={scanning}
                  revealed={phase === 'result'}
                  outcome={result ? result.outcome : null}
                  disabled={phase === 'loading'}
                  onSelect={handleSelect}
                />
              ))}
            </div>

            {/* The reference design only reveals the submit button once an
                option is chosen, so it is not rendered at all before that. */}
            {selected && (
              <motion.button
                type="button"
                className="btn btn-primary submit-btn"
                onClick={handleSubmit}
                disabled={secondsLeft === 0}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                Submit Answer
              </motion.button>
            )}

            {error && <p className="error-text">{error}</p>}

            <p className="note-row">
              <ShieldCheck size={16} />
              <span>This helps protect your account from automated access.</span>
            </p>

            {/* Reward banner only appears on the two challenge screens. */}
            {phase !== 'result' && (
              <div className="reward-banner">
                <Gem size={20} className="gem-icon" />
                <span>
                  Complete verification to earn
                  <br />
                  <strong>+1 Gem</strong>
                </span>
              </div>
            )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.main>

      <FeatureStrip />

      {/* Mock rewarded-ad beat (spec section 36).
          Intentionally a demo state - no ad network is integrated. */}
      <AnimatePresence>
        {claiming && (
          <motion.div
            className="ad-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            role="status"
            aria-live="polite"
          >
            <motion.div
              className="ad-card"
              initial={{ scale: 0.88, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 20 }}
            >
              {claimStep === 'preparing' ? (
                <>
                  <Loader2 size={34} className="spin gem-icon" />
                  <h3>Preparing reward…</h3>
                  <p>Mock rewarded ad — development only</p>
                </>
              ) : (
                <>
                  <Sparkles size={34} className="gem-icon" />
                  <h3>Reward completed</h3>
                  <p>Adding to your balance…</p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

