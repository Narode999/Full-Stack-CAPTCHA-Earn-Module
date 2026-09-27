import { motion } from 'framer-motion';
import { Check, X, Gem, ArrowRight, ShieldCheck, RefreshCcw, Sparkles } from 'lucide-react';

/**
 * Reward feedback screen (spec sections 21, 22, 29, 36).
 *
 * Every value shown comes straight off the server response. This component
 * performs no reward arithmetic of its own.
 *
 * The result screen offers a real CLAIM / NO THANKS choice. The reward is
 * only `PENDING` until the backend confirms the claim, so the balance shown
 * before claiming is the true, un-claimed balance.
 */
export default function ResultModal({
  outcome,
  rewardAmount,
  balanceBefore,
  newBalance,
  rewardStatus,
  claiming,
  onClaim,
  onDecline
}) {
  const isCorrect = outcome === 'CORRECT';
  const isClaimed = rewardStatus === 'CLAIMED';

  return (
    <div className={`result-panel ${isCorrect ? 'is-success' : 'is-fail'}`} role="status" aria-live="polite">
      <motion.div
        className="result-badge"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <span className="badge-glow" aria-hidden="true" />
        <span className="badge-ring" aria-hidden="true" />
        {isCorrect ? <Check size={52} strokeWidth={3.2} /> : <X size={52} strokeWidth={3.2} />}
        {isCorrect && (
          <>
            <span className="confetti c1" aria-hidden="true" />
            <span className="confetti c2" aria-hidden="true" />
            <span className="confetti c3" aria-hidden="true" />
            <span className="confetti c4" aria-hidden="true" />
            <span className="confetti c5" aria-hidden="true" />
          </>
        )}
      </motion.div>

      <h2 className="result-title">
        {isCorrect ? 'Verification Complete!' : 'Verification Unsuccessful'}
      </h2>

      <p className="result-sub">
        {isCorrect ? 'You earned' : 'The selected code does not match the image shown.'}
      </p>

      <motion.p
        className="result-reward"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 220, damping: 14 }}
      >
        <Gem size={26} className="gem-icon" />
        <span>
          +{rewardAmount} Gem{rewardAmount === 1 ? '' : 's'}
        </span>
      </motion.p>

      {/* Balance transition. Before claiming, the balance has NOT moved yet. */}
      {isClaimed ? (
        <div className="balance-transition">
          <div className="balance-col">
            <span className="balance-value">{Number(balanceBefore).toFixed(2)}</span>
            <span className="balance-label">Previous Balance</span>
          </div>
          <ArrowRight className="balance-arrow" size={22} />
          <div className="balance-col">
            <span className="balance-value accent">{Number(newBalance).toFixed(2)}</span>
            <span className="balance-label">New Balance</span>
          </div>
        </div>
      ) : (
        <p className="pending-note">
          <Sparkles size={15} />
          <span>Claim this reward to add it to your balance.</span>
        </p>
      )}

      <div className="result-actions">
        {isCorrect ? (
          <>
            <button
              type="button"
              className="btn btn-success"
              onClick={onClaim}
              disabled={claiming || isClaimed}
            >
              {claiming ? (
                'Preparing reward…'
              ) : isClaimed ? (
                <>
                  <Check size={16} /> Added to Balance
                </>
              ) : (
                'Add to Balance'
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={onDecline}
              disabled={claiming || isClaimed}
            >
              Maybe Later
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-fail" onClick={onDecline} disabled={claiming}>
              Try Again
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onDecline}
              disabled={claiming}
            >
              <RefreshCcw size={16} />
              Get New Code
            </button>
          </>
        )}
      </div>

      <p className="note-row">
        <ShieldCheck size={16} />
        <span>
          {isCorrect
            ? isClaimed
              ? 'Your reward has been added to your account.'
              : 'Tap Add to Balance to bank this reward.'
            : "Security checks keep your account safe."}
        </span>
      </p>
    </div>
  );
}


