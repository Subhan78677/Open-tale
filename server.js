const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const db = require('./db');
const seed = require('./seed');
const { sendVerificationCode } = require('./mailer');
const { isBlocked } = require('./moderation');

seed(db);

const app = express();
const PORT = process.env.PORT || 3000;
// Set a long random value in production: JWT_SECRET=... npm start
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  throw err;
}

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  bio: u.bio, avatar: u.avatar, email_verified: !!u.email_verified,
});

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key).value;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, String(value));
}

// Creates and emails a 6-digit code (at most one every 60 seconds)
async function issueCode(email) {
  const last = db.prepare('SELECT sent_at FROM verification_codes WHERE email = ?').get(email);
  if (last && Date.now() - last.sent_at < 60 * 1000) {
    fail(429, 'Please wait a minute before requesting another code');
  }
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(`INSERT OR REPLACE INTO verification_codes (email, code_hash, expires_at, attempts, sent_at)
              VALUES (?, ?, ?, 0, ?)`)
    .run(email, hashCode(code), Date.now() + 10 * 60 * 1000, Date.now());
  await sendVerificationCode(email, code);
}

// Posting limit for a normal user, based on posts in the last X hours
function quotaInfo(user) {
  if (user.role === 'admin') return { unlimited: true };

  const limit = Number(getSetting('post_limit'));
  const hours = Number(getSetting('post_window_hours'));
  const rows = db
    .prepare(`SELECT created_at FROM posts WHERE author_id = ? AND created_at > datetime('now', ?) ORDER BY created_at ASC`)
    .all(user.id, `-${hours} hours`);

  const used = rows.length;
  const remaining = Math.max(limit - used, 0);
  let nextAt = null;
  if (remaining === 0) {
    // A new post becomes allowed when the oldest blocking post is older than the window
    const blocking = rows[used - limit];
    const t = new Date(blocking.created_at.replace(' ', 'T') + 'Z').getTime();
    nextAt = new Date(t + hours * 60 * 60 * 1000).toISOString();
  }
  return { unlimited: false, limit, windowHours: hours, used, remaining, nextAt };
}

// ---------- Auth middleware ----------
function currentUser(req) {
  try {
    const { id } = jwt.verify(req.cookies.token || '', JWT_SECRET);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return next(Object.assign(new Error('Please log in first'), { status: 401 }));
  if (user.banned) {
    return next(Object.assign(new Error('Your account has been banned. Please contact the admin.'), { status: 403 }));
  }
  req.user = user;
  db.prepare(`UPDATE users SET last_seen = datetime('now') WHERE id = ?`).run(user.id);
  next();
}

function requireVerified(req, res, next) {
  if (!req.user.email_verified) {
    return next(Object.assign(new Error('Please verify your email before doing this'), { status: 403 }));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return next(Object.assign(new Error('Admins only'), { status: 403 }));
  next();
}

// ---------- Uploads (images only, 5 MB max) ----------
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPG, PNG, WEBP or GIF images are allowed');
    err.status = 400;
    cb(err);
  },
});

// ---------- Post helpers ----------
const CARD_COLS = `p.id, p.title, p.slug, p.excerpt, p.category, p.tags, p.cover_image, p.read_time, p.views, p.created_at`;
const AUTHOR_COLS = `u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar, u.bio AS author_bio`;
const FROM = `FROM posts p JOIN users u ON u.id = p.author_id`;

const normalizeTags = (t = '') => [...new Set(String(t).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))].join(',');

const plainExcerpt = (content) =>
  content.replace(/<[^>]+>/g, ' ').replace(/[#*!\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) + '...';

const slugify = (t) =>
  t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'post';

// ==========================================================
// AUTH ROUTES
// ==========================================================
app.post('/api/auth/register', wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!name || !email || !password) fail(400, 'All fields are required');
  if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Please enter a valid email address');
  if (password.length < 6) fail(400, 'Password must be at least 6 characters');
  if (isBlocked(name)) fail(400, 'Please choose an appropriate name');

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing && existing.email_verified) fail(409, 'This email is already registered. Please log in.');

  if (!existing) {
    db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, email, bcrypt.hashSync(password, 10));
  }
  await issueCode(email);
  res.status(existing ? 200 : 201).json({ needsVerification: true, email });
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const row = db.prepare('SELECT * FROM verification_codes WHERE email = ?').get(email);

  if (!row) fail(400, 'No verification code found. Please request a new one.');
  if (row.expires_at < Date.now()) fail(400, 'This code has expired. Please request a new one.');
  if (row.attempts >= 5) fail(429, 'Too many wrong attempts. Please request a new code.');
  if (hashCode(code) !== row.code_hash) {
    db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    fail(400, 'Wrong code. Please try again.');
  }

  db.prepare('DELETE FROM verification_codes WHERE email = ?').run(email);
  db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) fail(400, 'Account not found');
  if (user.banned) fail(403, 'Your account has been banned. Please contact the admin.');

  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/resend-code', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) fail(404, 'No account found for this email');
  if (user.email_verified) fail(400, 'This email is already verified. Please log in.');
  await issueCode(email);
  res.json({ ok: true });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) fail(401, 'Wrong email or password');
  if (user.banned) fail(403, 'Your account has been banned. Please contact the admin.');

  if (!user.email_verified) {
    // Send a fresh code and ask for it (ignore the 1-minute wait if a code was just sent)
    await issueCode(email).catch(() => {});
    fail(403, 'Please verify your email first. Enter the code we sent you.', { needsVerification: true, email });
  }

  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ==========================================================
// POST ROUTES
// ==========================================================
// Shows how many posts the logged-in user can still publish
app.get('/api/posts/quota', requireAuth, (req, res) => {
  res.json(quotaInfo(req.user));
});

app.get('/api/posts', (req, res) => {
  const category = req.query.category || '';
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 9, 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const where = [];
  const params = [];
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (q) {
    where.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.tags LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { n: total } = db.prepare(`SELECT COUNT(*) AS n ${FROM} ${w}`).get(...params);
  const posts = db
    .prepare(`SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM} ${w} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, (page - 1) * limit);

  res.json({ posts, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
});

app.get('/api/posts/popular', (req, res) => {
  res.json(
    db.prepare(`SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM} ORDER BY p.views DESC, p.created_at DESC LIMIT 4`).all()
  );
});

app.get('/api/posts/:slug/related', (req, res) => {
  const post = db.prepare('SELECT id, category FROM posts WHERE slug = ?').get(req.params.slug);
  if (!post) return res.json([]);
  res.json(
    db.prepare(`SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM}
                WHERE p.category = ? AND p.id != ? ORDER BY p.created_at DESC LIMIT 3`)
      .all(post.category, post.id)
  );
});

app.get('/api/posts/:slug', (req, res) => {
  const post = db
    .prepare(`SELECT ${CARD_COLS}, p.content, ${AUTHOR_COLS} ${FROM} WHERE p.slug = ?`)
    .get(req.params.slug);
  if (!post) fail(404, 'Post not found');
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(post.id);
  res.json(post);
});

// Create a post (multipart form: title, category, excerpt, content, tags, cover)
app.post('/api/posts', requireAuth, requireVerified, upload.single('cover'), wrap(async (req, res) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const title = (req.body.title || '').trim();
  const category = (req.body.category || '').trim();
  const content = (req.body.content || '').trim();
  const excerpt = (req.body.excerpt || '').trim();
  const tags = normalizeTags(req.body.tags);

  try {
    if (!title || !category || !content) fail(400, 'Title, category and content are required');
    if (title.length > 140 || excerpt.length > 200) fail(400, 'Title or summary is too long');
    if (isBlocked(title, excerpt, tags, content)) {
      fail(400, 'Your post contains words or content that are not allowed on Open Tale.');
    }
    const quota = quotaInfo(req.user);
    if (!quota.unlimited && quota.remaining <= 0) {
      fail(429,
        `You can publish ${quota.limit} posts every ${quota.windowHours} hours. Please try again later.`,
        { nextAt: quota.nextAt });
    }
  } catch (err) {
    cleanup();
    throw err;
  }

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const cover = req.file ? `/uploads/${req.file.filename}` : '';
  const readTime = Math.max(1, Math.ceil(content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 200));

  db.prepare(`INSERT INTO posts (title, slug, excerpt, content, category, tags, cover_image, read_time, author_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(title, slug, excerpt || plainExcerpt(content), content, category, tags, cover, readTime, req.user.id);

  res.status(201).json({ slug });
}));

// Edit a post: the author or any admin. Same fields as creating a post.
app.put('/api/posts/:id', requireAuth, requireVerified, upload.single('cover'), wrap(async (req, res) => {
  const cleanup = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  const title = (req.body.title || '').trim();
  const category = (req.body.category || '').trim();
  const content = (req.body.content || '').trim();
  const excerpt = (req.body.excerpt || '').trim();
  const tags = normalizeTags(req.body.tags);

  try {
    if (!post) fail(404, 'Post not found');
    if (post.author_id !== req.user.id && req.user.role !== 'admin') {
      fail(403, 'You can only edit your own posts');
    }
    if (!title || !category || !content) fail(400, 'Title, category and content are required');
    if (title.length > 140 || excerpt.length > 200) fail(400, 'Title or summary is too long');
    if (isBlocked(title, excerpt, tags, content)) {
      fail(400, 'Your post contains words or content that are not allowed on Open Tale.');
    }
  } catch (err) {
    cleanup();
    throw err;
  }

  // Keep the old cover unless a new image was uploaded
  let cover = post.cover_image;
  if (req.file) {
    cover = `/uploads/${req.file.filename}`;
    if (post.cover_image && post.cover_image.startsWith('/uploads/')) {
      fs.unlink(path.join(__dirname, 'public', post.cover_image), () => {});
    }
  }

  const readTime = Math.max(1, Math.ceil(content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 200));
  db.prepare(`UPDATE posts SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?,
                               cover_image = ?, read_time = ?, updated_at = datetime('now')
              WHERE id = ?`)
    .run(title, excerpt || plainExcerpt(content), content, category, tags, cover, readTime, post.id);

  res.json({ slug: post.slug });
}));

// Image for the rich text editor. Returns the image URL.
app.post('/api/upload', requireAuth, requireVerified, upload.single('image'), (req, res) => {
  if (!req.file) fail(400, 'No image received');
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Delete a post: the author or any admin
app.delete('/api/posts/:id', requireAuth, wrap(async (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) fail(404, 'Post not found');
  if (post.author_id !== req.user.id && req.user.role !== 'admin') {
    fail(403, 'You can only delete your own posts');
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  if (post.cover_image && post.cover_image.startsWith('/uploads/')) {
    fs.unlink(path.join(__dirname, 'public', post.cover_image), () => {});
  }
  res.json({ ok: true });
}));

// ==========================================================
// SIDEBAR DATA
// ==========================================================
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT category AS name, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC').all());
});

app.get('/api/tags', (req, res) => {
  const counts = {};
  db.prepare(`SELECT tags FROM posts WHERE tags != ''`).all()
    .forEach((r) => r.tags.split(',').forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  res.json(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }))
  );
});

// ==========================================================
// ADMIN ROUTES (admin only)
// ==========================================================
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  res.json(
    db.prepare(`SELECT u.id, u.name, u.email, u.role, u.banned, u.email_verified, u.created_at, u.last_seen,
                       (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
                FROM users u
                WHERE u.name LIKE ? OR u.email LIKE ?
                ORDER BY u.created_at DESC`).all(q, q)
  );
});

// Ban / unban a user, or make them admin / remove admin
app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) fail(404, 'User not found');
  if (target.id === req.user.id) fail(400, 'You cannot change your own ban or role');

  if (typeof req.body.banned === 'boolean') {
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(req.body.banned ? 1 : 0, id);
  }
  if (req.body.role === 'admin' || req.body.role === 'user') {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(req.body.role, id);
  }
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  res.json({
    post_limit: Number(getSetting('post_limit')),
    post_window_hours: Number(getSetting('post_window_hours')),
  });
});

// Change how many posts normal users may publish, and the time window
app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const limit = parseInt(req.body.post_limit, 10);
  const hours = parseInt(req.body.post_window_hours, 10);
  if (!(limit >= 1 && limit <= 100)) fail(400, 'Post limit must be between 1 and 100');
  if (!(hours >= 1 && hours <= 720)) fail(400, 'Time window must be between 1 and 720 hours');
  setSetting('post_limit', limit);
  setSetting('post_window_hours', hours);
  res.json({ post_limit: limit, post_window_hours: hours });
});

// ==========================================================
// ERRORS
// ==========================================================
// ----- Profile: the logged-in user's own account and posts -----
app.get('/api/profile', requireAuth, (req, res) => {
  const posts = db
    .prepare(`SELECT ${CARD_COLS} FROM posts p WHERE p.author_id = ? ORDER BY p.created_at DESC`)
    .all(req.user.id);
  res.json({
    user: publicUser(req.user),
    joined: req.user.created_at,
    post_count: posts.length,
    total_views: posts.reduce((sum, p) => sum + p.views, 0),
    posts,
  });
});

// ----- Admin dashboard numbers -----
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  res.json({
    totalUsers: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    totalPosts: db.prepare('SELECT COUNT(*) AS n FROM posts').get().n,
    activeNow: db.prepare(`SELECT COUNT(*) AS n FROM users WHERE last_seen > datetime('now', '-15 minutes')`).get().n,
    totalViews: db.prepare('SELECT COALESCE(SUM(views), 0) AS n FROM posts').get().n,
  });
});

// All posts with author name and email (admin only)
app.get('/api/admin/posts', requireAuth, requireAdmin, (req, res) => {
  res.json(
    db.prepare(`SELECT ${CARD_COLS}, u.id AS author_id, u.name AS author_name, u.email AS author_email
                ${FROM} ORDER BY p.created_at DESC LIMIT 200`).all()
  );
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    err.status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Image must be 5 MB or smaller';
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server' : err.message,
    ...(err.extra || {}),
  });
});

app.listen(PORT, () => {
  console.log(`Open Tale is running at http://localhost:${PORT}`);
});
