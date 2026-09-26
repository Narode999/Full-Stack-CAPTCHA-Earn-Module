const express = require('express');
const Wallet = require('../models/Wallet');
const GemTransaction = require('../models/GemTransaction');
const protect = require('../middleware/auth');

const router = express.Router();
router.use(protect);

/**
 * GET /api/wallet/gems  (spec section 44)
 *
 * The ONLY authority for a gem balance. The frontend never treats a cached
 * value as the source of truth (spec section 43).
 */
router.get('/gems', async (req, res) => {
  const wallet = await Wallet.findOne({ userId: req.user._id }).lean();
  return res.json({
    success: true,
    balance: wallet ? Number(wallet.gemBalance) : 0,
    lifetimeEarned: wallet ? Number(wallet.lifetimeEarned) : 0
  });
});

/** Backwards-compatible alias. */
router.get('/balance', async (req, res) => {
  const wallet = await Wallet.findOne({ userId: req.user._id }).lean();

  return res.json({
    success: true,
    balance: wallet ? Number(wallet.gemBalance || 0) : 0
  });
});

/** The caller's own gem ledger, newest first. */
router.get('/transactions', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const transactions = await GemTransaction.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return res.json({ success: true, count: transactions.length, transactions });
});

module.exports = router;
