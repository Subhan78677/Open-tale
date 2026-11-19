const express = require('express');
const db = require('../db');
const { HttpError, asyncHandler } = require('../utils/errors');
const { publicUser } = require('../utils/auth');
const { CARD_COLS } = require('../utils/posts');
const { authenticate, requireVerified } = require('../middleware/auth');
const { imageUpload, uploadUrl } = require('../middleware/upload');

const router = express.Router();

// GET /api/profile  (account details, post count and the user's posts)
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const posts = await db.all(
    `SELECT ${CARD_COLS} FROM posts p WHERE p.author_id = ? ORDER BY p.created_at DESC`,
    [req.user.id]
  );

  res.json({
    user: publicUser(req.user),
    joined: req.user.created_at,
    post_count: posts.length,
    total_views: posts.reduce((sum, p) => sum + Number(p.views), 0),
    posts,
  });
}));

// POST /api/upload  (image for the rich text editor)
router.post('/upload', authenticate, requireVerified, imageUpload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No image received');
  const url = await uploadUrl(req.file);
  res.json({ url });
}));

// GET /api/categories
router.get('/categories', asyncHandler(async (req, res) => {
  res.json(await db.all(
    'SELECT category AS name, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC'
  ));
}));

// GET /api/tags  (15 most used)
router.get('/tags', asyncHandler(async (req, res) => {
  const rows = await db.all(`SELECT tags FROM posts WHERE tags != ''`);
  const counts = {};
  rows.forEach((r) => r.tags.split(',').forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  res.json(Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count })));
}));

module.exports = router;