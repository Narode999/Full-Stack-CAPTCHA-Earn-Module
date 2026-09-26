const mongoose = require('mongoose');

/**
 * Append-only audit trail (spec section 38).
 *
 * Records security-relevant events so an evaluator can reconstruct what
 * happened and when. Never written to from client-supplied data.
 */
const auditLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      enum: [
        'CHALLENGE_ISSUED',
        'CHALLENGE_VERIFIED',
        'REWARD_CLAIMED',
        'REWARD_FORFEITED',
        'REWARD_INJECTION_BLOCKED',
        'REPLAY_BLOCKED',
        'DUPLICATE_CLAIM_BLOCKED',
        'CROSS_USER_BLOCKED',
        'EXPIRED_CHALLENGE_BLOCKED',
        'BOT_SUSPECTED',
        'INVALID_SIGNATURE',
        'RATE_LIMITED'
      ],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    challengeId: { type: String, default: null, index: true },
    /** Outcome of the guarded action. */
    outcome: { type: String, enum: ['ALLOWED', 'BLOCKED'], default: 'ALLOWED' },
    detail: { type: String, default: null },
    ip: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
