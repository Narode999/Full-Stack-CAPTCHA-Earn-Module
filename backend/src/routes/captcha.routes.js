const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getCurrentChallenge,
  issueNewChallenge,
  verifyCaptcha,
  claimReward,
  declineReward,
  getHistory,
  getConfig
} = require('../controllers/captcha.controller');
const protect = require('../middleware/auth');

const router = express.Router();

/**
 * Tighter limiter for the money path: a script hammering /verify is
 * throttled well before it can grind through the option space.
 */
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user && req.user._id ? req.user._id : req.ip),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many verification attempts. Please wait a moment.'
  }
});

// Issuing a new code is also rate limited so challenges cannot be cycled
// rapidly to fish for a lucky guess.
const issueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user && req.user._id ? req.user._id : req.ip),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many challenge requests. Please wait a moment.'
  }
});

// Spec section 48 explicitly lists /claim as a rate-limited route: claim
// spam must not be able to farm wallet credits.
const claimLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => String(req.user && req.user._id ? req.user._id : req.ip),
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many claim attempts. Please wait a moment.'
  }
});

// Public: the reward configuration is not a secret, and the frontend reads
// its reward copy from here rather than hardcoding business values.
router.get('/config', getConfig);

// Every other captcha route requires a valid JWT.
router.use(protect);

router.get('/current', getCurrentChallenge);
router.get('/new', issueLimiter, issueNewChallenge);
router.post('/new', issueLimiter, issueNewChallenge);
router.post('/verify', verifyLimiter, verifyCaptcha);
router.post('/claim', claimLimiter, claimReward);
router.post('/decline', claimLimiter, declineReward);
router.get('/history', getHistory);

module.exports = router;

