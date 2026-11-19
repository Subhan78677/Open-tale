const express = require('express');
const db = require('../db');
const { HttpError, asyncHandler } = require('../utils/errors');
const {
  CARD_COLS, AUTHOR_COLS, FROM,
  normalizeTags, plainExcerpt, slugify, readTime, quotaInfo,
} = require('../utils/posts');
const { isBlocked } = require('../utils/moderation');
const { authenticate, requireVerified } = require('../middleware/auth');
const { imageUpload, uploadUrl, removeUpload, discardUpload } = require('../middleware/upload');

const router = express.Router();

// Checks the fields shared by creating and editing a post
function readPostFields(body) {
  const fields = {
    title: (body.title || '').trim(),
    category: (body.category || '').trim(),
    content: (body.content || '').trim(),
    excerpt: (body.excerpt || '').trim(),
    tags: normalizeTags(body.tags),
  };
  if (!fields.title || !fields.category || !fields.content) {
    throw new HttpError(400, 'Title, category and content are required');
  }
  if (fields.title.length > 140 || fields.excerpt.length > 200) {
    throw new HttpError(400, 'Title or summary is too long');
  }
  if (isBlocked(fields.title, fields.excerpt, fields.tags, fields.content)) {
    throw new HttpError(400, 'Your post contains words or content that are not allowed on Open Tale.');
  }
  return fields;
}

// Finds a post and checks the user owns it (admins can change any post)
async function findOwnedPost(user, id) {
  const post = await db.get('SELECT * FROM posts WHERE id = ?', [Number(id)]);
  if (!post) throw new HttpError(404, 'Post not found');
  if (post.author_id !== user.id && user.role !== 'admin') {
    throw new HttpError(403, 'You can only change your own posts');
  }
  return post;
}

// GET /api/posts?category=&q=&page=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const category = req.query.category || '';
  const search = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 9, 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const where = [];
  const args = [];
  if (category) { where.push('p.category = ?'); args.push(category); }
  if (search) {
    where.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.tags LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await db.get(`SELECT COUNT(*) AS n ${FROM} ${w}`, args)).n;
  const posts = await db.all(
    `SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM} ${w} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...args, limit, (page - 1) * limit]
  );

  res.json({ posts, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));

// GET /api/posts/popular  (must come before /:slug)
router.get('/popular', asyncHandler(async (req, res) => {
  res.json(await db.all(
    `SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM} ORDER BY p.views DESC, p.created_at DESC LIMIT 4`
  ));
}));

// GET /api/posts/quota  (how many posts the logged-in user can still publish)
router.get('/quota', authenticate, asyncHandler(async (req, res) => {
  res.json(await quotaInfo(req.user));
}));

// GET /api/posts/:slug/related
router.get('/:slug/related', asyncHandler(async (req, res) => {
  const post = await db.get('SELECT id, category FROM posts WHERE slug = ?', [req.params.slug]);
  if (!post) return res.json([]);
  res.json(await db.all(
    `SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM}
     WHERE p.category = ? AND p.id != ? ORDER BY p.created_at DESC LIMIT 3`,
    [post.category, post.id]
  ));
}));

// GET /api/posts/:slug  (one post; counts a view)
router.get('/:slug', asyncHandler(async (req, res) => {
  const post = await db.get(
    `SELECT ${CARD_COLS}, p.content, ${AUTHOR_COLS} ${FROM} WHERE p.slug = ?`,
    [req.params.slug]
  );
  if (!post) throw new HttpError(404, 'Post not found');
  await db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);
  res.json(post);
}));

// POST /api/posts  (multipart form with an optional "cover" image)
router.post('/', authenticate, requireVerified, imageUpload.single('cover'), asyncHandler(async (req, res) => {
  try {
    const fields = readPostFields(req.body);

    const quota = await quotaInfo(req.user);
    if (!quota.unlimited && quota.remaining <= 0) {
      throw new HttpError(429,
        `You can publish ${quota.limit} posts every ${quota.windowHours} hours. Please try again later.`,
        { nextAt: quota.nextAt });
    }

    const slug = `${slugify(fields.title)}-${Date.now().toString(36)}`;
    const cover = req.file ? await uploadUrl(req.file) : '';
    await db.run(
      `INSERT INTO posts (title, slug, excerpt, content, category, tags, cover_image, read_time, author_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fields.title, slug, fields.excerpt || plainExcerpt(fields.content), fields.content,
        fields.category, fields.tags, cover, readTime(fields.content), req.user.id,
      ]
    );
    res.status(201).json({ slug });
  } catch (err) {
    discardUpload(req);
    throw err;
  }
}));

// PUT /api/posts/:id  (edit; author or admin)
router.put('/:id', authenticate, requireVerified, imageUpload.single('cover'), asyncHandler(async (req, res) => {
  try {
    const post = await findOwnedPost(req.user, req.params.id);
    const fields = readPostFields(req.body);

    // Keep the old image unless a new one was uploaded
    let cover = post.cover_image;
    if (req.file) {
      cover = await uploadUrl(req.file);
      removeUpload(post.cover_image);
    }

    await db.run(
      `UPDATE posts SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?,
                        cover_image = ?, read_time = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        fields.title, fields.excerpt || plainExcerpt(fields.content), fields.content,
        fields.category, fields.tags, cover, readTime(fields.content), post.id,
      ]
    );
    res.json({ slug: post.slug });
  } catch (err) {
    discardUpload(req);
    throw err;
  }
}));

// DELETE /api/posts/:id  (author or admin)
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const post = await findOwnedPost(req.user, req.params.id);
  await db.run('DELETE FROM posts WHERE id = ?', [post.id]);
  removeUpload(post.cover_image);
  res.json({ ok: true });
}));

module.exports = router;