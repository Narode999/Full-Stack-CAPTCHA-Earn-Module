const mongoose = require('mongoose');
const rewardConfig = require('../config/reward.config');

const ALLOWED_AMOUNTS = [rewardConfig.correctReward, rewardConfig.wrongReward];

const gemTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
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
    /**
     * Only the two server-defined reward values are ever stored.
     * The validator is the last line of defence against a poisoned amount.
     */
    amount: {
      type: Number,
      required: true,
      enum: {
        values: ALLOWED_AMOUNTS,
        message: 'amount must be one of the server-defined reward values'
      }
    },
    type: {
      type: String,
      enum: ['CAPTCHA_CORRECT', 'CAPTCHA_WRONG'],
      required: true
    },
    /** Which subsystem produced this entry. */
    source: {
      type: String,
      enum: ['CAPTCHA_EARN'],
      default: 'CAPTCHA_EARN'
    },
    /** The `challengeId` this entry settles. Unique => one reward per challenge. */
    referenceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'FAILED'],
      default: 'COMPLETED'
    }
  },
  { timestamps: true }
);

// Serves "show me this user's ledger, newest first".
gemTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('GemTransaction', gemTransactionSchema);

