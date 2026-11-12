const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { route, httpError, sendJSON } = require('../lib/http');
const { hashCode, publicUser, setSession, clearSession, requireAuth, issueCode } = require('../lib/auth');
const { isBlocked } = require('../lib/moderation');

const params = (req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  return { ...Object.fromEntries(url.searchParams), ...(req.query || {}) };
};

const ACTIONS = {
  // POST /api/auth/register
  register: {
    methods: ['POST'],
    run: async (req, res) => {
      const body = req.body || {};
      const name = (body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!name || !email || !password) throw httpError(400, 'All fields are required');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw httpError(400, 'Please enter a valid email address');
      if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters');
      if (isBlocked(name)) throw httpError(400, 'Please choose an appropriate name');

      const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (existing && existing.email_verified) {
        throw httpError(409, 'This email is already registered. Please log in.');
      }
      if (!existing) {
        await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
          [name, email, bcrypt.hashSync(password, 10)]);
      }

      await issueCode(email);
      sendJSON(res, existing ? 200 : 201, { needsVerification: true, email });
    },
  },

  // POST /api/auth/verify
  verify: {
    methods: ['POST'],
    run: async (req, res) => {
      const body = req.body || {};
      const email = (body.email || '').trim().toLowerCase();
      const code = String(body.code || '').trim();

      const row = await db.get('SELECT * FROM verification_codes WHERE email = ?', [email]);
      if (!row) throw httpError(400, 'No verification code found. Please request a new one.');
      if (Number(row.expires_at) < Date.now()) throw httpError(400, 'This code has expired. Please request a new one.');
      if (Number(row.attempts) >= 5) throw httpError(429, 'Too many wrong attempts. Please request a new code.');

      if (hashCode(code) !== row.code_hash) {
        await db.run('UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ?', [email]);
        throw httpError(400, 'Wrong code. Please try again.');
      }

      await db.run('DELETE FROM verification_codes WHERE email = ?', [email]);
      await db.run('UPDATE users SET email_verified = 1 WHERE email = ?', [email]);
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) throw httpError(400, 'Account not found');
      if (user.banned) throw httpError(403, 'Your account has been banned. Please contact the admin.');

      setSession(res, user);
      sendJSON(res, 200, { user: publicUser(user) });
    },
  },

  // POST /api/auth/resend-code
  'resend-code': {
    methods: ['POST'],
    run: async (req, res) => {
      const email = ((req.body || {}).email || '').trim().toLowerCase();
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) throw httpError(404, 'No account found for this email');
      if (user.email_verified) throw httpError(400, 'This email is already verified. Please log in.');
      await issueCode(email);
      sendJSON(res, 200, { ok: true });
    },
  },

  // POST /api/auth/login
  login: {
    methods: ['POST'],
    run: async (req, res) => {
      const body = req.body || {};
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        throw httpError(401, 'Wrong email or password');
      }
      if (user.banned) throw httpError(403, 'Your account has been banned. Please contact the admin.');

      if (!user.email_verified) {
        await issueCode(email).catch(() => {});
        throw httpError(403, 'Please verify your email first. Enter the code we sent you.',
          { needsVerification: true, email });
      }

      setSession(res, user);
      sendJSON(res, 200, { user: publicUser(user) });
    },
  },

  // POST /api/auth/logout
  logout: {
    methods: ['POST'],
    run: async (req, res) => {
      clearSession(res);
      sendJSON(res, 200, { ok: true });
    },
  },

  // GET /api/auth/me
  me: {
    methods: ['GET'],
    run: async (req, res) => {
      const user = await requireAuth(req);
      sendJSON(res, 200, { user: publicUser(user) });
    },
  },
};

module.exports = route(['GET', 'POST'], async (req, res) => {
  const action = ACTIONS[params(req).action];
  if (!action) throw httpError(404, 'Not found');
  if (!action.methods.includes(req.method)) throw httpError(405, 'Method not allowed');
  await action.run(req, res);
});
