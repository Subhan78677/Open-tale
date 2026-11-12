// Database access. On Vercel the data lives in Turso (free hosted SQLite).
// Locally, if TURSO_DATABASE_URL is not set, a file named opentale.db is used.
const { createClient } = require('@libsql/client');
const path = require('path');

let client = null;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL
      || (process.env.VERCEL ? '' : 'file:' + path.join(__dirname, '..', 'opentale.db'));
    if (!url) {
      throw new Error('TURSO_DATABASE_URL is not set. Add it in Vercel > Project > Settings > Environment Variables.');
    }
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}

async function run(sql, args = []) {
  return getClient().execute({ sql, args });
}

async function all(sql, args = []) {
  return (await run(sql, args)).rows;
}

async function get(sql, args = []) {
  return (await all(sql, args))[0] || null;
}

// Runs several SQL statements separated by semicolons (used for the schema)
async function exec(sql) {
  return getClient().executeMultiple(sql);
}

module.exports = { run, all, get, exec };
