const Session = require('../models/Session');
const User = require('../models/User');
const { generateToken, hashToken } = require('../utils/security');

const DEFAULT_SESSION_MS = 1000 * 60 * 60 * 12; // 12 hours
const REMEMBER_SESSION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

async function attachUser(req, _res, next) {
  try {
    const rawToken = req.cookies?.session_token;
    if (!rawToken) {
      next();
      return;
    }

    const tokenHash = hashToken(rawToken);
    const session = await Session.findOne({ tokenHash }).populate('userId');
    if (!session) {
      next();
      return;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await Session.deleteOne({ _id: session._id });
      next();
      return;
    }

    req.sessionRecord = session;
    req.user = session.userId;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAuth(req, res, next) {
  if (req.user) {
    next();
    return;
  }

  const acceptsHtml = (req.headers.accept || '').includes('text/html');
  const isApiRequest = req.originalUrl.startsWith('/api/');

  if (acceptsHtml && !isApiRequest) {
    return res.redirect('/login');
  }

  res.status(401).json({ message: 'Authentication required' });
}

function ensureGuest(req, res, next) {
  if (req.user) {
    return res.redirect('/home');
  }
  next();
}

async function createUserSession(res, user, rememberMe = false, userAgent = '') {
  const token = generateToken(48);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + (rememberMe ? REMEMBER_SESSION_MS : DEFAULT_SESSION_MS));
  await Session.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    rememberMe,
    userAgent,
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  };

  if (rememberMe) {
    // Set both maxAge and expires for better browser compatibility
    cookieOptions.maxAge = REMEMBER_SESSION_MS;
    cookieOptions.expires = new Date(Date.now() + REMEMBER_SESSION_MS);
  } else {
    // Even for non-remember sessions, set maxAge so cookie persists across browser restarts
    // until it expires (12 hours)
    cookieOptions.maxAge = DEFAULT_SESSION_MS;
    cookieOptions.expires = new Date(Date.now() + DEFAULT_SESSION_MS);
  }

  res.cookie('session_token', token, cookieOptions);
}

async function clearUserSession(req, res) {
  const rawToken = req.cookies?.session_token;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await Session.deleteOne({ tokenHash });
  }
  res.clearCookie('session_token', { httpOnly: true, sameSite: 'lax', path: '/' });
}

async function getAuthenticatedUser(req) {
  if (!req.user) return null;
  if (req.user.passwordHash) {
    const { passwordHash, ...rest } = req.user.toObject();
    return rest;
  }
  const user = await User.findById(req.user._id).select('-passwordHash');
  return user;
}

module.exports = {
  attachUser,
  requireAuth,
  ensureGuest,
  createUserSession,
  clearUserSession,
  getAuthenticatedUser,
  DEFAULT_SESSION_MS,
  REMEMBER_SESSION_MS,
};
