const Database = require('better-sqlite3');
const path = require('path');

// Single database file, created automatically: opentale.db
const db = new Database(path.join(__dirname, 'opentale.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'user',      -- 'user' or 'admin'
    email_verified INTEGER NOT NULL DEFAULT 0,
    banned         INTEGER NOT NULL DEFAULT 0,
    bio            TEXT DEFAULT '',
    avatar         TEXT DEFAULT '',
    created_at     TEXT DEFAULT (datetime('now'))
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

  CREATE INDEX IF NOT EXISTS idx_posts_author  ON posts(author_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
`);

// Default posting rule: 2 posts every 24 hours for normal users (admin can change it)
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('post_limit', '2');
insertSetting.run('post_window_hours', '24');

// Records when each user was last active (used for "Active sessions now").
// Safe to run on existing databases: it does nothing if the column already exists.
try { db.exec('ALTER TABLE users ADD COLUMN last_seen TEXT'); } catch (_) { /* already added */ }

module.exports = db;
