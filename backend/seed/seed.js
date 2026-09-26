/**
 * Seeds a demo account so an evaluator can log in immediately
 * (spec section 73).
 *
 * Usage: node seed/seed.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Wallet = require('../src/models/Wallet');
const CaptchaChallenge = require('../src/models/CaptchaChallenge');
const GemTransaction = require('../src/models/GemTransaction');
const AuditLog = require('../src/models/AuditLog');

const DEMO_EMAIL = 'demo@veloop.test';
const DEMO_PASSWORD = 'Demo@12345';
const DEMO_BALANCE = 100;

(async () => {
  const out = [];
  const log = (...a) => out.push(a.join(' '));

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  log('connected to', mongoose.connection.db.databaseName);

  await Promise.all([
    User.deleteMany({ email: DEMO_EMAIL }),
    CaptchaChallenge.deleteMany({}),
    GemTransaction.deleteMany({}),
    AuditLog.deleteMany({})
  ]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await User.create({ name: 'Demo User', email: DEMO_EMAIL, passwordHash });
  log('created user', user._id.toString());

  const wallet = await Wallet.create({
    userId: user._id,
    gemBalance: DEMO_BALANCE,
    lifetimeEarned: DEMO_BALANCE
  });
  log('created wallet with', wallet.gemBalance, 'gems');

  await mongoose.disconnect();

  log('');
  log('Demo account ready:');
  log('  email:    ' + DEMO_EMAIL);
  log('  password: ' + DEMO_PASSWORD);
  log('  balance:  ' + DEMO_BALANCE);

  console.log(out.join('\n'));
})().catch(err => {
  console.log('SEED FAILED: ' + err.name + ': ' + err.message);
  process.exit(1);
});
