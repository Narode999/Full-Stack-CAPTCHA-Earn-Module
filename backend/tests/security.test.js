/**
 * Security regression suite for the VELoop CAPTCHA Earn module.
 *
 * Run: npm test
 *
 * Requires a reachable MongoDB. Uses a dedicated test database so a dev
 * database is never touched.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../server');
const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const CaptchaChallenge = require('../src/models/CaptchaChallenge');
const GemTransaction = require('../src/models/GemTransaction');
const rewardConfig = require('../src/config/reward.config');
const { computeChallengeSignature } = require('../src/middleware/verifySignature');

const TEST_MONGO_URI =
  process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/veloop_rewards_test';

// The server's minimum human reaction time guard means every "honest" solve
// has to wait this long. Tests that are *not* testing that guard use it too.
const SOLVE_DELAY_MS = rewardConfig.minSolveTimeMs + 60;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let seq = 0;
const uniqueEmail = tag => `sec_${tag}_${Date.now()}_${seq++}@test.local`;

function signToken(userId) {
  return require('jsonwebtoken').sign(
    { _id: userId, email: 'test@test.local' },
    process.env.JWT_SECRET || 'dev-secret-key',
    { expiresIn: '1h' }
  );
}

function signatureFor(challenge) {
  return computeChallengeSignature({
    challengeId: challenge.challengeId,
    userId: challenge.userId.toString(),
    expiresAt: new Date(challenge.expiresAt).toISOString(),
    secret: process.env.SERVER_SECRET
  });
}

async function createUser(name = 'Tester') {
  const user = await User.create({ name, email: uniqueEmail(name), passwordHash: 'hash' });
  return user;
}

/** Creates a challenge directly in the DB with a known answer. */
async function createChallenge(userId, overrides = {}) {
  const answer = overrides.answer || 'A7K2P9';
  const options = overrides.options || [answer, 'A7K9P2', 'AJK29P', 'X4M8Q1'];

  const challenge = await CaptchaChallenge.create({
    challengeId: overrides.challengeId || `ch_test_${Date.now()}_${seq++}`,
    userId,
    captchaText: answer,
    options,
    correctOption: answer,
    status: 'ACTIVE',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 120000),
    isClaimed: false,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {})
  });

  return challenge;
}

const post = (token, body) =>
  request(app)
    .post('/api/captcha/verify')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const postClaim = (token, body) =>
  request(app)
    .post('/api/captcha/claim')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const postDecline = (token, body) =>
  request(app)
    .post('/api/captcha/decline')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('VELoop CAPTCHA security suite', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    }
    await Promise.all([
      User.deleteMany({}),
      Wallet.deleteMany({}),
      CaptchaChallenge.deleteMany({}),
      GemTransaction.deleteMany({})
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
  });

  test('a) /current never leaks the stored answer', async () => {
    const user = await createUser('Leak');
    const token = signToken(user._id);

    const res = await request(app)
      .get('/api/captcha/current')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const challenge = res.body.challenge;
    assert.ok(challenge, 'challenge should be present');
    assert.equal('correctOption' in challenge, false, 'correctOption must not be serialised');
    assert.equal(JSON.stringify(res.body).includes('correctOption'), false);

    assert.equal(challenge.options.length, rewardConfig.optionCount);
    assert.equal(new Set(challenge.options).size, rewardConfig.optionCount, 'options must be unique');
    assert.ok(
      challenge.options.includes(challenge.captchaText),
      'the displayed code must be one of the options'
    );
    assert.ok(new Date(challenge.expiresAt).getTime() > Date.now(), 'challenge must not be born expired');
  });

  test('a2) an ALREADY-OPEN challenge is still signed and submittable', async () => {
    const user = await createUser('Returning');
    const token = signToken(user._id);

    // First call mints the challenge.
    const first = await request(app)
      .get('/api/captcha/current')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(first.status, 200);
    const minted = first.body.challenge;
    assert.ok(minted.signature, 'a freshly minted challenge must be signed');

    // Second call returns the SAME challenge (page refresh / re-login).
    const second = await request(app)
      .get('/api/captcha/current')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(second.status, 200);

    const returned = second.body.challenge;
    assert.equal(returned.challengeId, minted.challengeId, 'should reuse the live challenge');
    assert.ok(
      returned.signature,
      'an already-open challenge must also carry a signature, or the client can never submit it'
    );

    // And that signature must actually be accepted by the verify endpoint.
    await sleep(SOLVE_DELAY_MS);
    const solve = await post(token, {
      challengeId: returned.challengeId,
      selectedOption: returned.captchaText,
      signature: returned.signature
    });

    assert.equal(solve.status, 200, `reusing an open challenge must be solvable: ${JSON.stringify(solve.body)}`);
    assert.equal(solve.body.result, 'CORRECT');
  });


  test('b) client cannot dictate the outcome or the reward', async () => {
    const user = await createUser('Injector');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    const attempts = [
      { isCorrect: true },
      { reward: 99999 },
      { reward: { amount: 5000 } },
      { correctOption: challenge.correctOption },
      { result: 'CORRECT' },
      { newBalance: 1000000 },
      { gemBalance: 1000000 },
      { type: 'CAPTCHA_CORRECT' }
    ];

    for (const extra of attempts) {
      const res = await post(token, {
        challengeId: challenge.challengeId,
        selectedOption: challenge.correctOption,
        signature: signatureFor(challenge),
        ...extra
      });

      assert.equal(res.status, 400, `expected 400 when sending ${Object.keys(extra)[0]}`);
      assert.equal(res.body.code, 'CLIENT_OVERRIDE_REJECTED');
    }

    // Nothing may have been credited, and the challenge must still be open.
    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet, null, 'no wallet should be created by a rejected request');

    const stillActive = await CaptchaChallenge.findById(challenge._id);
    assert.equal(stillActive.status, 'ACTIVE');
  });

  test('c) a correct solve records a PENDING +1.0 reward, paid only on claim', async () => {
    const user = await createUser('Solver');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await sleep(SOLVE_DELAY_MS);

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'CORRECT');
    assert.equal(res.body.reward.amount, rewardConfig.correctReward);
    assert.equal(res.body.reward.status, 'PENDING');
    assert.equal('correctOption' in res.body, false);

    // The wallet must NOT have moved yet.
    const walletBefore = await Wallet.findOne({ userId: user._id });
    assert.equal(
      walletBefore ? walletBefore.gemBalance : rewardConfig.defaultBalance,
      rewardConfig.defaultBalance,
      'balance must not change before the reward is claimed'
    );

    const settled = await CaptchaChallenge.findById(challenge._id);
    assert.equal(settled.status, 'COMPLETED');
    assert.equal(settled.rewardStatus, 'PENDING');
    assert.equal(settled.rewardAmount, rewardConfig.correctReward);
    assert.equal(settled.result, 'CORRECT');

    const claim = await postClaim(token, { challengeId: challenge.challengeId });
    assert.equal(claim.status, 200);
    assert.equal(claim.body.claimed, true);
    assert.equal(claim.body.newBalance, rewardConfig.defaultBalance + rewardConfig.correctReward);

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet.gemBalance, rewardConfig.defaultBalance + rewardConfig.correctReward);

    const ledger = await GemTransaction.findOne({ referenceId: challenge.challengeId });
    assert.ok(ledger, 'a ledger entry must exist after claiming');
    assert.equal(ledger.amount, rewardConfig.correctReward);
    assert.equal(ledger.type, 'CAPTCHA_CORRECT');
    assert.equal(ledger.source, 'CAPTCHA_EARN');
    assert.equal(ledger.balanceBefore, rewardConfig.defaultBalance);
    assert.equal(ledger.balanceAfter, rewardConfig.defaultBalance + rewardConfig.correctReward);
  });

  test('d) a wrong solve records a PENDING 0.5 consolation reward', async () => {
    const user = await createUser('Guesser');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);
    const wrong = challenge.options.find(o => o !== challenge.correctOption);

    await sleep(SOLVE_DELAY_MS);

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: wrong,
      signature: signatureFor(challenge)
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'WRONG');
    assert.equal(res.body.reward.amount, rewardConfig.wrongReward);
    assert.equal(res.body.reward.status, 'PENDING');

    const claim = await postClaim(token, { challengeId: challenge.challengeId });
    assert.equal(claim.status, 200);
    assert.equal(claim.body.newBalance, rewardConfig.defaultBalance + rewardConfig.wrongReward);
  });

  test('e) replaying a completed challenge is rejected and pays nothing', async () => {
    const user = await createUser('Replayer');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await sleep(SOLVE_DELAY_MS);

    const payload = {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    };

    assert.equal((await post(token, payload)).status, 200);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const replay = await post(token, payload);
      assert.equal(replay.status, 409);
      assert.equal(replay.body.code, 'CHALLENGE_ALREADY_COMPLETED');
    }

    // Only one PENDING reward exists, so only one claim can ever succeed.
    const claims = await Promise.all([
      postClaim(token, { challengeId: challenge.challengeId }),
      postClaim(token, { challengeId: challenge.challengeId })
    ]);
    assert.equal(claims.filter(c => c.status === 200).length, 1);

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet.gemBalance, rewardConfig.defaultBalance + rewardConfig.correctReward);

    const ledgerCount = await GemTransaction.countDocuments({ referenceId: challenge.challengeId });
    assert.equal(ledgerCount, 1, 'exactly one ledger entry per challenge');
  });

  test('f) concurrent solves produce exactly one winner (no double spend)', async () => {
    const user = await createUser('Racer');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await Wallet.create({
      userId: user._id,
      gemBalance: rewardConfig.defaultBalance,
      lifetimeEarned: rewardConfig.defaultBalance
    });

    await sleep(SOLVE_DELAY_MS);

    const payload = {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    };

    const results = await Promise.all(Array.from({ length: 6 }, () => post(token, payload)));
    assert.equal(results.filter(r => r.status === 200).length, 1, 'exactly one solve may win');

    // Parallel claims on the single pending reward: still exactly one payout.
    const claims = await Promise.all(
      Array.from({ length: 5 }, () => postClaim(token, { challengeId: challenge.challengeId }))
    );
    assert.equal(claims.filter(c => c.status === 200).length, 1, 'exactly one claim may succeed');

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(
      wallet.gemBalance,
      rewardConfig.defaultBalance + rewardConfig.correctReward,
      'balance must move by exactly one reward'
    );

    const ledgerCount = await GemTransaction.countDocuments({ referenceId: challenge.challengeId });
    assert.equal(ledgerCount, 1, 'exactly one ledger entry must exist');
  });

  test('n) claiming is idempotent: 5 parallel claims pay exactly once', async () => {
    const user = await createUser('ClaimRacer');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await sleep(SOLVE_DELAY_MS);
    assert.equal((await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    })).status, 200);

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => postClaim(token, { challengeId: challenge.challengeId }))
    );

    const wins = claims.filter(c => c.status === 200);
    assert.equal(wins.length, 1, `expected 1 claim winner, got ${wins.length}`);

    const conflicts = claims.filter(c => c.status === 409);
    assert.equal(conflicts.length, 4);
    assert.equal(conflicts[0].body.code, 'ALREADY_CLAIMED');

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet.gemBalance, rewardConfig.defaultBalance + rewardConfig.correctReward);
    assert.equal(
      await GemTransaction.countDocuments({ referenceId: challenge.challengeId }),
      1,
      'exactly one ledger row'
    );
  });

  test('o) one user cannot claim another user\'s reward', async () => {
    const owner = await createUser('RewardOwner');
    const thief = await createUser('RewardThief');
    const ownerToken = signToken(owner._id);
    const thiefToken = signToken(thief._id);
    const challenge = await createChallenge(owner._id);

    await sleep(SOLVE_DELAY_MS);
    assert.equal((await post(ownerToken, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    })).status, 200);

    const res = await postClaim(thiefToken, { challengeId: challenge.challengeId });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'CHALLENGE_NOT_FOUND');
    assert.equal(await Wallet.countDocuments({ userId: thief._id }), 0);

    // The owner's reward is untouched and still claimable.
    const stillPending = await CaptchaChallenge.findById(challenge._id);
    assert.equal(stillPending.rewardStatus, 'PENDING');
  });

  test('p) an unverified challenge cannot be claimed', async () => {
    const user = await createUser('EarlyClaimer');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    const res = await postClaim(token, { challengeId: challenge.challengeId });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'CHALLENGE_NOT_COMPLETED');
    assert.equal(await Wallet.countDocuments({ userId: user._id }), 0);
  });

  test('q) "No Thanks" forfeits the reward permanently', async () => {
    const user = await createUser('Decliner');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await sleep(SOLVE_DELAY_MS);
    assert.equal((await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    })).status, 200);

    const declined = await postDecline(token, { challengeId: challenge.challengeId });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.declined, true);

    // Declining must not leave the reward claimable.
    const claim = await postClaim(token, { challengeId: challenge.challengeId });
    assert.equal(claim.status, 409);
    assert.equal(claim.body.code, 'REWARD_FORFEITED');

    // Declining must not have credited anything. A wallet row may exist
    // (difficulty tracking upserts it) but it must still hold the default.
    const wallet = await Wallet.findOne({ userId: user._id });
    if (wallet) assert.equal(wallet.gemBalance, rewardConfig.defaultBalance, 'no gems were credited');
  });

  test('r) history is scoped to the caller and hides the answer', async () => {
    const owner = await createUser('HistOwner');
    const other = await createUser('HistOther');
    const ownerToken = signToken(owner._id);
    const otherToken = signToken(other._id);

    const challenge = await createChallenge(owner._id);
    await sleep(SOLVE_DELAY_MS);
    assert.equal((await post(ownerToken, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    })).status, 200);

    const mine = await request(app)
      .get('/api/captcha/history')
      .set('Authorization', `Bearer ${ownerToken}`);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.count, 1);
    assert.equal('correctOption' in mine.body.history[0], false, 'history must not expose the answer');
    assert.equal(mine.body.history[0].result, 'CORRECT');

    // A userId query param must be ignored - identity comes from the JWT.
    const theirs = await request(app)
      .get('/api/captcha/history?userId=' + owner._id)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body.count, 0, 'history must never leak across users');
  });

  test('s) /config is public and /wallet/gems is authenticated', async () => {
    const config = await request(app).get('/api/captcha/config');
    assert.equal(config.status, 200);
    assert.equal(config.body.config.correctReward, rewardConfig.correctReward);
    assert.equal(config.body.config.wrongReward, rewardConfig.wrongReward);

    const anon = await request(app).get('/api/wallet/gems');
    assert.equal(anon.status, 401);

    const user = await createUser('GemReader');
    const token = signToken(user._id);
    await Wallet.create({
      userId: user._id,
      gemBalance: 42,
      lifetimeEarned: 42
    });
    const gems = await request(app)
      .get('/api/wallet/gems')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(gems.status, 200);
    assert.equal(gems.body.balance, 42);
  });

  test('t) difficulty promotes after a correct streak and demotes after misses', async () => {
    const user = await createUser('Adaptive');
    const token = signToken(user._id);

    const first = await request(app)
      .get('/api/captcha/current')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(first.body.challenge.difficulty.level, 1, 'a new user starts at level 1');

    // Three consecutive correct solves should promote to level 2.
    for (let i = 0; i < 3; i += 1) {
      const ch = (await request(app)
        .post('/api/captcha/new')
        .set('Authorization', `Bearer ${token}`)).body.challenge;

      await sleep(SOLVE_DELAY_MS);
      const res = await post(token, {
        challengeId: ch.challengeId,
        selectedOption: ch.captchaText,
        signature: ch.signature
      });
      assert.equal(res.body.result, 'CORRECT');
    }

    const wallet = await Wallet.findOne({ userId: user._id });
    assert.equal(wallet.difficultyLevel, 2, 'three correct solves must promote the level');

    // Two misses in a row should demote back to level 1.
    for (let i = 0; i < 2; i += 1) {
      const ch = (await request(app)
        .post('/api/captcha/new')
        .set('Authorization', `Bearer ${token}`)).body.challenge;
      const wrong = ch.options.find(o => o !== ch.captchaText);

      await sleep(SOLVE_DELAY_MS);
      await post(token, {
        challengeId: ch.challengeId,
        selectedOption: wrong,
        signature: ch.signature
      });
    }

    const after = await Wallet.findOne({ userId: user._id });
    assert.equal(after.difficultyLevel, 1, 'repeated misses must demote the level');
  });

  test('u) difficulty never changes the option composition', async () => {
    const user = await createUser('Composition');
    const token = signToken(user._id);

    // Force level 3 and confirm the spec's 1 + 2 + 1 shape still holds.
    await Wallet.create({
      userId: user._id,
      gemBalance: rewardConfig.defaultBalance,
      lifetimeEarned: rewardConfig.defaultBalance,
      difficultyLevel: 3
    });

    for (let i = 0; i < 8; i += 1) {
      const ch = (await request(app)
        .post('/api/captcha/new')
        .set('Authorization', `Bearer ${token}`)).body.challenge;

      assert.equal(ch.difficulty.level, 3, 'level must be reported back');
      assert.equal(ch.options.length, 4, 'always exactly four options');
      assert.equal(new Set(ch.options).size, 4, 'options must stay unique');
      assert.ok(ch.options.includes(ch.captchaText), 'answer must be among the options');
    }
  });

  test('v) the threat monitor records blocked attacks, scoped to the caller', async () => {
    const user = await createUser('Monitor');
    const other = await createUser('MonitorOther');
    const token = signToken(user._id);
    const otherToken = signToken(other._id);
    const challenge = await createChallenge(user._id);

    // 1. reward injection attempt
    await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge),
      reward: 99999
    });

    // 2. cross-user access attempt
    await post(otherToken, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    });

    const mine = await request(app)
      .get('/api/security/threats?blocked=true')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(mine.status, 200);
    assert.ok(mine.body.count >= 1, 'blocked attempts must be recorded');

    const kinds = mine.body.events.map(e => e.event);
    assert.ok(kinds.includes('REWARD_INJECTION_BLOCKED'), 'injection must be audited');
    assert.ok(
      mine.body.events.every(e => e.tone === 'danger' || e.tone === 'warn'),
      '?blocked=true must only return blocked events'
    );

    // The attacker legitimately sees their OWN blocked attempt, but must
    // never see the victim's events or challenge ID.
    const theirs = await request(app)
      .get('/api/security/threats')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(theirs.status, 200);
    assert.equal(
      theirs.body.events.filter(e => e.challengeId === challenge.challengeId).length,
      0,
      "threat feed must never leak another user's challenge"
    );

    const stats = await request(app)
      .get('/api/security/stats')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.blockedAttempts >= 1);
    assert.ok(stats.body.stats.injectionsBlocked >= 1);
  });

  test('w) the security endpoints require authentication', async () => {
    for (const path of ['/api/security/threats', '/api/security/stats']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, `${path} must require a JWT`);
    }
  });



  test('g) an expired challenge is refused and pays nothing', async () => {
    const user = await createUser('Latecomer');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id, { expiresAt: new Date(Date.now() - 1000) });

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    });

    assert.equal(res.status, 410);
    assert.equal(res.body.code, 'CHALLENGE_EXPIRED');
    assert.equal(await Wallet.countDocuments({ userId: user._id }), 0);

    const updated = await CaptchaChallenge.findById(challenge._id);
    assert.equal(updated.status, 'EXPIRED');
  });


  test('h) one user cannot solve another user\'s challenge', async () => {
    const owner = await createUser('Owner');
    const attacker = await createUser('Attacker');
    const attackerToken = signToken(attacker._id);
    const challenge = await createChallenge(owner._id);

    await sleep(SOLVE_DELAY_MS);

    const res = await post(attackerToken, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    });

    // The query is scoped by userId, so the attacker's challenge is simply absent.
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'CHALLENGE_NOT_FOUND');
    assert.equal(await Wallet.countDocuments({ userId: attacker._id }), 0);
    assert.equal(await Wallet.countDocuments({ userId: owner._id }), 0);

    const untouched = await CaptchaChallenge.findById(challenge._id);
    assert.equal(untouched.status, 'ACTIVE', "the owner's challenge must remain solvable");
  });

  test('i) a tampered signature is refused', async () => {
    const user = await createUser('Forger');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: 'f'.repeat(64)
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'INVALID_SIGNATURE');
    assert.equal(await Wallet.countDocuments({ userId: user._id }), 0);
  });

  test('j) an option that was never offered is refused', async () => {
    const user = await createUser('Cheater');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id);

    await sleep(SOLVE_DELAY_MS);

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: 'ZZZZZZ',
      signature: signatureFor(challenge)
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_OPTION');
    assert.equal(await Wallet.countDocuments({ userId: user._id }), 0);
  });



  test('k) answering faster than a human can is flagged as automation', async () => {
    const user = await createUser('Bot');
    const token = signToken(user._id);
    const challenge = await createChallenge(user._id, { createdAt: new Date() });

    const res = await post(token, {
      challengeId: challenge.challengeId,
      selectedOption: challenge.correctOption,
      signature: signatureFor(challenge)
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'BOT_SUSPECTED');
    assert.equal(await Wallet.countDocuments({ userId: user._id }), 0);
  });

  test('l) protected routes reject anonymous and forged tokens', async () => {
    const anonymous = await request(app).get('/api/captcha/current');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, 'AUTH_REQUIRED');

    const forged = await request(app)
      .get('/api/captcha/current')
      .set('Authorization', 'Bearer not.a.real.token');
    assert.equal(forged.status, 401);
    assert.equal(forged.body.code, 'INVALID_TOKEN');
  });

  test('m) issuing a new challenge discards the previous one', async () => {
    const user = await createUser('Refresh');
    const token = signToken(user._id);

    const first = await request(app)
      .post('/api/captcha/new')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(first.status, 200);
    const firstId = first.body.challenge.challengeId;

    const second = await request(app)
      .post('/api/captcha/new')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(second.status, 200);
    assert.notEqual(second.body.challenge.challengeId, firstId);

    const old = await CaptchaChallenge.findOne({ challengeId: firstId });
    assert.equal(old.status, 'DISCARDED');

    // Only one challenge may be live at a time.
    const active = await CaptchaChallenge.countDocuments({ userId: user._id, status: 'ACTIVE' });
    assert.equal(active, 1);
  });
});

