/** Shows what is actually persisted in MongoDB. */
const fs = require('fs');
require('dotenv').config();
const mongoose = require('mongoose');

const out = [];
const log = (...a) => out.push(a.join(' '));

(async () => {
  log('MONGO_URI =', process.env.MONGO_URI);
  log('');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  log('Connected. readyState =', mongoose.connection.readyState, '(1 = connected)');
  const db = mongoose.connection.db;
  log('Database  =', db.databaseName);
  log('');

  const cols = await db.listCollections().toArray();
  log('--- collections ---');
  for (const c of cols.sort((a, b) => a.name.localeCompare(b.name))) {
    // listCollections() does not return a count, so ask for it explicitly.
    const n = await db.collection(c.name).countDocuments();
    log(`  ${c.name.padEnd(22)} ${String(n).padStart(5)} docs`);
  }

  const collections = {
    users: 'users',
    wallets: 'wallets',
    challenges: 'captchachallenges',
    transactions: 'gemtransactions'
  };

  log('');
  log('--- counts ---');
  for (const [label, name] of Object.entries(collections)) {
    const n = await db.collection(name).countDocuments();
    log(`  ${label.padEnd(14)} ${n}`);
  }

  const wallet = await db.collection('wallets').findOne({});
  if (wallet) {
    log('');
    log('--- sample wallet ---');
    log('  userId      =', String(wallet.userId));
    log('  gemBalance  =', wallet.gemBalance);
    log('  lifetime    =', wallet.lifetimeEarned);
  }

  const challenge = await db
    .collection('captchachallenges')
    .findOne({}, { sort: { createdAt: -1 } });
  if (challenge) {
    log('');
    log('--- sample challenge (newest) ---');
    log('  challengeId =', challenge.challengeId);
    log('  userId      =', String(challenge.userId));
    log('  captchaText =', challenge.captchaText);
    log('  options     =', JSON.stringify(challenge.options));
    // Present in the DB but never sent to the client:
    log('  correctOption =', challenge.correctOption, '  <-- STORED, NEVER EXPOSED');
    log('  status      =', challenge.status);
    log('  expiresAt   =', String(challenge.expiresAt));
  }

  const txn = await db.collection('gemtransactions').findOne({}, { sort: { createdAt: -1 } });
  if (txn) {
    log('');
    log('--- sample gem transaction (newest) ---');
    log('  transactionId =', txn.transactionId);
    log('  userId        =', String(txn.userId));
    log('  amount        =', txn.amount);
    log('  type          =', txn.type);
    log('  referenceId   =', txn.referenceId);
    log('  balanceBefore =', txn.balanceBefore);
    log('  balanceAfter  =', txn.balanceAfter);
  }

  await mongoose.disconnect();
  log('');
  log('Disconnected cleanly.');
  console.log(out.join('\n'));
})().catch(e => {
  out.push('ERROR: ' + e.message);
  console.log(out.join('\n'));
});
