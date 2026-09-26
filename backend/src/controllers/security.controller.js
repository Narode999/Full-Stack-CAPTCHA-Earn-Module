const AuditLog = require('../models/AuditLog');
const GemTransaction = require('../models/GemTransaction');

/**
 * Live threat monitor.
 *
 * Surfaces the append-only audit trail so the system's own defences are
 * observable. Note what this endpoint deliberately does NOT do: it exposes no
 * `correctOption`, and a caller can only ever see their OWN events - a global
 * feed would leak challenge IDs and the shape of other users' activity.
 */

/** Human-readable copy for each blocked event, for display. */
const EVENT_LABEL = {
  CHALLENGE_ISSUED: { label: 'Challenge issued', tone: 'neutral' },
  CHALLENGE_VERIFIED: { label: 'Challenge verified', tone: 'ok' },
  REWARD_CLAIMED: { label: 'Reward claimed', tone: 'ok' },
  REWARD_FORFEITED: { label: 'Reward declined', tone: 'neutral' },
  REWARD_INJECTION_BLOCKED: { label: 'Reward injection blocked', tone: 'danger' },
  REPLAY_BLOCKED: { label: 'Replay attack blocked', tone: 'danger' },
  DUPLICATE_CLAIM_BLOCKED: { label: 'Duplicate claim blocked', tone: 'danger' },
  CROSS_USER_BLOCKED: { label: 'Cross-user access blocked', tone: 'danger' },
  EXPIRED_CHALLENGE_BLOCKED: { label: 'Expired challenge blocked', tone: 'warn' },
  BOT_SUSPECTED: { label: 'Automation suspected', tone: 'warn' },
  INVALID_SIGNATURE: { label: 'Forged signature blocked', tone: 'danger' },
  RATE_LIMITED: { label: 'Rate limit hit', tone: 'warn' }
};

const BLOCKED = new Set(
  Object.entries(EVENT_LABEL)
    .filter(([, v]) => v.tone === 'danger' || v.tone === 'warn')
    .map(([k]) => k)
);

/** GET /api/security/threats - the caller's recent security events. */
async function getThreats(req, res) {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const onlyBlocked = req.query.blocked === 'true';

  const filter = { userId: req.user._id };
  if (onlyBlocked) filter.event = { $in: [...BLOCKED] };

  const events = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  return res.json({
    success: true,
    count: events.length,
    events: events.map(e => ({
      id: String(e._id),
      event: e.event,
      ...(EVENT_LABEL[e.event] || { label: e.event, tone: 'neutral' }),
      detail: e.detail,
      challengeId: e.challengeId,
      ip: e.ip,
      createdAt: e.createdAt
    }))
  });
}

/** GET /api/security/stats - counters for the caller's own activity. */
async function getStats(req, res) {
  const [total, blocked, claims, injected, replayed] = await Promise.all([
    AuditLog.countDocuments({ userId: req.user._id }),
    AuditLog.countDocuments({ userId: req.user._id, outcome: 'BLOCKED' }),
    AuditLog.countDocuments({ userId: req.user._id, event: 'REWARD_CLAIMED' }),
    AuditLog.countDocuments({ userId: req.user._id, event: 'REWARD_INJECTION_BLOCKED' }),
    AuditLog.countDocuments({ userId: req.user._id, event: { $in: ['REPLAY_BLOCKED', 'DUPLICATE_CLAIM_BLOCKED'] } })
  ]);

  // Gems that would have been minted by blocked claims.
  const protectedValue = await GemTransaction.aggregate([
    { $match: { userId: req.user._id, source: 'CAPTCHA_EARN' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  return res.json({
    success: true,
    stats: {
      totalEvents: total,
      blockedAttempts: blocked,
      claimsCompleted: claims,
      injectionsBlocked: injected,
      replaysBlocked: replayed,
      gemsEarned: protectedValue.length ? Number(protectedValue[0].total) : 0,
      monitoredSince: null
    }
  });
}

module.exports = { getThreats, getStats, EVENT_LABEL };
