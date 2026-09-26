const crypto = require('crypto');

function computeChallengeSignature({ challengeId, userId, expiresAt, secret }) {
  const payload = `${challengeId}${String(userId)}${String(expiresAt)}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function verifyChallengeSignature({ challengeId, userId, expiresAt, signature, secret }) {
  if (!signature || typeof signature !== 'string') return false;

  const expected = computeChallengeSignature({ challengeId, userId, expiresAt, secret });
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) return false;

  try {
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (_error) {
    return false;
  }
}

module.exports = {
  computeChallengeSignature,
  verifyChallengeSignature
};
