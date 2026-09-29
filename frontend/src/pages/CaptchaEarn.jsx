import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, X, ArrowRight, ShieldCheck, RefreshCcw, Lock, AlertCircle } from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import { Button, CountUp, PageHead } from '../components/ui.jsx';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

const SCAN_DURATION_MS = 500;
const DEAD_CHALLENGE_CODES = [
  'CHALLENGE_EXPIRED',
  'CHALLENGE_ALREADY_COMPLETED',
  'CHALLENGE_UNAVAILABLE'
];

const STEPS = [{ id: 1, label: 'Verify' }, { id: 2, label: 'Reward' }];

/**
 * The earn ritual.
 *
 * One `phase` drives three visual states: challenge -> verifying -> result.
 * All reward truth comes from the server. Verify records the reward as
 * PENDING; only the claim call moves the balance, so the figure shown before
 * claiming is the true, un-claimed balance.
 */
export default function CaptchaEarn() {
  const { token, setBalance: setAuthBalance } = useAuth();
  const { balance, setBalance } = useWallet();
  const reduceMotion = useReducedMotion();

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
        rewardAmount: (data.reward && data.reward.amount) || 0,
        balanceBefore: data.balanceBefore,
        newBalance: data.newBalance,
        rewardStatus: 'PENDING',
        challengeId: data.challengeId || challenge.challengeId
      });
      setPhase('result');
    } catch (err) {
      setError(err.message);
      setPhase('challenge');
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

  const handleClaim = async () => {
    if (!result || result.rewardStatus === 'CLAIMED' || claiming) return;
    setClaiming(true);
    setClaimStep('preparing');
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

  const isResult = phase === 'result';
  const isVerifying = phase === 'verifying';
  const isCorrect = result ? result.outcome === 'CORRECT' : false;
  const isClaimed = result ? result.rewardStatus === 'CLAIMED' : false;
  const stage = reduceMotion ? 0 : 14;

  const steps = STEPS.map((step, i) => {
    const active = isCorrect || (!isResult && step.id === 1);
    const done = isResult && step.id === 1;
    return (
      <span key={step.id} style={{ display: 'contents' }}>
        {i > 0 && <span className="steps__rule" />}
        <span
          className={
            'steps__item' + (active ? ' steps__item--active' : done ? ' steps__item--done' : '')
          }
        >
          <span className="steps__num">0{step.id}</span>
          {step.label}
        </span>
      </span>
    );
  });

  return (
    <div className="stack" style={{ gap: 'var(--s-6)' }}>
      <PageHead
        label="Earn"
        title="Verify to unlock"
        sub="Confirm the code below to unlock your reward."
        aside={
          <span className="pill pill--gold">
            <GemMark size={13} />
            <CountUp value={Number(balance) || 0} />
          </span>
        }
      />

      <div className="steps" aria-hidden="true">
        {steps}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.section
            key="loading"
            className="panel panel__body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="state">
              <span className="spinner" aria-hidden="true" />
              <p className="label">Requesting a challenge</p>
            </div>
          </motion.section>
        )}

        {isVerifying && (
          <motion.section
            key="verifying"
            className="panel"
            initial={{ opacity: 0, y: stage }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="verifying" role="status" aria-live="polite">
              <span className="verifying__mark">
                <Lock size={30} strokeWidth={2} />
              </span>
              <h2 className="shead__title">Verifying</h2>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Checking your answer against the server
                {selected ? ' (' + selected + ')' : ''}
              </p>
              <div className="verifying__track" aria-hidden="true">
                <motion.span
                  className="verifying__fill"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.section>
        )}

        {isResult && result && (
          <motion.section
            key="result"
            className={'panel result ' + (isCorrect ? 'result--ok' : 'result--fail')}
            initial={{ opacity: 0, y: stage }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            role="status"
            aria-live="polite"
          >
            <motion.div
              className="result__mark"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            >
              {isCorrect ? <GemMark size={40} tone="gold" pulse /> : <X size={34} strokeWidth={3} />}
            </motion.div>

            <h2 className="shead__title">
              {isCorrect ? 'Verification complete' : 'Verification unsuccessful'}
            </h2>

            {isCorrect ? (
              <Fragment>
                <p className="result__gain">
                  <GemMark size={22} />
                  +{result.rewardAmount} Gems
                </p>

                {isClaimed ? (
                  <div className="balance-move">
                    <div className="balance-move__col">
                      <span className="balance-move__num">
                        {Number(result.balanceBefore).toFixed(2)}
                      </span>
                      <span className="balance-move__cap">Previous</span>
                    </div>
                    <ArrowRight size={18} className="muted" aria-hidden="true" />
                    <div className="balance-move__col">
                      <span className="balance-move__num" style={{ color: 'var(--gold)' }}>
                        <CountUp value={Number(result.newBalance) || 0} />
                      </span>
                      <span className="balance-move__cap">New balance</span>
                    </div>
                  </div>
                ) : (
                  <p className="notice notice--info">
                    <ShieldCheck size={15} style={{ flex: 'none' }} aria-hidden="true" />
                    <span>Claim this reward to add it to your balance.</span>
                  </p>
                )}

                <div className="result__actions">
                  <Button
                    variant="success"
                    size="lg"
                    onClick={handleClaim}
                    disabled={claiming || isClaimed}
                  >
                    {claiming
                      ? claimStep === 'preparing'
                        ? 'Preparingâ€¦'
                        : 'Creditingâ€¦'
                      : isClaimed
                        ? 'Added to balance'
                        : 'Add to balance'}
                  </Button>
                  <Button variant="ghost" onClick={handleDecline} disabled={claiming || isClaimed}>
                    Maybe later
                  </Button>
                </div>
              </Fragment>
            ) : (
              <Fragment>
                <p className="muted">That code does not match. Try the challenge again.</p>
                <div className="result__actions">
                  <Button variant="primary" size="lg" onClick={handleNewCode} disabled={refreshing}>
                    <RefreshCcw size={16} aria-hidden="true" />
                    New code
                  </Button>
                </div>
              </Fragment>
            )}
          </motion.section>
        )}

        {(phase === 'challenge' || phase === 'selected') && (
          <motion.section
            key="challenge"
            className="panel"
            initial={{ opacity: 0, y: stage }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="panel__body stack" style={{ gap: 'var(--s-4)' }}>
              <div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <p className="label">Your code</p>
                  <p
                    className="label"
                    style={{ color: secondsLeft > 0 ? 'var(--text-dim)' : 'var(--danger)' }}
                  >
                    {secondsLeft > 0 ? secondsLeft + 's' : 'Expired'}
                  </p>
                </div>

                <p className="code" aria-label={'Challenge code ' + (challenge ? challenge.captchaText : '')}>
                  {(challenge ? challenge.captchaText : 'Â·Â·Â·Â·Â·Â·')
                    .split('')
                    .map((char, i) => (
                      <span
                        key={char + '-' + i}
                        className="code__char"
                        style={{ animationDelay: i * 40 + 'ms' }}
                      >
                        {char}
                      </span>
                    ))}
                </p>
              </div>

              <p className="prompt">Select the match</p>

              <div className="options" role="group" aria-label="Challenge options">
                {((challenge && challenge.options) || []).map((option, index) => {
                  const isSelected = selected === option;
                  const cls = [
                    'option',
                    isSelected ? 'option--selected' : '',
                    isResult && isSelected && isCorrect ? 'option--correct' : '',
                    isResult && isSelected && !isCorrect ? 'option--wrong' : '',
                    isResult && !isSelected ? 'option--muted' : ''
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <motion.button
                      key={option}
                      type="button"
                      className={cls}
                      onClick={() => handleSelect(option)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.26 }}
                      whileTap={{ scale: 0.98 }}
                      aria-pressed={isSelected}
                    >
                      {scanning && isSelected && (
                        <span className="option__scan" aria-hidden="true" />
                      )}
                      <span>{option}</span>
                      {isSelected && (
                        <span className="option__tick" aria-hidden="true">
                          <Check size={11} strokeWidth={3.5} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {error && (
                <p className="notice notice--error" role="alert">
                  <AlertCircle size={15} style={{ flex: 'none' }} aria-hidden="true" />
                  <span>{error}</span>
                </p>
              )}

              {selected && (
                <Button
                  variant="primary"
                  size="lg"
                  block
                  onClick={handleSubmit}
                  disabled={secondsLeft === 0}
                >
                  Submit answer
                </Button>
              )}

              <div
                className="row"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
              >
                <p className="row" style={{ gap: 8, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  <ShieldCheck size={15} style={{ color: 'var(--success)', flex: 'none' }} aria-hidden="true" />
                  Security check â€” helps protect your account from automated access.
                </p>

                <Button variant="ghost" onClick={handleNewCode} disabled={refreshing}>
                  <RefreshCcw size={15} aria-hidden="true" />
                  New code
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}