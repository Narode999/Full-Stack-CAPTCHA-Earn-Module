const Wallet = require('../models/Wallet');
const rewardConfig = require('../config/reward.config');

/**
 * Adaptive difficulty.
 *
 * The level is a function of the user's own recent performance and is
 * recomputed on the server after every verified solve. The client never
 * sends, sets, or is asked to acknowledge it.
 */

const LEVEL_MIN = 1;
const LEVEL_MAX = 3;

/** Current level for a user, defaulting to 1. */
async function getLevel(userId) {
  const wallet = await Wallet.findOne({ userId }).select('difficultyLevel').lean();
  const level = wallet ? Number(wallet.difficultyLevel) : LEVEL_MIN;
  return Math.min(Math.max(level || LEVEL_MIN, LEVEL_MIN), LEVEL_MAX);
}

/**
 * Records a verified solve and returns the (possibly new) difficulty level.
 * Promotion needs a run of correct solves; demotion needs repeated misses.
 */
async function recordSolve(userId, isCorrect) {
  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        gemBalance: rewardConfig.defaultBalance,
        lifetimeEarned: rewardConfig.defaultBalance
      },
      $inc: isCorrect ? { correctStreak: 1, missStreak: -1 } : { missStreak: 1, correctStreak: -1 }
    },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  ).exec();

  const streak = Math.max(0, Number(wallet.correctStreak) || 0);
  const misses = Math.max(0, Number(wallet.missStreak) || 0);
  let level = Number(wallet.difficultyLevel) || LEVEL_MIN;

  if (isCorrect && streak >= rewardConfig.PROMOTION_STREAK && level < LEVEL_MAX) {
    level += 1;
    // Both counters reset together, so a promotion never leaves a stale
    // miss count that would cause an immediate demotion on the next miss.
    await Wallet.updateOne(
      { userId },
      { $set: { difficultyLevel: level, correctStreak: 0, missStreak: 0 } }
    );
  } else if (!isCorrect && misses >= rewardConfig.DEMOTION_MISSES && level > LEVEL_MIN) {
    level -= 1;
    await Wallet.updateOne(
      { userId },
      { $set: { difficultyLevel: level, correctStreak: 0, missStreak: 0 } }
    );
  } else {
    // Keep the counters non-negative without changing the level.
    await Wallet.updateOne(
      { userId },
      { $set: { correctStreak: streak, missStreak: misses } },
      { ignoreUndefined: true }
    );
  }

  return level;
}

/** Public description of a level, safe to send to the client. */
function describe(level) {
  const conf = rewardConfig.DIFFICULTY[level] || rewardConfig.DIFFICULTY[1];
  return { level, label: conf.label, ttlMs: conf.ttlMs };
}

module.exports = { getLevel, recordSolve, describe };
