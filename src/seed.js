const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

// Creates only what is missing, so it is safe to run on every start
function seed() {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    console.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not set, so no admin account was created.');
    return;
  }
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get(config.ADMIN_EMAIL)) {
    db.prepare(`INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, 'admin', 1)`)
      .run('Open Tale Admin', config.ADMIN_EMAIL, bcrypt.hashSync(config.ADMIN_PASSWORD, 10));
    console.log('Admin account created.');
  }
}

module.exports = seed;
