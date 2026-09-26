import { motion } from 'framer-motion';
import { Lock, ShieldCheck } from 'lucide-react';

/**
 * Dedicated "Checking..." screen (state 3 in the reference flow).
 * Shown while the server is adjudicating - the client never decides this.
 */
export default function CheckingState({ selectedOption }) {
  return (
    <div className="verifying-panel" role="status" aria-live="polite">
      <div className="verifying-rings" aria-hidden="true">
        <span className="ring ring-1" />
        <span className="ring ring-2" />
        <span className="ring ring-3" />
        <span className="verifying-core">
          <Lock size={34} strokeWidth={2.2} />
        </span>
      </div>

      <h2 className="verifying-title">Verifying...</h2>
      <p className="verifying-sub">
        Please wait while we check your answer
        {selectedOption ? <span className="verifying-code"> {selectedOption}</span> : ''}.
      </p>

      <div className="progress-track" aria-hidden="true">
        <motion.span
          className="progress-fill"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      </div>

      <p className="note-row">
        <ShieldCheck size={16} />
        <span>Do not close this screen while verification is in progress.</span>
      </p>
    </div>
  );
}

