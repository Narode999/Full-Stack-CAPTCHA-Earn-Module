const mongoose = require('mongoose');
const rewardConfig = require('../config/reward.config');

const captchaChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    captchaText: {
      type: String,
      required: true
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: value => Array.isArray(value) && value.length === rewardConfig.optionCount,
        message: `Options must contain exactly ${rewardConfig.optionCount} values`
      }
    },
    /**
     * THE ANSWER.
     * `select: false` keeps it out of every query result unless it is
     * explicitly re-selected with `.select('+correctOption')`, which only
     * happens inside the verification code path on the server.
     */
    correctOption: {
      type: String,
      required: true,
      select: false
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'EXPIRED', 'DISCARDED'],
      default: 'ACTIVE',
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    /** Set when a solve has been settled so the ledger can be reconciled. */
    isClaimed: {
      type: Boolean,
      default: false
    },
    /** What the user actually picked, recorded server-side at verify time. */
    selectedOption: {
      type: String,
      default: null,
      select: false
    },
    /** Server-adjudicated outcome: CORRECT | WRONG. Never client-supplied. */
    result: {
      type: String,
      enum: ['CORRECT', 'WRONG', null],
      default: null
    },
    /** The reward the server awarded for this solve. */
    rewardAmount: {
      type: Number,
      enum: { values: [0, 1, 0.5], message: 'rewardAmount must be a server-defined reward' },
      default: 0
    },
    /**
     * PENDING  - verified, reward earned, not yet collected by the user
     * CLAIMED  - reward has been paid into the wallet
     * FORFEIT - user chose "No Thanks"; the reward is discarded
     *
     * The PENDING -> CLAIMED transition is a compare-and-swap, which is what
     * makes a double-claim impossible even under parallel requests.
     */
    rewardStatus: {
      type: String,
      enum: ['PENDING', 'CLAIMED', 'FORFEIT'],
      default: null,
      index: true
    },
    completedAt: {
      type: Date,
      default: null
    },
    claimedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    // Defence in depth: even if a caller forgets the projection,
    // serialising a challenge can never leak the answer.
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.correctOption;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform(_doc, ret) {
        delete ret.correctOption;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Serves "fetch the live challenge for this user" queries.
captchaChallengeSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Serves the ledger reconciliation sweep for challenges that were settled.
captchaChallengeSchema.index({ isClaimed: 1, status: 1, updatedAt: 1 });

module.exports = mongoose.model('CaptchaChallenge', captchaChallengeSchema);

