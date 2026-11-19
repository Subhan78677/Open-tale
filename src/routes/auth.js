const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { HttpError, asyncHandler } = require('../utils/errors');
const { hashCode, publicUser, setSession, clearSession, issueCode } = require('../utils/auth');
const { isBlocked } = require('../utils/moderation');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name || !email || !password) throw new HttpError(400, 'All fields are required');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Please enter a valid email address');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (isBlocked(name)) throw new HttpError(400, 'Please choose an appropriate name');

  const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (existing && existing.email_verified) {
    throw new HttpError(409, 'This email is already registered. Please log in.');
  }
  if (!existing) {
    await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, bcrypt.hashSync(password, 10)]);
  }

  await issueCode(email);
  res.status(existing ? 200 : 201).json({ needsVerification: true, email });
}));

// POST /api/auth/verify
router.post('/verify', asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();

  const row = await db.get('SELECT * FROM verification_codes WHERE email = ?', [email]);
  if (!row) throw new HttpError(400, 'No verification code found. Please request a new one.');
  if (Number(row.expires_at) < Date.now()) throw new HttpError(400, 'This code has expired. Please request a new one.');
  if (Number(row.attempts) >= 5) throw new HttpError(429, 'Too many wrong attempts. Please request a new code.');

  if (hashCode(code) !== row.code_hash) {
    await db.run('UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ?', [email]);
    throw new HttpError(400, 'Wrong code. Please try again.');
  }

  await db.batch([
    ['DELETE FROM verification_codes WHERE email = ?', [email]],
    ['UPDATE users SET email_verified = 1 WHERE email = ?', [email]],
  ]);
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw new HttpError(400, 'Account not found');
  if (user.banned) throw new HttpError(403, 'Your account has been banned. Please contact the admin.');

  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/resend-code
router.post('/resend-code', asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw new HttpError(404, 'No account found for this email');
  if (user.email_verified) throw new HttpError(400, 'This email is already verified. Please log in.');

  await issueCode(email);
  res.json({ ok: true });
}));

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    throw new HttpError(401, 'Wrong email or password');
  }
  if (user.banned) throw new HttpError(403, 'Your account has been banned. Please contact the admin.');

  if (!user.email_verified) {
    // Send a fresh code; ignore the one-minute wait if a code was just sent
    await issueCode(email).catch(() => {});
    throw new HttpError(403, 'Please verify your email first. Enter the code we sent you.',
      { needsVerification: true, email });
  }

  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
