const AuditLog = require('../models/AuditLog');

/**
 * Append-only audit trail helper.
 *
 * Auditing must never break the request it is describing, so every write is
 * best-effort: a failure is logged and swallowed.
 */
async function record({ event, userId, challengeId, outcome = 'ALLOWED', detail = null, ip = null }) {
  try {
    await AuditLog.create({ event, userId, challengeId, outcome, detail, ip });
  } catch (error) {
    console.error('audit.record failed:', error.message);
  }
}

module.exports = { record };
