// All settings come from environment variables (set them in the Hostinger panel).
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  PORT: process.env.PORT || 3000,
  IS_PRODUCTION: process.env.NODE_ENV === 'production',

  // Login tokens. Must be changed in production.
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  DEFAULT_JWT_SECRET: 'dev-secret-change-me',
  // Set COOKIE_SECURE=true when the site is served over HTTPS (Hostinger SSL)
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',

  // Turso (libSQL) database. Required in production.
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN || '',

  // Folder for uploaded images. Keep it outside the app folder if possible.
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,

  // Admin account is created only when both are set in the environment
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
};
