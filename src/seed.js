const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

// Creates the admin account if it is missing. Runs on every start.
async function seed() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not set, so no admin account was created.');
    return;
  }
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [config.ADMIN_EMAIL]);
  if (!existing) {
    await db.run(
      `INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, 'admin', 1)`,
      ['Open Tale Admin', config.ADMIN_EMAIL, bcrypt.hashSync(config.ADMIN_PASSWORD, 10)]
    );
    console.log('Admin account created.');
  }
}

module.exports = seed;
