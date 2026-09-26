const crypto = require('crypto');
const CaptchaChallenge = require('../models/CaptchaChallenge');
const rewardConfig = require('../config/reward.config');
const difficulty = require('./difficulty.service');
const audit = require('./audit.service');
const rewardService = require('./reward.service');
const { computeChallengeSignature } = require('../middleware/verifySignature');

/** Ambiguous glyphs (0/O, 1/I/L) are excluded so the code stays readable. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Visually confusable substitutes used to build the "similar" distractors. */
const CONFUSABLES = {
  A: ['R', 'X', '4'], B: ['8', 'R', 'P'], C: ['G', 'O', 'E'], D: ['O', 'Q'],
  E: ['F', 'B', '3'], F: ['E', 'P', 'T'], G: ['C', 'Q', '6'], H: ['N', 'X', '4'],
  J: ['F', 'Y', '7'], K: ['X', 'R', '3'], L: ['7', 'J', '1'], M: ['N', 'W', '3'],
  N: ['H', 'M', '7'], P: ['R', 'B', '9'], Q: ['O', 'G', 'D'], R: ['P', 'K', 'A'],
  S: ['5', '8', '3'], T: ['F', '7', 'J'], U: ['V', 'O', 'D'], V: ['U', 'Y', 'X'],
  W: ['M', 'N', '3'], X: ['Y', 'K', '4'], Y: ['V', 'X', '7'], Z: ['2', '7', 'S'],
  2: ['Z', '7', 'Q'], 3: ['8', 'E', 'B'], 4: ['A', '9', 'H'], 5: ['S', '6', 'B'],
  6: ['G', '8', '5'], 7: ['Z', 'T', '1'], 8: ['B', 'S', '3'], 9: ['P', '4', 'G']
};

/** Uniform random integer in [0, max) backed by the CSPRNG. */
function randomInt(maxExclusive) {
  return crypto.randomInt(0, maxExclusive);
}

function randomChar() {
  return ALPHABET[randomInt(ALPHABET.length)];
}

/** Builds the 6-character alphanumeric challenge text, e.g. "A7K2P9". */
function buildChallengeText() {
  let text = '';
  for (let i = 0; i < rewardConfig.captchaLength; i += 1) {
    text += randomChar();
  }
  return text;
}

/**
 * Produces a distractor differing from the real code by exactly one
 * character. How confusing that character is depends on the user's
 * difficulty level:
 *
 *   WIDE           - any different character          (easiest)
 *   TIGHT          - drawn from the confusable set   (default)
 *   NEAR_IDENTICAL - the single most confusable swap (hardest)
 *
 * The option count never changes, so the spec's 1 + 2 + 1 composition holds
 * at every level.
 */
function createSimilarOption(correctText, mode = 'TIGHT') {
  const chars = correctText.split('');
  const index = randomInt(chars.length);
  const current = chars[index];
  const confusables = CONFUSABLES[current] || ALPHABET.split('').filter(c => c !== current);

  let pool;
  if (mode === 'WIDE') {
    pool = ALPHABET.split('').filter(c => c !== current);
  } else if (mode === 'NEAR_IDENTICAL') {
    pool = [confusables[0]];
  } else {
    pool = confusables;
  }

  let replacement = pool[randomInt(pool.length)];
  let attempts = 0;
  while (replacement === current && attempts < 10) {
    replacement = pool[randomInt(pool.length)];
    attempts += 1;
  }
  if (replacement === current) {
    replacement = ALPHABET.split('').filter(c => c !== current)[randomInt(ALPHABET.length - 1)];
  }

  chars[index] = replacement;
  return chars.join('');
}

/** Random code with no positional relationship to the correct answer. */
function createDifferentOption(correctText) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = buildChallengeText();
    if (candidate !== correctText) return candidate;
  }
  return buildChallengeText();
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds the 4 options presented to the user:
 *   1 correct + 2 "similar" (one-character confusable) + 1 "different".
 * All options are unique and the correct one is placed randomly.
 */
function generateCaptchaOptions(correctText, mode = 'TIGHT') {
  const seen = new Set([correctText]);
  const similar = [];
  let guard = 0;

  while (similar.length < 2 && guard < 50) {
    guard += 1;
    const candidate = createSimilarOption(correctText, mode);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      similar.push(candidate);
    }
  }

  let different = createDifferentOption(correctText);
  while (seen.has(different)) {
    different = createDifferentOption(correctText);
  }

  return shuffle([correctText, ...similar, different]);
}

/**
 * THE ONLY shape of a challenge that is allowed to leave the server.
 *
 * `correctOption` is not merely omitted here on purpose: it is also excluded
 * by the schema projection (`select: false`) and stripped again by the
 * schema `toJSON` transform, so there are three independent barriers
 * between the stored answer and the client.
 */
function toPublicChallenge(challenge, extra = {}) {
  return {
    challengeId: challenge.challengeId,
    captchaText: challenge.captchaText,
    options: Array.isArray(challenge.options) ? [...challenge.options] : [],
    expiresAt: challenge.expiresAt,
    issuedAt: challenge.issuedAt || null,
    ...extra
  };
}

async function getCurrentChallengeForUser(userId) {
  const challenge = await CaptchaChallenge.findOne({
    userId,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() }
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!challenge) return null;

  // An already-open challenge must be signed too, exactly like a fresh one.
  // Without this, a page refresh or re-login hands the client a challenge it
  // can never submit (the verify endpoint requires the signature).
  const signature = computeChallengeSignature({
    challengeId: challenge.challengeId,
    userId: challenge.userId.toString(),
    expiresAt: challenge.expiresAt.toISOString(),
    secret: process.env.SERVER_SECRET
  });

  return toPublicChallenge(challenge, { issuedAt: challenge.createdAt, signature });
}

/**
 * Invalidates any still-open challenge for the user, then issues a fresh one.
 * Only one ACTIVE challenge may exist per user at a time, which removes
 * "keep N tabs open and brute force them all" as an attack.
 */
async function issueChallengeForUser(userId) {
  await CaptchaChallenge.updateMany(
    { userId, status: 'ACTIVE' },
    { $set: { status: 'DISCARDED' } }
  ).exec();

  // Adaptive difficulty: the level drives both how tight the distractors are
  // and how long the challenge lives.
  const level = await difficulty.getLevel(userId);
  const conf = rewardConfig.DIFFICULTY[level] || rewardConfig.DIFFICULTY[1];

  const correctText = buildChallengeText();
  const options = generateCaptchaOptions(correctText, conf.decoyPool);
  const expiresAt = new Date(Date.now() + conf.ttlMs);
  const challengeId = `ch_${crypto.randomUUID()}`;

  const challenge = await CaptchaChallenge.create({
    challengeId,
    userId,
    captchaText: correctText,
    options,
    correctOption: correctText,
    status: 'ACTIVE',
    expiresAt,
    isClaimed: false
  });

  // HMAC binds the challenge to this user and this expiry.
  // It stops a challenge (and its stored answer) from being replayed by
  // another account, and is verified server-side on every submission.
  const signature = computeChallengeSignature({
    challengeId: challenge.challengeId,
    userId: challenge.userId.toString(),
    expiresAt: challenge.expiresAt.toISOString(),
    secret: process.env.SERVER_SECRET
  });

  await audit.record({
    event: 'CHALLENGE_ISSUED',
    userId,
    challengeId,
    outcome: 'ALLOWED',
    detail: `level ${level} (${conf.label})`
  });

  return toPublicChallenge(challenge, {
    issuedAt: challenge.createdAt,
    signature,
    difficulty: difficulty.describe(level),
    reward: rewardService.describeRewards(),
    ttlMs: conf.ttlMs
  });
}

module.exports = {
  buildChallengeText,
  generateCaptchaOptions,
  createSimilarOption,
  createDifferentOption,
  getCurrentChallengeForUser,
  issueChallengeForUser,
  toPublicChallenge
};
