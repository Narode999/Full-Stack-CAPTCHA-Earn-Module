/**
 * One-off repair: the dev database carries a stale unique index on
 * `wallets.user` (a field that no longer exists in the schema). Every new
 * wallet insert collides with the legacy `user: null` rows.
 *
 * Run: node scripts/fix-indexes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const log = [];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  log.push('collections: ' + collections.map(c => c.name).join(', '));

  for (const name of ['wallets', 'captchachallenges', 'gemtransactions', 'users']) {
    const exists = collections.some(c => c.name === name);
    if (!exists) {
      log.push(`${name}: not present, skipped`);
      continue;
    }

    const indexes = await db.collection(name).indexes();
    log.push(`\n${name} indexes BEFORE:`);
    indexes.forEach(i => log.push('  ' + i.name + ' -> ' + JSON.stringify(i.key) + (i.unique ? ' [UNIQUE]' : '')));

    for (const idx of indexes) {
      const fields = Object.keys(idx.key);

      // Drop the legacy `user` index: the field no longer exists on the schema.
      if (name === 'wallets' && fields.length === 1 && fields[0] === 'user') {
        await db.collection(name).dropIndex(idx.name);
        log.push(`  DROPPED stale index ${idx.name}`);
      }
    }

    // Remove any rows that only existed because of the legacy field.
    if (name === 'wallets') {
      const res = await db.collection(name).deleteMany({ user: null });
      log.push(`  removed ${res.deletedCount} legacy wallet doc(s) with user: null`);
    }

    const after = await db.collection(name).indexes();
    log.push(`${name} indexes AFTER:`);
    after.forEach(i => log.push('  ' + i.name + ' -> ' + JSON.stringify(i.key) + (i.unique ? ' [UNIQUE]' : '')));
  }

  await mongoose.disconnect();
  log.push('\nDONE');
  require('fs').writeFileSync('d:/Full-Stack-CAPTCHA-Earn-Module/tools/fix-indexes.log', log.join('\n'), 'utf8');
})().catch(err => {
  log.push('ERROR: ' + err.name + ': ' + err.message);
  require('fs').writeFileSync('d:/Full-Stack-CAPTCHA-Earn-Module/tools/fix-indexes.log', log.join('\n'), 'utf8');
  process.exit(1);
});
