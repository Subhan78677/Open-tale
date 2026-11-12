const db = require('./db');
const seed = require('./seed');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'user',
    email_verified INTEGER NOT NULL DEFAULT 0,
    banned         INTEGER NOT NULL DEFAULT 0,
    bio            TEXT DEFAULT '',
    avatar         TEXT DEFAULT '',
    created_at     TEXT DEFAULT (datetime('now')),
    last_seen      TEXT
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    excerpt     TEXT DEFAULT '',
    content     TEXT NOT NULL,
    category    TEXT NOT NULL,
    tags        TEXT DEFAULT '',
    cover_image TEXT DEFAULT '',
    read_time   INTEGER DEFAULT 1,
    views       INTEGER DEFAULT 0,
    author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS verification_codes (
    email      TEXT PRIMARY KEY,
    code_hash  TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    sent_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_posts_author   ON posts(author_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
`;

let ready = null;

// Runs once per warm function instance. If it fails, the next request tries again.
function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await db.exec(SCHEMA);
      await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('post_limit', '2')`);
      await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('post_window_hours', '24')`);
      await seed();
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

module.exports = { ensureReady };
