import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check, X, ArrowRight, ShieldCheck, RefreshCcw, Lock, AlertCircle,
  Gift, Zap, Smartphone
} from 'lucide-react';
import GemMark from '../components/GemMark.jsx';
import BackButton from '../components/BackButton.jsx';
import { Button, CountUp, RewardBurst } from '../components/ui.jsx';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

const SCAN_DURATION_MS = 500;
const DEAD_CHALLENGE_CODES = [
  'CHALLENGE_EXPIRED',
  'CHALLENGE_ALREADY_COMPLETED',
  'CHALLENGE_UNAVAILABLE'
];

// Reference design footer strip.
const FEATURES = [
  { icon: ShieldCheck, title: 'Secure', copy: 'Advanced protection for your account', tone: '#4c8dff' },
  { icon: Gift, title: 'Rewarding', copy: 'Earn gems for completing verification', tone: '#a78bfa' },
  { icon: Zap, title: 'Fast', copy: 'Quick verification and rewards', tone: '#f5c451' },
  { icon: Smartphone, title: 'Mobile first', copy: 'Optimized experience on every device', tone: '#4ade80' }
];

const STATES = ['Challenge', 'Selected', 'Verifying', 'Success', 'Incorrect'];

function FeatureStrip() {
  return (
    <div className="featstrip">
      {FEATURES.map(({ icon: Icon, title, copy, tone }) => (
        <div className="featstrip__item" key={title}>
          <Icon size={22} style={{ color: tone, flex: 'none' }} aria-hidden="true" />
          <span>
            <strong>{title}</strong>
            <span>{copy}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The earn screen, rebuilt against docs/flow.jpg.
 *
 * Two behaviours here come straight from the assignment rather than the mock:
 *
 *  - Section 15 states there is NO submit button. Selecting an option locks
 *    the grid, plays the ~0.5s scan, then submits automatically.
 *  - Sections 22 and 29 require BOTH result states to show the reward (1 gem
 *    correct, 0.5 wrong) and offer Claim and No Thanks. A wrong answer is a
 *    smaller reward, not a dead end.
 *
 * All reward values come from the server response.
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
  const [burstKey, setBurstKey] = useState(0);
  const scanTimer = useRef(null);
  const submitTimer = useRef(null);

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
    return () => {
      clearTimeout(scanTimer.current);
      clearTimeout(submitTimer.current);
    };
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

  const verify = useCallback(async (option) => {
    if (!challenge) return;
    setPhase('verifying');
    setError('');
    try {
      const data = await api.verifyCaptcha({
        challengeId: challenge.challengeId,
        selectedOption: option,
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
  }, [challenge, loadChallenge]);

  // Section 15: no submit button. Select -> lock -> scan -> auto verify.
  const handleSelect = option => {
    if (phase !== 'challenge' && phase !== 'selected') return;
    setSelected(option);
    setError('');
    setPhase('selected');

    clearTimeout(scanTimer.current);
    setScanning(true);
    scanTimer.current = setTimeout(() => setScanning(false), SCAN_DURATION_MS);

    submitTimer.current = setTimeout(() => verify(option), SCAN_DURATION_MS);
  };

  const handleNewCode = async () => {
    clearTimeout(submitTimer.current);
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
      setBurstKey(prev => prev + 1);
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

  // Which of the five numbered reference states is on screen.
  const chipIndex =
    phase === 'loading' ? -1 : isVerifying ? 2 : isResult ? (isCorrect ? 3 : 4) : selected ? 1 : 0;

  const chips = STATES.map((name, i) => {
    let cls = 'statechip';
    if (i === chipIndex) cls += isResult ? (isCorrect ? ' statechip--ok' : ' statechip--bad') : ' statechip--on';
    return (
      <span className={cls} key={name} aria-current={i === chipIndex ? 'step' : undefined}>
        <span className="statechip__num">{i + 1}</span>
        {name}
      </span>
    );
  });

  return (
    <div className="stack" style={{ gap: 'var(--s-4)' }}>
      <BackButton to="/dashboard" label="Back to dashboard" />

      <div style={{ textAlign: 'center' }}>
        <h1 className="goldtitle">Earn Gems</h1>
        <p className="pagesub">Complete a quick security check to earn rewards.</p>
      </div>

      <div className="statechips" aria-label="Verification progress">
        {chips}
      </div>

      <AnimatePresence mode="wait">
        {phase === 'loading' && (
          <motion.section key="loading" className="panel panel__body"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="state">
              <span className="spinner" aria-hidden="true" />
              <p className="label">Requesting a challenge</p>
            </div>
          </motion.section>
        )}

        {isVerifying && (
          <motion.section key="verifying" className="panel panel__body"
            initial={{ opacity: 0, y: stage }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
            <div className="verifying" role="status" aria-live="polite">
              <div className="rings" aria-hidden="true">
                <span className="rings__ring" />
                <span className="rings__ring" />
                <span className="rings__ring" />
                <span className="rings__core"><Lock size={30} strokeWidth={2} /></span>
              </div>
              <h2 className="shead__title">Verifying...</h2>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Please wait while we check your answer.
              </p>
              <div className="verifying__track" aria-hidden="true">
                <motion.span className="verifying__fill"
                  initial={{ width: '0%' }} animate={{ width: '100%' }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }} />
              </div>
              <p className="notice notice--info">
                <ShieldCheck size={15} style={{ flex: 'none' }} aria-hidden="true" />
                <span>Do not close this screen while verification is in progress.</span>
              </p>
            </div>
          </motion.section>
        )}

        {isResult && result && (
          <motion.section key="result"
            className={'panel result ' + (isCorrect ? 'result--ok' : 'result--fail')}
            initial={{ opacity: 0, y: stage }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            role="status" aria-live="polite">

            <RewardBurst key={burstKey} show={burstKey > 0 && isClaimed} />

            <motion.div className="result__mark"
              initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
              {isCorrect ? <Check size={44} strokeWidth={3} /> : <X size={44} strokeWidth={3} />}
            </motion.div>

            <h2 className="shead__title" style={{ color: isCorrect ? 'var(--success)' : 'var(--danger)' }}>
              {isCorrect ? 'Verification Complete!' : 'Verification Unsuccessful'}
            </h2>

            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {isCorrect ? 'You earned' : 'The selected code does not match. Your effort still earns a partial reward.'}
            </p>

            <p className="result__gain">
              <GemMark size={22} />
              +{result.rewardAmount} Gems
            </p>

            {isClaimed ? (
              <div className="balance-move">
                <div className="balance-move__col">
                  <span className="balance-move__num">{Number(result.balanceBefore).toFixed(2)}</span>
                  <span className="balance-move__cap">Previous balance</span>
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
              <Button variant="success" size="lg" onClick={handleClaim} disabled={claiming || isClaimed}>
                {claiming
                  ? claimStep === 'preparing' ? 'Preparing…' : 'Crediting…'
                  : isClaimed ? 'Added to balance' : 'Add to Balance'}
              </Button>
              <Button variant="ghost" onClick={handleDecline} disabled={claiming || isClaimed}>
                Maybe Later
              </Button>
            </div>

            <p className="notice notice--info">
              <ShieldCheck size={15} style={{ flex: 'none' }} aria-hidden="true" />
              <span>
                {isClaimed
                  ? 'Your reward has been added to your account.'
                  : 'Tap Add to Balance to bank this reward.'}
              </span>
            </p>
          </motion.section>
        )}

        {(phase === 'challenge' || phase === 'selected') && (
          <motion.section key="challenge" className="panel"
            initial={{ opacity: 0, y: stage }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -stage }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>

            <div className="panel__body stack" style={{ gap: 'var(--s-4)' }}>
              <div className="codepanel">
                <p className="codepanel__chars" aria-label={'Challenge code ' + (challenge ? challenge.captchaText : '')}>
                  {(challenge ? challenge.captchaText : '······')
                    .split('')
                    .map((char, i) => (
                      <span key={char + '-' + i} className="code__char" style={{ animationDelay: i * 40 + 'ms' }}>
                        {char}
                      </span>
                    ))}
                </p>
                <button type="button" className="codepanel__refresh" onClick={handleNewCode} disabled={refreshing}>
                  <RefreshCcw size={12} aria-hidden="true" />
                  New Code
                </button>
                <p className="label" style={{ marginTop: 8, color: secondsLeft > 0 ? 'var(--text-dim)' : 'var(--danger)' }}>
                  {secondsLeft > 0 ? 'Expires in ' + secondsLeft + 's' : 'Expired'}
                </p>
              </div>

              <p className="selectlabel">
                {selected ? 'Verifying your selection…' : 'Select the matching code'}
              </p>

              <div className="options" role="group" aria-label="Challenge options">
                {((challenge && challenge.options) || []).map((option, index) => {
                  const isSelected = selected === option;
                  const cls = [
                    'option',
                    isSelected ? 'option--selected' : '',
                    isResult && isSelected && isCorrect ? 'option--correct' : '',
                    isResult && isSelected && !isCorrect ? 'option--wrong' : '',
                    isResult && !isSelected ? 'option--muted' : ''
                  ].filter(Boolean).join(' ');
                  return (
                    <motion.button key={option} type="button" className={cls}
                      onClick={() => handleSelect(option)}
                      disabled={phase !== 'challenge'}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.26 }}
                      whileTap={{ scale: 0.98 }} aria-pressed={isSelected}>
                      {scanning && isSelected && <span className="option__scan" aria-hidden="true" />}
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

              <p className="notice notice--info">
                <ShieldCheck size={15} style={{ color: 'var(--success)', flex: 'none' }} aria-hidden="true" />
                <span>This helps protect your account from automated access.</span>
              </p>

              <p className="rewardbanner">
                <GemMark size={20} />
                <span>Complete verification to earn<br /><b>+1 Gem</b></span>
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <FeatureStrip />
    </div>
  );
}