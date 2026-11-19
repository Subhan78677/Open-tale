const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { HttpError, asyncHandler } = require('../utils/errors');

// Requires a logged-in user. Also rejects banned accounts and records activity.
const authenticate = asyncHandler(async (req, res, next) => {
  let payload;
  try {
    payload = jwt.verify(req.cookies.token, config.JWT_SECRET);
  } catch (_) {
    return next(new HttpError(401, 'Please log in first'));
  }

  const user = await db.get('SELECT * FROM users WHERE id = ?', [payload.id]);
  if (!user) return next(new HttpError(401, 'Please log in first'));
  if (user.banned) return next(new HttpError(403, 'Your account has been banned. Please contact the admin.'));

  await db.run(`UPDATE users SET last_seen = datetime('now') WHERE id = ?`, [user.id]);
  req.user = user;
  next();
});

function requireVerified(req, res, next) {
  if (!req.user.email_verified) {
    return next(new HttpError(403, 'Please verify your email before doing this'));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Admins only'));
  next();
}

module.exports = { authenticate, requireVerified, requireAdmin };
