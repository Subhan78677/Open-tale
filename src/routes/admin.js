const express = require('express');
const db = require('../db');
const { HttpError, asyncHandler } = require('../utils/errors');
const { CARD_COLS, FROM, getSetting, setSetting } = require('../utils/posts');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { removeUpload } = require('../middleware/upload');

const router = express.Router();

// Every route below needs a logged-in admin
router.use(authenticate, requireAdmin);

// GET /api/admin/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const count = async (sql) => (await db.get(sql)).n;
  res.json({
    totalUsers: await count('SELECT COUNT(*) AS n FROM users'),
    totalPosts: await count('SELECT COUNT(*) AS n FROM posts'),
    activeNow: await count(`SELECT COUNT(*) AS n FROM users WHERE last_seen > datetime('now', '-15 minutes')`),
    totalViews: await count('SELECT COALESCE(SUM(views), 0) AS n FROM posts'),
  });
}));

// GET /api/admin/posts  (latest 200 posts with author name and email)
router.get('/posts', asyncHandler(async (req, res) => {
  res.json(await db.all(
    `SELECT ${CARD_COLS}, u.id AS author_id, u.name AS author_name, u.email AS author_email
     ${FROM} ORDER BY p.created_at DESC LIMIT 200`
  ));
}));

// GET /api/admin/users?q=  (search by name or email)
router.get('/users', asyncHandler(async (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  res.json(await db.all(
    `SELECT u.id, u.name, u.email, u.role, u.banned, u.email_verified, u.created_at, u.last_seen,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
     FROM users u
     WHERE u.name LIKE ? OR u.email LIKE ?
     ORDER BY u.created_at DESC`,
    [q, q]
  ));
}));

// PATCH /api/admin/users/:id  (ban/unban, make/remove admin)
router.patch('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === req.user.id) throw new HttpError(400, 'You cannot change your own ban or role');

  if (typeof req.body.banned === 'boolean') {
    await db.run('UPDATE users SET banned = ? WHERE id = ?', [req.body.banned ? 1 : 0, id]);
  }
  if (req.body.role === 'admin' || req.body.role === 'user') {
    await db.run('UPDATE users SET role = ? WHERE id = ?', [req.body.role, id]);
  }
  res.json({ ok: true });
}));

// DELETE /api/admin/users/:id  (permanently removes the user, their posts and their images)
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) throw new HttpError(404, 'User not found');
  if (target.id === req.user.id) throw new HttpError(400, 'You cannot delete your own account');
  if (target.role === 'admin') throw new HttpError(400, 'Remove the admin role before deleting this account');

  const covers = await db.all('SELECT cover_image FROM posts WHERE author_id = ?', [id]);

  // All three deletes succeed together or not at all
  await db.batch([
    ['DELETE FROM posts WHERE author_id = ?', [id]],
    ['DELETE FROM verification_codes WHERE email = ?', [target.email]],
    ['DELETE FROM users WHERE id = ?', [id]],
  ]);

  // Remove the uploaded images only after the database changes succeed
  covers.forEach((row) => removeUpload(row.cover_image));
  res.json({ ok: true });
}));

// GET /api/admin/settings
router.get('/settings', asyncHandler(async (req, res) => {
  res.json({
    post_limit: Number(await getSetting('post_limit')),
    post_window_hours: Number(await getSetting('post_window_hours')),
  });
}));

// PUT /api/admin/settings  (posting limit for normal users)
router.put('/settings', asyncHandler(async (req, res) => {
  const limit = parseInt(req.body.post_limit, 10);
  const hours = parseInt(req.body.post_window_hours, 10);
  if (!(limit >= 1 && limit <= 100)) throw new HttpError(400, 'Post limit must be between 1 and 100');
  if (!(hours >= 1 && hours <= 720)) throw new HttpError(400, 'Time window must be between 1 and 720 hours');

  await setSetting('post_limit', limit);
  await setSetting('post_window_hours', hours);
  res.json({ post_limit: limit, post_window_hours: hours });
}));

module.exports = router;
