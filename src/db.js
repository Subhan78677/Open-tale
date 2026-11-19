// Database: Turso (libSQL) through @libsql/client.
// Production reads DATABASE_URL and DATABASE_AUTH_TOKEN from the environment.
// Without DATABASE_URL a local file is used for development only.
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const config = require('./config');

function databaseUrl() {
  if (config.DATABASE_URL) return config.DATABASE_URL;
  if (config.IS_PRODUCTION) {
    throw new Error('DATABASE_URL is not set. Add your Turso database URL in the Hostinger environment variables.');
  }
  const dir = path.join(config.ROOT, 'data');
  fs.mkdirSync(dir, { recursive: true });
  return 'file:' + path.join(dir, 'opentale.db');
}

const client = createClient({
  url: databaseUrl(),
  authToken: config.DATABASE_AUTH_TOKEN || undefined,
});

// Turns a libSQL result into plain objects, e.g. [{ id: 1, email: 'a@b.c' }]
function toObjects(result) {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])));
}

// All rows for a query
async function all(sql, args = []) {
  return toObjects(await client.execute({ sql, args }));
}

// The first row, or null
async function get(sql, args = []) {
  const rows = await all(sql, args);
  return rows[0] || null;
}

// Runs a write (INSERT, UPDATE, DELETE)
async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return {
    changes: Number(result.rowsAffected),
    lastInsertRowid: result.lastInsertRowid === undefined ? null : Number(result.lastInsertRowid),
  };
}

// Runs several statements together: all succeed or none do.
// Pass a list of [sql, args] pairs.
async function batch(statements) {
  return client.batch(statements.map(([sql, args = []]) => ({ sql, args })), 'write');
}

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
  CREATE INDEX IF NOT EXISTS idx_posts_created  ON posts(created_at);
  CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
`;

// Creates the tables, indexes and default settings if they don't exist.
// Safe to run on every start.
async function init() {
  await client.executeMultiple(SCHEMA);

  // Upgrade databases created before last_seen existed
  const columns = (await all('PRAGMA table_info(users)')).map((c) => c.name);
  if (!columns.includes('last_seen')) {
    await run('ALTER TABLE users ADD COLUMN last_seen TEXT');
  }

  // Default posting rule: 2 posts every 24 hours (admin can change it)
  await run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('post_limit', '2')`);
  await run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('post_window_hours', '24')`);
}

module.exports = { all, get, run, batch, init };
