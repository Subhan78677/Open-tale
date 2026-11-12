const db = require('../lib/db');
const { route, httpError, sendJSON } = require('../lib/http');
const { requireAuth, requireAdmin } = require('../lib/auth');
const { CARD_COLS, FROM, getSetting, setSetting } = require('../lib/posts');

const params = (req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  return { ...Object.fromEntries(url.searchParams), ...(req.query || {}) };
};

// Every admin action checks that the caller is a logged-in admin
async function requireAdminUser(req) {
  const user = await requireAuth(req);
  requireAdmin(user);
  return user;
}

const ACTIONS = {
  // GET /api/admin/stats
  stats: {
    methods: ['GET'],
    run: async (req, res) => {
      await requireAdminUser(req);
      sendJSON(res, 200, {
        totalUsers: (await db.get('SELECT COUNT(*) AS n FROM users')).n,
        totalPosts: (await db.get('SELECT COUNT(*) AS n FROM posts')).n,
        activeNow: (await db.get(`SELECT COUNT(*) AS n FROM users WHERE last_seen > datetime('now', '-15 minutes')`)).n,
        totalViews: (await db.get('SELECT COALESCE(SUM(views), 0) AS n FROM posts')).n,
      });
    },
  },

  // GET /api/admin/posts
  posts: {
    methods: ['GET'],
    run: async (req, res) => {
      await requireAdminUser(req);
      const rows = await db.all(
        `SELECT ${CARD_COLS}, u.id AS author_id, u.name AS author_name, u.email AS author_email
         ${FROM} ORDER BY p.created_at DESC LIMIT 200`
      );
      sendJSON(res, 200, rows);
    },
  },

  // GET /api/admin/users?q=search
  users: {
    methods: ['GET'],
    run: async (req, res) => {
      await requireAdminUser(req);
      const q = `%${String(params(req).q || '').trim()}%`;
      const rows = await db.all(
        `SELECT u.id, u.name, u.email, u.role, u.banned, u.email_verified, u.created_at, u.last_seen,
                (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
         FROM users u
         WHERE u.name LIKE ? OR u.email LIKE ?
         ORDER BY u.created_at DESC`,
        [q, q]
      );
      sendJSON(res, 200, rows);
    },
  },

  // PATCH /api/admin/users/:id  (ban/unban, make/remove admin)
  user: {
    methods: ['PATCH'],
    run: async (req, res) => {
      const admin = await requireAdminUser(req);
      const id = Number(params(req).id);
      const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
      if (!target) throw httpError(404, 'User not found');
      if (target.id === admin.id) throw httpError(400, 'You cannot change your own ban or role');

      const body = req.body || {};
      if (typeof body.banned === 'boolean') {
        await db.run('UPDATE users SET banned = ? WHERE id = ?', [body.banned ? 1 : 0, id]);
      }
      if (body.role === 'admin' || body.role === 'user') {
        await db.run('UPDATE users SET role = ? WHERE id = ?', [body.role, id]);
      }
      sendJSON(res, 200, { ok: true });
    },
  },

  // GET and PUT /api/admin/settings
  settings: {
    methods: ['GET', 'PUT'],
    run: async (req, res) => {
      await requireAdminUser(req);

      if (req.method === 'GET') {
        return sendJSON(res, 200, {
          post_limit: Number(await getSetting('post_limit')),
          post_window_hours: Number(await getSetting('post_window_hours')),
        });
      }

      const body = req.body || {};
      const limit = parseInt(body.post_limit, 10);
      const hours = parseInt(body.post_window_hours, 10);
      if (!(limit >= 1 && limit <= 100)) throw httpError(400, 'Post limit must be between 1 and 100');
      if (!(hours >= 1 && hours <= 720)) throw httpError(400, 'Time window must be between 1 and 720 hours');

      await setSetting('post_limit', limit);
      await setSetting('post_window_hours', hours);
      sendJSON(res, 200, { post_limit: limit, post_window_hours: hours });
    },
  },
};

module.exports = route(['GET', 'PUT', 'PATCH'], async (req, res) => {
  const action = ACTIONS[params(req).action];
  if (!action) throw httpError(404, 'Not found');
  if (!action.methods.includes(req.method)) throw httpError(405, 'Method not allowed');
  await action.run(req, res);
});
