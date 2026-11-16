const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('./errors');
const { sendVerificationCode } = require('./mailer');

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

// The only user fields that are ever sent to the browser
const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  bio: u.bio, avatar: u.avatar, email_verified: !!u.email_verified,
});

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, config.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSession(res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE });
}

// Creates and emails a 6-digit code (at most one every 60 seconds)
async function issueCode(email) {
  const last = db.prepare('SELECT sent_at FROM verification_codes WHERE email = ?').get(email);
  if (last && Date.now() - last.sent_at < 60 * 1000) {
    throw new HttpError(429, 'Please wait a minute before requesting another code');
  }
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(
    `INSERT OR REPLACE INTO verification_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)`
  ).run(email, hashCode(code), Date.now() + 10 * 60 * 1000, Date.now());
  await sendVerificationCode(email, code);
}

module.exports = { hashCode, publicUser, setSession, clearSession, issueCode };
