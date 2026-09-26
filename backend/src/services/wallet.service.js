const Wallet = require('../models/Wallet');
const rewardConfig = require('../config/reward.config');

/**
 * WalletService (spec section 67)
 *
 * Owns every read and write of a gem balance. Controllers never touch the
 * Wallet model directly, so the "server is the only authority" rule has a
 * single choke point.
 */

/** Current balance. Returns the default when the user has no wallet yet. */
async function getGemBalance(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  return wallet ? Number(wallet.gemBalance) : rewardConfig.defaultBalance;
}

/**
 * Credits `amount` to the wallet and returns the authoritative post-balance.
 *
 * The row is ensured first and credited with a separate atomic `$inc`.
 * Doing both in ONE upsert is a trap: with `setDefaultsOnInsert`, MongoDB may
 * apply `$setOnInsert` *after* the `$inc`, silently discarding the reward.
 *
 * The returned document is the post-transaction balance, so callers get exact
 * before/after figures even under concurrent credits - no read-modify-write.
 */
async function creditGems(userId, amount) {
  await Wallet.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        gemBalance: rewardConfig.defaultBalance,
        lifetimeEarned: rewardConfig.defaultBalance
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  ).exec();

  const wallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { gemBalance: amount, lifetimeEarned: amount } },
    { new: true }
  ).exec();

  const balanceAfter = Number(wallet.gemBalance);
  return {
    balanceBefore: Number((balanceAfter - amount).toFixed(2)),
    balanceAfter
  };
}

module.exports = { getGemBalance, creditGems };
