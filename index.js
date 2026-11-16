// ==========================================================
// Open Tale - single entry point.
// Hostinger runs this file: "node server.js" (or the startup file set in hPanel).
// ==========================================================
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./src/config');

// Refuse to start in production with the default login secret
if (config.IS_PRODUCTION && config.JWT_SECRET === config.DEFAULT_JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add a long random JWT_SECRET in the Hostinger environment variables.');
  process.exit(1);
}

// Opens the database and creates the tables (must run before routes)
require('./src/db');
require('./src/seed')();

const { mountRoutes } = require('./src/routes');
const { errorHandler } = require('./src/middleware/errors');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger puts the site behind a proxy

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Website pages, CSS, JS and images
app.use(express.static(config.PUBLIC_DIR));
// Uploaded images (kept in UPLOAD_DIR so they survive redeploys)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// API routes
mountRoutes(app);

// Shows any other path as a missing page
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

// Errors from any route end here
app.use(errorHandler);

const PORT = process.env.PORT || config.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Open Tale is running on port ${PORT}`);
});
