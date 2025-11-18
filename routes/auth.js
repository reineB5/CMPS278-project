const express = require('express');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { hashPassword, verifyPassword, generateToken, hashToken } = require('../utils/security');
const {
  createUserSession,
  clearUserSession,
  getAuthenticatedUser,
  DEFAULT_SESSION_MS,
  REMEMBER_SESSION_MS,
} = require('../middleware/auth');

const router = express.Router();

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, rememberMe = false } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    let passwordHash;
    try {
      passwordHash = hashPassword(password);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    const user = await User.create({ name, email: normalizedEmail, passwordHash });
    await createUserSession(res, user, Boolean(rememberMe), req.get('user-agent'));

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      session: {
        rememberMe: Boolean(rememberMe),
        expiresIn: Boolean(rememberMe) ? REMEMBER_SESSION_MS : DEFAULT_SESSION_MS,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, rememberMe = false } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await createUserSession(res, user, Boolean(rememberMe), req.get('user-agent'));
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      session: {
        rememberMe: Boolean(rememberMe),
        expiresIn: Boolean(rememberMe) ? REMEMBER_SESSION_MS : DEFAULT_SESSION_MS,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    await clearUserSession(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({ user: null });
    }
    const safeUser = await getAuthenticatedUser(req);
    res.json({ user: safeUser });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: 'If an account exists, a reset token has been issued.' });
    }

    const token = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await PasswordResetToken.deleteMany({ userId: user._id });
    await PasswordResetToken.create({ userId: user._id, tokenHash, expiresAt });

    res.json({
      message: 'Password reset token generated. Use it within the next hour.',
      demoToken: token,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const { email, token, password, rememberMe = false } = req.body;
    if (!email || !token || !password) {
      return res.status(400).json({ message: 'Email, token, and new password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid reset request.' });
    }

    const tokenHash = hashToken(token);
    const record = await PasswordResetToken.findOne({ userId: user._id, tokenHash });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset token is invalid or has expired.' });
    }

    try {
      user.passwordHash = hashPassword(password);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    await user.save();
    await PasswordResetToken.deleteMany({ userId: user._id });

    await createUserSession(res, user, Boolean(rememberMe), req.get('user-agent'));

    res.json({
      message: 'Password updated successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
