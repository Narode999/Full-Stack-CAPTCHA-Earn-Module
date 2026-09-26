/**
 * Removes collections left behind by an earlier schema revision that no
 * code in this project references any more:
 *   captchaattempts      - superseded by CaptchaChallenge + AuditLog
 *   captcharewardconfigs - superseded by config/reward.config.js
 *
 * Safe to re-run. Only touches those two names.
 *
 * Usage: node scripts/cleanup-collections.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DEAD = ['captchaattempts', 'captcharewardconfigs'];
const LIVE = ['users', 'wallets', 'captchachallenges', 'gemtransactions', 'auditlogs'];

(async () => {
  const out = [];
  const log = (...a) => out.push(a.join(' '));

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  log('database:', db.databaseName, '\n');

  const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

  for (const name of DEAD) {
    if (!existing.has(name)) {
      log(`  ${name.padEnd(24)} not present, skipped`);
      continue;
    }
    const { deletedCount } = await db.collection(name).deleteMany({});
    const dropped = await db.collection(name).drop().then(() => true, () => false);
    log(`  ${name.padEnd(24)} dropped (${deletedCount} docs removed)`);
  }

  log('');
  const remaining = (await db.listCollections().toArray()).map(c => c.name).sort();
  log('collections now:', remaining.join(', '));

  const missing = LIVE.filter(n => !remaining.includes(n));
  log(missing.length === 0
    ? 'all required collections present'
    : 'WARNING missing: ' + missing.join(', '));

  await mongoose.disconnect();
  console.log(out.join('\n'));
})().catch(err => {
  console.log('ERROR ' + err.name + ': ' + err.message);
  process.exit(1);
});
