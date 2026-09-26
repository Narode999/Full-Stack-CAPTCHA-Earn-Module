const rewardConfig = require('../config/reward.config');

/**
 * RewardService (spec section 67)
 *
 * The ONLY place a reward amount is decided. The value is a function of the
 * server's own comparison, never of anything the client sent.
 */

/**
 * @param {boolean} isCorrect result of the server-side comparison
 * @returns {{amount:number, type:string, currency:string}}
 */
function calculateReward(isCorrect) {
  return {
    amount: isCorrect ? rewardConfig.correctReward : rewardConfig.wrongReward,
    type: isCorrect ? 'CAPTCHA_CORRECT' : 'CAPTCHA_WRONG',
    currency: rewardConfig.currency
  };
}

/** Public, client-safe view of the reward table (no internals). */
function describeRewards() {
  return {
    correct: rewardConfig.correctReward,
    wrong: rewardConfig.wrongReward,
    currency: rewardConfig.currency
  };
}

module.exports = { calculateReward, describeRewards };
