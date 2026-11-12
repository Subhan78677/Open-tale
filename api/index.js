const db = require('../lib/db');
const { route, httpError, sendJSON } = require('../lib/http');
const { requireAuth, requireVerified, publicUser } = require('../lib/auth');
const { readForm, uploadImage } = require('../lib/media');
const { CARD_COLS } = require('../lib/posts');

const params = (req) => {
  const url = new URL(req.url || '/', 'http://localhost');
  return { ...Object.fromEntries(url.searchParams), ...(req.query || {}) };
};

const ACTIONS = {
  // POST /api/upload  (image for the rich text editor, stored in Vercel Blob)
  upload: {
    methods: ['POST'],
    run: async (req, res) => {
      const user = await requireAuth(req);
      requireVerified(user);
      const form = await readForm(req);
      if (!form.files.image) throw httpError(400, 'No image received');
      const url = await uploadImage(form.files.image);
      sendJSON(res, 200, { url });
    },
  },

  // GET /api/profile  (account details, post count, and the user's posts)
  profile: {
    methods: ['GET'],
    run: async (req, res) => {
      const user = await requireAuth(req);
      const posts = await db.all(
        `SELECT ${CARD_COLS} FROM posts p WHERE p.author_id = ? ORDER BY p.created_at DESC`,
        [user.id]
      );
      sendJSON(res, 200, {
        user: publicUser(user),
        joined: user.created_at,
        post_count: posts.length,
        total_views: posts.reduce((sum, p) => sum + Number(p.views), 0),
        posts,
      });
    },
  },
};

module.exports = route(['GET', 'POST'], async (req, res) => {
  const action = ACTIONS[params(req).action];
  if (!action) throw httpError(404, 'Not found');
  if (!action.methods.includes(req.method)) throw httpError(405, 'Method not allowed');
  await action.run(req, res);
});
