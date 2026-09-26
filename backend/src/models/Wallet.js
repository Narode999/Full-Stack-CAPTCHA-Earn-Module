const mongoose = require('mongoose');
const rewardConfig = require('../config/reward.config');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    /**
     * Gem balance. Credited only by the server, always via an atomic $inc.
     * Never accepted from, or echoed back to, the client as an authority.
     */
    gemBalance: {
      type: Number,
      required: true,
      default: rewardConfig.defaultBalance,
      min: 0
    },
    /** Running total of gems ever earned, for reporting. */
    lifetimeEarned: {
      type: Number,
      required: true,
      default: rewardConfig.defaultBalance,
      min: 0
    },
    /**
     * Adaptive difficulty (1-3). Derived from the user's own solve streak;
     * the client can neither read it as an authority nor influence it.
     */
    difficultyLevel: {
      type: Number,
      enum: [1, 2, 3],
      default: 1
    },
    /** Consecutive correct solves. */
    correctStreak: {
      type: Number,
      default: 0,
      min: 0
    },
    /** Consecutive wrong answers. */
    missStreak: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('Wallet', walletSchema);
