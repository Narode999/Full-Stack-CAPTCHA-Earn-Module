const crypto = require('crypto');
const CaptchaChallenge = require('../models/CaptchaChallenge');
const GemTransaction = require('../models/GemTransaction');
const rewardConfig = require('../config/reward.config');
const captchaService = require('../services/captcha.service');
const audit = require('../services/audit.service');
const rewardService = require('../services/reward.service');
const walletService = require('../services/wallet.service');
const difficultyService = require('../services/difficulty.service');
const { verifyChallengeSignature } = require('../middleware/verifySignature');

/**
 * Fields a client is NEVER allowed to send to the verify endpoint.
 * If any of these appear we reject the whole request rather than silently
 * ignoring them, so a probing client gets a loud, explicit signal that the
 * server is not negotiable about what it trusts.
 */
const FORBIDDEN_CLIENT_FIELDS = [
  'isCorrect',
  'correct',
  'correctOption',
  'result',
  'reward',
  'rewards',
  'amount',
  'balance',
  'gemBalance',
  'newBalance',
  'balanceBefore',
  'balanceAfter',
  'status',
  'transactionId',
  'userId',
  'type'
];

function fail(res, code, message, status = 400, extra = {}) {
  return res.status(status).json({ success: false, code, message, ...extra });
}

function cleanString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Strictly whitelists the request body.
 * Nothing outside the allow-list is carried forward, so no client value can
 * ever reach the reward decision.
 */
function parseVerifyBody(body = {}) {
  const violations = FORBIDDEN_CLIENT_FIELDS.filter(field =>
    Object.prototype.hasOwnProperty.call(body, field)
  );

  if (violations.length > 0) {
    return {
      rejected: true,
      violations
    };
  }

  return {
    rejected: false,
    challengeId: cleanString(body.challengeId, 64),
    selectedOption: cleanString(body.selectedOption, 32),
    signature: cleanString(body.signature, 256)
  };
}

/**
 * GET /api/captcha/current
 *
 * Returns the user's live challenge, or mints one if they have none.
 * The response is built by `toPublicChallenge()`, which has no
 * `correctOption` key at all.
 */
async function getCurrentChallenge(req, res) {
  try {
    const existing = await captchaService.getCurrentChallengeForUser(req.user._id);

    if (existing) {
      return res.json({
        success: true,
        challenge: existing,
        reward: {
          correct: rewardConfig.correctReward,
          wrong: rewardConfig.wrongReward,
          currency: rewardConfig.currency
        }
      });
    }

    const fresh = await captchaService.issueChallengeForUser(req.user._id);

    return res.json({
      success: true,
      challenge: fresh,
      reward: {
        correct: rewardConfig.correctReward,
        wrong: rewardConfig.wrongReward,
        currency: rewardConfig.currency
      }
    });
  } catch (error) {
    console.error('getCurrentChallenge error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to load challenge', 500);
  }
}

/** POST /api/captcha/new - discards the open challenge and issues a fresh one. */
async function issueNewChallenge(req, res) {
  try {
    const fresh = await captchaService.issueChallengeForUser(req.user._id);

    return res.json({
      success: true,
      challenge: fresh,
      reward: {
        correct: rewardConfig.correctReward,
        wrong: rewardConfig.wrongReward,
        currency: rewardConfig.currency
      }
    });
  } catch (error) {
    console.error('issueNewChallenge error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to create a new challenge', 500);
  }
}

/**
 * POST /api/captcha/verify
 *
 * ZERO-FRONTEND-TRUST CONTRACT
 * ----------------------------
 *  1. The request body is whitelisted; any attempt to dictate the outcome
 *     (`isCorrect`, `reward`, `newBalance`, ...) is rejected outright.
 *  2. The answer is read from the server-side `correctOption`, which is never
 *     projected into any client-facing payload.
 *  3. The challenge is claimed FIRST with a compare-and-swap on
 *     `status: 'ACTIVE'`. Only the request that actually flips the status
 *     may proceed to pay out. This is what makes replay impossible.
 *  4. The balance is then credited with a single atomic `$inc` whose
 *     post-image is the authoritative `newBalance` - no read-modify-write,
 *     so concurrent credits cannot corrupt the ledger.
 *  5. The reward amount comes from reward.config, keyed off the server's own
 *     comparison. The client has no input into it.
 */
async function verifyCaptcha(req, res) {
  try {
    const parsed = parseVerifyBody(req.body || {});

    if (parsed.rejected) {
      await audit.record({
        event: 'REWARD_INJECTION_BLOCKED',
        userId: req.user._id,
        challengeId: cleanString(req.body && req.body.challengeId, 64) || null,
        outcome: 'BLOCKED',
        detail: 'tried to supply: ' + parsed.violations.join(', '),
        ip: req.ip
      });
      return fail(
        res,
        'CLIENT_OVERRIDE_REJECTED',
        'The client may not supply verification results or reward values.',
        400,
        { auditFlag: 'REWARD_INJECTION_ATTEMPT', rejectedFields: parsed.violations }
      );
    }

    const { challengeId, selectedOption, signature } = parsed;

    if (!challengeId || !selectedOption || !signature) {
      return fail(res, 'INVALID_INPUT', 'challengeId, selectedOption and signature are required.', 400);
    }

    // Scoped to the authenticated user: another account's challenge is
    // simply not found here, so it cannot even be probed for existence.
    const challenge = await CaptchaChallenge.findOne({ challengeId, userId: req.user._id })
      .select('+correctOption')
      .exec();

    if (!challenge) {
      // Deliberately NOT recording the attempted challengeId: it belongs to
      // another account, and echoing it back would put someone else's data
      // into this caller's own (and only visible) audit trail.
      await audit.record({
        event: 'CROSS_USER_BLOCKED',
        userId: req.user._id,
        challengeId: null,
        outcome: 'BLOCKED',
        detail: 'attempted a challenge owned by another account',
        ip: req.ip
      });
      return fail(res, 'CHALLENGE_NOT_FOUND', 'Challenge not found.', 404);
    }

    const signatureValid = verifyChallengeSignature({
      challengeId: challenge.challengeId,
      userId: challenge.userId.toString(),
      expiresAt: challenge.expiresAt.toISOString(),
      signature,
      secret: process.env.SERVER_SECRET
    });

    if (!signatureValid) {
      await audit.record({
        event: 'INVALID_SIGNATURE',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: 'HMAC mismatch',
        ip: req.ip
      });
      return fail(res, 'INVALID_SIGNATURE', 'Challenge signature is invalid.', 403);
    }

    if (challenge.status === 'COMPLETED') {
      await audit.record({
        event: 'REPLAY_BLOCKED',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: 'challenge already completed',
        ip: req.ip
      });
      return fail(res, 'CHALLENGE_ALREADY_COMPLETED', 'This challenge has already been completed.', 409);
    }

    if (challenge.status !== 'ACTIVE') {
      return fail(res, 'CHALLENGE_UNAVAILABLE', 'This challenge is no longer active.', 410);
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await CaptchaChallenge.updateOne(
        { _id: challenge._id, status: 'ACTIVE' },
        { $set: { status: 'EXPIRED' } }
      ).exec();
      await audit.record({
        event: 'EXPIRED_CHALLENGE_BLOCKED',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: 'submitted after TTL',
        ip: req.ip
      });
      return fail(res, 'CHALLENGE_EXPIRED', 'Challenge has expired. Request a new code.', 410);
    }

    // The selected option must actually be one we offered.
    if (!challenge.options.includes(selectedOption)) {
      return fail(res, 'INVALID_OPTION', 'Selected option was not part of this challenge.', 400);
    }

    // Anti-automation floor: an answer cannot arrive before a human could
    // plausibly have read the code.
    const elapsedMs = Date.now() - new Date(challenge.createdAt).getTime();
    if (elapsedMs < rewardConfig.minSolveTimeMs) {
      await audit.record({
        event: 'BOT_SUSPECTED',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: `answered in ${elapsedMs}ms`,
        ip: req.ip
      });
      return fail(res, 'BOT_SUSPECTED', 'Verification Failed - Too Fast', 400, {
        auditFlag: 'BOT_SUSPECTED'
      });
    }

    // ---- THE ONLY place the outcome is decided, from server state only ----
    const isCorrect = challenge.correctOption === selectedOption;
    const { amount: rewardAmount, type: transactionType } = rewardService.calculateReward(isCorrect);

    // (3) CLAIM FIRST. Compare-and-swap: only one concurrent request can
    // match `status: 'ACTIVE'` and flip it to COMPLETED.
    //
    // The reward is recorded as PENDING here and only paid into the wallet
    // when the user claims it (see `claimReward`). The server still owns
    // every decision - the client merely chooses whether to collect.
    const settled = await CaptchaChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        status: 'ACTIVE',
        expiresAt: { $gt: new Date() }
      },
      {
        $set: {
          status: 'COMPLETED',
          selectedOption,
          result: isCorrect ? 'CORRECT' : 'WRONG',
          rewardAmount,
          rewardStatus: 'PENDING',
          completedAt: new Date()
        }
      },
      { new: true }
    )
      .select('_id challengeId')
      .exec();

    if (!settled) {
      // Lost the race, or it expired mid-flight. No payout happens.
      return fail(res, 'CHALLENGE_ALREADY_COMPLETED', 'This challenge has already been completed.', 409);
    }

    await audit.record({
      event: 'CHALLENGE_VERIFIED',
      userId: req.user._id,
      challengeId: settled.challengeId,
      outcome: 'ALLOWED',
      detail: isCorrect ? 'CORRECT +1' : 'WRONG +0.5',
      ip: req.ip
    });

    // Adaptive difficulty advances on genuine performance, server-side only.
    const level = await difficultyService.recordSolve(req.user._id, isCorrect);

    // Balance is unchanged until the reward is claimed. The frontend is told
    // the truth: the reward exists but is not yet in the wallet.
    const currentBalance = await walletService.getGemBalance(req.user._id);

    return res.json({
      success: true,
      result: isCorrect ? 'CORRECT' : 'WRONG',
      reward: {
        amount: rewardAmount,
        currency: rewardConfig.currency,
        status: 'PENDING'
      },
      newBalance: currentBalance,
      balanceBefore: currentBalance,
      challengeId: settled.challengeId,
      claimAvailable: true,
      difficulty: difficultyService.describe(level)
    });
  } catch (error) {
    console.error('verifyCaptcha error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to verify challenge', 500);
  }
}

/**
 * POST /api/captcha/claim  (spec sections 29-32, 37)
 *
 * Pays a PENDING reward into the wallet exactly once.
 *
 * Idempotency is enforced by the DATABASE, not by disabling the button:
 * the PENDING -> CLAIMED transition is a compare-and-swap, so N parallel
 * claims produce exactly one winner and one wallet credit.
 */
async function claimReward(req, res) {
  try {
    const challengeId = cleanString(req.body && req.body.challengeId, 64);

    if (!challengeId) {
      return fail(res, 'INVALID_INPUT', 'challengeId is required.', 400);
    }

    // Scoped by userId: another account's challenge simply does not exist here.
    const challenge = await CaptchaChallenge.findOne({ challengeId, userId: req.user._id }).exec();

    if (!challenge) {
      return fail(res, 'CHALLENGE_NOT_FOUND', 'Challenge not found.', 404);
    }

    if (challenge.status !== 'COMPLETED') {
      return fail(res, 'CHALLENGE_NOT_COMPLETED', 'This challenge has not been verified yet.', 409);
    }

    if (challenge.rewardStatus === 'CLAIMED') {
      await audit.record({
        event: 'DUPLICATE_CLAIM_BLOCKED',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: 'reward already claimed',
        ip: req.ip
      });
      return fail(res, 'ALREADY_CLAIMED', 'This reward has already been claimed.', 409);
    }

    if (challenge.rewardStatus === 'FORFEIT') {
      return fail(res, 'REWARD_FORFEITED', 'This reward was declined.', 409);
    }

    // ---- THE CLAIM: compare-and-swap on PENDING ----
    const claimed = await CaptchaChallenge.findOneAndUpdate(
      { _id: challenge._id, rewardStatus: 'PENDING' },
      { $set: { rewardStatus: 'CLAIMED', isClaimed: true, claimedAt: new Date() } },
      { new: true }
    )
      .select('challengeId rewardAmount result')
      .exec();

    if (!claimed) {
      // Someone else won the race. Nothing is paid twice.
      await audit.record({
        event: 'DUPLICATE_CLAIM_BLOCKED',
        userId: req.user._id,
        challengeId,
        outcome: 'BLOCKED',
        detail: 'lost the claim race',
        ip: req.ip
      });
      return fail(res, 'ALREADY_CLAIMED', 'This reward has already been claimed.', 409);
    }

    const amount = Number(claimed.rewardAmount);

    // Atomic credit. walletService owns the ensure-then-$inc dance.
    const { balanceBefore, balanceAfter } = await walletService.creditGems(
      req.user._id,
      amount
    );

    // referenceId is unique, so a duplicated ledger row is impossible too.
    await GemTransaction.create({
      transactionId: `txn_${crypto.randomUUID()}`,
      userId: req.user._id,
      amount,
      type: claimed.result === 'CORRECT' ? 'CAPTCHA_CORRECT' : 'CAPTCHA_WRONG',
      source: 'CAPTCHA_EARN',
      referenceId: claimed.challengeId,
      balanceBefore,
      balanceAfter,
      status: 'COMPLETED'
    });

    await audit.record({
      event: 'REWARD_CLAIMED',
      userId: req.user._id,
      challengeId: claimed.challengeId,
      outcome: 'ALLOWED',
      detail: `+${amount}`,
      ip: req.ip
    });

    return res.json({
      success: true,
      claimed: true,
      reward: { amount, currency: rewardConfig.currency, status: 'CLAIMED' },
      balanceBefore,
      newBalance: balanceAfter,
      challengeId: claimed.challengeId
    });
  } catch (error) {
    console.error('claimReward error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to claim reward', 500);
  }
}

/**
 * POST /api/captcha/decline  (spec section 33 - "No Thanks")
 *
 * Discards the PENDING reward so the challenge can never be claimed later.
 */
async function declineReward(req, res) {
  try {
    const challengeId = cleanString(req.body && req.body.challengeId, 64);
    if (!challengeId) return fail(res, 'INVALID_INPUT', 'challengeId is required.', 400);

    const updated = await CaptchaChallenge.findOneAndUpdate(
      { challengeId, userId: req.user._id, rewardStatus: 'PENDING' },
      { $set: { rewardStatus: 'FORFEIT' } },
      { new: true }
    )
      .select('challengeId')
      .exec();

    if (!updated) {
      return fail(res, 'REWARD_UNAVAILABLE', 'There is no pending reward to decline.', 409);
    }

    await audit.record({
      event: 'REWARD_FORFEITED',
      userId: req.user._id,
      challengeId: updated.challengeId,
      outcome: 'ALLOWED',
      detail: 'user chose No Thanks',
      ip: req.ip
    });

    return res.json({ success: true, declined: true, challengeId: updated.challengeId });
  } catch (error) {
    console.error('declineReward error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to decline reward', 500);
  }
}

/**
 * GET /api/captcha/history  (spec section 45)
 *
 * The caller's own completed activity. `correctOption` is never selected,
 * and a `userId` query parameter is ignored entirely - identity comes from
 * the JWT alone.
 */
async function getHistory(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const entries = await CaptchaChallenge.find({ userId: req.user._id, status: 'COMPLETED' })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limit)
      .select(
        'challengeId captchaText selectedOption result rewardAmount rewardStatus createdAt completedAt claimedAt'
      )
      .lean();

    return res.json({ success: true, count: entries.length, history: entries });
  } catch (error) {
    console.error('getHistory error:', error);
    return fail(res, 'SERVER_ERROR', 'Unable to load history', 500);
  }
}

/** GET /api/captcha/config - public reward/challenge configuration. */
async function getConfig(_req, res) {
  return res.json({
    success: true,
    config: {
      correctReward: rewardConfig.correctReward,
      wrongReward: rewardConfig.wrongReward,
      currency: rewardConfig.currency,
      optionCount: rewardConfig.optionCount,
      captchaLength: rewardConfig.captchaLength,
      ttlMs: rewardConfig.challengeTtlMs,
      active: true
    }
  });
}

module.exports = {
  getCurrentChallenge,
  issueNewChallenge,
  verifyCaptcha,
  claimReward,
  declineReward,
  getHistory,
  getConfig
};


