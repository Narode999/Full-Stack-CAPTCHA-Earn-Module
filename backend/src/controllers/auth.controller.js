const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const rewardConfig = require('../config/reward.config');

function signToken(user) {
  return jwt.sign(
    {
      _id: user._id,
      name: user.name,
      email: user.email
    },
    process.env.JWT_SECRET || 'dev-secret-key',
    { expiresIn: '7d' }
  );
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Name, email, and password are required.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ success: false, code: 'WEAK_PASSWORD', message: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ success: false, code: 'USER_EXISTS', message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash
    });

    const wallet = await Wallet.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          gemBalance: rewardConfig.defaultBalance,
          lifetimeEarned: rewardConfig.defaultBalance
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      balance: wallet ? Number(wallet.gemBalance) : rewardConfig.defaultBalance
    });
  } catch (error) {
    console.error('register error:', error);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Unable to register user.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const isValidPassword = await bcrypt.compare(String(password), user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
    }

    const wallet = await Wallet.findOne({ userId: user._id }).lean();
    const token = signToken(user);

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      balance: wallet ? Number(wallet.gemBalance || 0) : 0
    });
  } catch (error) {
    console.error('login error:', error);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Unable to log in.' });
  }
}

module.exports = {
  register,
  login
};
