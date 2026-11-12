const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const { httpError } = require('./http');
const { sendVerificationCode } = require('./mailer');

// Set a long random JWT_SECRET in Vercel before going live
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Vercel serves the site over HTTPS, so cookies must be marked Secure there
const SECURE = process.env.VERCEL ? '; Secure' : '';

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  bio: u.bio, avatar: u.avatar, email_verified: !!u.email_verified,
});

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${SECURE}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE}`);
}

// Returns the logged-in user, or null
async function currentUser(req) {
  const token = parseCookies(req).token;
  if (!token) return null;
  let id;
  try {
    ({ id } = jwt.verify(token, JWT_SECRET));
  } catch (_) {
    return null;
  }
  return db.get('SELECT * FROM users WHERE id = ?', [id]);
}

// Use at the start of any route that needs a logged-in user
async function requireAuth(req) {
  const user = await currentUser(req);
  if (!user) throw httpError(401, 'Please log in first');
  if (user.banned) throw httpError(403, 'Your account has been banned. Please contact the admin.');
  await db.run(`UPDATE users SET last_seen = datetime('now') WHERE id = ?`, [user.id]);
  return user;
}

function requireVerified(user) {
  if (!user.email_verified) throw httpError(403, 'Please verify your email before doing this');
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw httpError(403, 'Admins only');
}

// Creates and emails a 6-digit code (at most one every 60 seconds)
async function issueCode(email) {
  const last = await db.get('SELECT sent_at FROM verification_codes WHERE email = ?', [email]);
  if (last && Date.now() - Number(last.sent_at) < 60 * 1000) {
    throw httpError(429, 'Please wait a minute before requesting another code');
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await db.run(
    `INSERT OR REPLACE INTO verification_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)`,
    [email, hashCode(code), Date.now() + 10 * 60 * 1000, Date.now()]
  );
  await sendVerificationCode(email, code);
}

module.exports = {
  hashCode, publicUser, setSession, clearSession, currentUser,
  requireAuth, requireVerified, requireAdmin, issueCode,
};
