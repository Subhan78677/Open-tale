const db = require('./db');

const CARD_COLS = `p.id, p.title, p.slug, p.excerpt, p.category, p.tags, p.cover_image, p.read_time, p.views, p.created_at`;
const AUTHOR_COLS = `u.id AS author_id, u.name AS author_name, u.avatar AS author_avatar, u.bio AS author_bio`;
const FROM = `FROM posts p JOIN users u ON u.id = p.author_id`;

const normalizeTags = (t = '') =>
  [...new Set(String(t).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))].join(',');

const plainExcerpt = (content) =>
  content.replace(/<[^>]+>/g, ' ').replace(/[#*!\[\]()]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160) + '...';

const slugify = (t) =>
  t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'post';

async function getSetting(key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}

// How many posts a normal user may still publish in the current window
async function quotaInfo(user) {
  if (user.role === 'admin') return { unlimited: true };

  const limit = Number(await getSetting('post_limit'));
  const hours = Number(await getSetting('post_window_hours'));
  const rows = await db.all(
    `SELECT created_at FROM posts WHERE author_id = ? AND created_at > datetime('now', ?) ORDER BY created_at ASC`,
    [user.id, `-${hours} hours`]
  );

  const used = rows.length;
  const remaining = Math.max(limit - used, 0);
  let nextAt = null;
  if (remaining === 0) {
    const blocking = rows[used - limit];
    const t = new Date(String(blocking.created_at).replace(' ', 'T') + 'Z').getTime();
    nextAt = new Date(t + hours * 60 * 60 * 1000).toISOString();
  }
  return { unlimited: false, limit, windowHours: hours, used, remaining, nextAt };
}

module.exports = {
  CARD_COLS, AUTHOR_COLS, FROM,
  normalizeTags, plainExcerpt, slugify,
  getSetting, setSetting, quotaInfo,
};
