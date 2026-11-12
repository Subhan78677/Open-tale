const db = require('../lib/db');
const { route, httpError, sendJSON } = require('../lib/http');
const { requireAuth, requireVerified } = require('../lib/auth');
const { readForm, uploadImage, removeImage } = require('../lib/media');
const {
  CARD_COLS, AUTHOR_COLS, FROM,
  normalizeTags, plainExcerpt, slugify, quotaInfo,
} = require('../lib/posts');
const { isBlocked } = require('../lib/moderation');

const params = (req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  return { ...Object.fromEntries(url.searchParams), ...(req.query || {}) };
};

const readTime = (content) =>
  Math.max(1, Math.ceil(content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 200));

// Reads and checks the fields shared by creating and editing a post
function postFields(form) {
  const f = form.fields;
  const out = {
    title: (f.title || '').trim(),
    category: (f.category || '').trim(),
    content: (f.content || '').trim(),
    excerpt: (f.excerpt || '').trim(),
    tags: normalizeTags(f.tags),
  };
  if (!out.title || !out.category || !out.content) throw httpError(400, 'Title, category and content are required');
  if (out.title.length > 140 || out.excerpt.length > 200) throw httpError(400, 'Title or summary is too long');
  if (isBlocked(out.title, out.excerpt, out.tags, out.content)) {
    throw httpError(400, 'Your post contains words or content that are not allowed on Open Tale.');
  }
  return out;
}

// Loads a post and checks the logged-in user owns it (or is an admin)
async function ownedPost(req, id) {
  const user = await requireAuth(req);
  const post = await db.get('SELECT * FROM posts WHERE id = ?', [Number(id)]);
  if (!post) throw httpError(404, 'Post not found');
  if (post.author_id !== user.id && user.role !== 'admin') {
    throw httpError(403, 'You can only change your own posts');
  }
  return { user, post };
}

const ACTIONS = {
  // GET /api/posts?category=&q=&page=&limit=
  list: {
    methods: ['GET'],
    run: async (req, res) => {
      const q = params(req);
      const category = q.category || '';
      const search = String(q.q || '').trim();
      const limit = Math.min(parseInt(q.limit, 10) || 9, 50);
      const page = Math.max(parseInt(q.page, 10) || 1, 1);

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
      sendJSON(res, 200, { posts, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
    },
  },

  // POST /api/posts  (multipart form, optional cover image)
  create: {
    methods: ['POST'],
    run: async (req, res) => {
      const user = await requireAuth(req);
      requireVerified(user);

      const form = await readForm(req);
      const p = postFields(form);

      const quota = await quotaInfo(user);
      if (!quota.unlimited && quota.remaining <= 0) {
        throw httpError(429,
          `You can publish ${quota.limit} posts every ${quota.windowHours} hours. Please try again later.`,
          { nextAt: quota.nextAt });
      }

      // The image is uploaded only after every check has passed
      const cover = form.files.cover ? await uploadImage(form.files.cover) : '';
      const slug = `${slugify(p.title)}-${Date.now().toString(36)}`;

      await db.run(
        `INSERT INTO posts (title, slug, excerpt, content, category, tags, cover_image, read_time, author_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.title, slug, p.excerpt || plainExcerpt(p.content), p.content, p.category, p.tags,
          cover, readTime(p.content), user.id]
      );
      sendJSON(res, 201, { slug });
    },
  },

  // GET /api/posts/:slug  (view one post, counts a view)
  view: {
    methods: ['GET'],
    run: async (req, res) => {
      const post = await db.get(
        `SELECT ${CARD_COLS}, p.content, ${AUTHOR_COLS} ${FROM} WHERE p.slug = ?`, [params(req).key]
      );
      if (!post) throw httpError(404, 'Post not found');
      await db.run('UPDATE posts SET views = views + 1 WHERE id = ?', [post.id]);
      sendJSON(res, 200, post);
    },
  },

  // PUT /api/posts/:id  (edit; author or admin)
  edit: {
    methods: ['PUT'],
    run: async (req, res) => {
      const { user, post } = await ownedPost(req, params(req).key);
      requireVerified(user);

      const form = await readForm(req);
      const p = postFields(form);

      // Keep the old image unless a new one was uploaded
      let cover = post.cover_image;
      if (form.files.cover) {
        cover = await uploadImage(form.files.cover);
        await removeImage(post.cover_image);
      }

      await db.run(
        `UPDATE posts SET title = ?, excerpt = ?, content = ?, category = ?, tags = ?,
                          cover_image = ?, read_time = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [p.title, p.excerpt || plainExcerpt(p.content), p.content, p.category, p.tags,
          cover, readTime(p.content), post.id]
      );
      sendJSON(res, 200, { slug: post.slug });
    },
  },

  // DELETE /api/posts/:id  (author or admin)
  delete: {
    methods: ['DELETE'],
    run: async (req, res) => {
      const { post } = await ownedPost(req, params(req).key);
      await db.run('DELETE FROM posts WHERE id = ?', [post.id]);
      await removeImage(post.cover_image);
      sendJSON(res, 200, { ok: true });
    },
  },

  // GET /api/posts/popular
  popular: {
    methods: ['GET'],
    run: async (req, res) => {
      const posts = await db.all(
        `SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM} ORDER BY p.views DESC, p.created_at DESC LIMIT 4`
      );
      sendJSON(res, 200, posts);
    },
  },

  // GET /api/posts/quota
  quota: {
    methods: ['GET'],
    run: async (req, res) => {
      const user = await requireAuth(req);
      sendJSON(res, 200, await quotaInfo(user));
    },
  },

  // GET /api/posts/:slug/related
  related: {
    methods: ['GET'],
    run: async (req, res) => {
      const post = await db.get('SELECT id, category FROM posts WHERE slug = ?', [params(req).slug || '']);
      if (!post) return sendJSON(res, 200, []);
      const posts = await db.all(
        `SELECT ${CARD_COLS}, ${AUTHOR_COLS} ${FROM}
         WHERE p.category = ? AND p.id != ? ORDER BY p.created_at DESC LIMIT 3`,
        [post.category, post.id]
      );
      sendJSON(res, 200, posts);
    },
  },

  // GET /api/categories
  categories: {
    methods: ['GET'],
    run: async (req, res) => {
      const rows = await db.all(
        'SELECT category AS name, COUNT(*) AS count FROM posts GROUP BY category ORDER BY count DESC'
      );
      sendJSON(res, 200, rows);
    },
  },

  // GET /api/tags
  tags: {
    methods: ['GET'],
    run: async (req, res) => {
      const rows = await db.all(`SELECT tags FROM posts WHERE tags != ''`);
      const counts = {};
      rows.forEach((r) => r.tags.split(',').forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
      sendJSON(res, 200, Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([name, count]) => ({ name, count })));
    },
  },
};

// Picks the action from the URL. The rewrites in vercel.json send every
// post-related URL here with either ?action=... or ?key=...
function resolveAction(req) {
  const q = params(req);
  if (q.action) return q.action;
  if (q.key === 'quota' || q.key === 'popular') return q.key;
  if (q.key !== undefined) {
    return { GET: 'view', PUT: 'edit', DELETE: 'delete' }[req.method];
  }
  return req.method === 'POST' ? 'create' : 'list';
}

module.exports = route(['GET', 'POST', 'PUT', 'DELETE'], async (req, res) => {
  const action = ACTIONS[resolveAction(req)];
  if (!action) throw httpError(404, 'Not found');
  if (!action.methods.includes(req.method)) throw httpError(405, 'Method not allowed');
  await action.run(req, res);
});
