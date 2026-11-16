const express = require('express');
const db = require('../db');
const { HttpError } = require('../utils/errors');
const { publicUser } = require('../utils/auth');
const { CARD_COLS } = require('../utils/posts');
const { authenticate, requireVerified } = require('../middleware/auth');
const { imageUpload, uploadUrl } = require('../middleware/upload');

const router = express.Router();

// GET /api/profile  (account details, post count and the user's posts)
router.get('/profile', authenticate, (req, res) => {
  const posts = db.prepare(
    `SELECT ${CARD_COLS} FROM posts p WHERE p.author_id = ? ORDER BY p.created_at DESC`
  ).all(req.user.id);

  res.json({
    user: publicUser(req.user),
    joined: req.user.created_at,
    post_count: posts.length,
    total_views: posts.reduce((sum, p) => sum + p.views, 0),
    posts,
  });
});

// POST /api/upload  (image for the rich text editor)
router.post('/upload', authenticate, requireVerified, imageUpload.single('image'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'No image received');
  res.json({ url: uploadUrl(req.file) });
});

// GET /api/categories
router.get('/categories', (req, res) => {
  res.json(db.prepare(
    'SELECT category AS name, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC'
  ).all());
});

// GET /api/tags  (15 most used)
router.get('/tags', (req, res) => {
  const counts = {};
  db.prepare(`SELECT tags FROM posts WHERE tags != ''`).all()
    .forEach((r) => r.tags.split(',').forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  res.json(Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count })));
});

module.exports = router;
