/**
 * Central reward / challenge tuning.
 * Every reward value used by the API MUST come from here.
 * Values are never read from, or influenced by, the client.
 */
module.exports = Object.freeze({
  // Reward granted for a correct solve.
  correctReward: 1.0,

  // Consolation reward granted for an incorrect solve.
  wrongReward: 0.5,

  // Ledger currency label returned to the client.
  currency: 'GEMS',

  // Challenge lifetime (2 minutes).
  challengeTtlMs: 2 * 60 * 1000,

  // Minimum time allowed between a challenge being issued and solved.
  // Anything faster than this is treated as automated and rejected.
  minSolveTimeMs: 300,

  // Balance handed to a brand new user.
  defaultBalance: 125.5,

  // CAPTCHA length.
  captchaLength: 6,

  // Number of selectable options presented to the user.
  optionCount: 4
});

/**
 * Adaptive difficulty.
 *
 * The spec fixes the option composition at 1 correct + 2 similar + 1
 * different, so difficulty is expressed in HOW similar the two distractors
 * are and HOW long the challenge lives - never in the option count.
 *
 * The level is derived from the user's recent correct-solve streak, so it
 * rises with genuine skill rather than being a client-side toggle.
 */
const DIFFICULTY = Object.freeze({
  1: { label: 'STANDARD', ttlMs: 2 * 60 * 1000, decoyPool: 'WIDE' },
  2: { label: 'SHARP', ttlMs: 90 * 1000, decoyPool: 'TIGHT' },
  3: { label: 'ELITE', ttlMs: 60 * 1000, decoyPool: 'NEAR_IDENTICAL' }
});

/** Correct solves needed to step up a level. */
const PROMOTION_STREAK = 3;
/** Misses needed to step back down. */
const DEMOTION_MISSES = 2;

module.exports = Object.freeze({
  ...module.exports,
  DIFFICULTY,
  PROMOTION_STREAK,
  DEMOTION_MISSES
});

