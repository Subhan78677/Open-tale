// ==========================================================
// Open Tale - single entry point.
// Hostinger starts this file (npm start / node index.js).
// ==========================================================
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const config = require('./src/config');

// Refuse to start in production with the default login secret
if (config.IS_PRODUCTION && config.JWT_SECRET === config.DEFAULT_JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add a long random JWT_SECRET in the Hostinger environment variables.');
  process.exit(1);
}

const db = require('./src/db');
const seed = require('./src/seed');
const { mountRoutes } = require('./src/routes');
const { errorHandler } = require('./src/middleware/errors');
const { asyncHandler } = require('./src/utils/errors');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger puts the site behind a proxy

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Old post links (post.html?slug=... or post.html?id=...) redirect to the clean URL
app.get('/post.html', asyncHandler(async (req, res, next) => {
  if (req.query.slug) return res.redirect(301, `/${encodeURIComponent(String(req.query.slug))}`);
  if (req.query.id) {
    const row = await db.get('SELECT slug FROM posts WHERE id = ?', [Number(req.query.id)]);
    if (row) return res.redirect(301, `/${encodeURIComponent(row.slug)}`);
  }
  next();
}));

// Website pages, CSS, JS and images
app.use(express.static(config.PUBLIC_DIR));
// Uploaded images
app.use('/uploads', express.static(config.UPLOAD_DIR));

// Sitemap with clean post URLs
app.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const posts = await db.all('SELECT slug, updated_at FROM posts');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

 const staticPages = [
  { url: '', priority: '1.0', changefreq: 'daily' },
  { url: '/blog.html', priority: '0.8', changefreq: 'weekly' },
];

  staticPages.forEach((p) => {
    xml += `  <url>\n    <loc>https://opentale.blog${p.url}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  });

  posts.forEach((post) => {
    xml += `  <url>\n    <loc>https://opentale.blog/${encodeURIComponent(post.slug)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
}));

// API routes
mountRoutes(app);

// Clean URLs: /my-post-slug shows a post, /blog shows blog.html, etc.
// Runs after the API routes, so it never catches /api/... addresses.
app.get('/:slug', asyncHandler(async (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/i.test(slug)) return next();

  const post = await db.get('SELECT id FROM posts WHERE slug = ?', [slug]);
  if (post) return res.sendFile(path.join(config.PUBLIC_DIR, 'post.html'));

  const page = path.join(config.PUBLIC_DIR, `${slug}.html`);
  if (fs.existsSync(page)) return res.sendFile(page);
  next();
}));

// Any other path shows the home page as a missing page
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

// Errors from any route end here
app.use(errorHandler);

let dbReadyPromise = null;

function ensureDbReady() {
  if (!dbReadyPromise) {
    dbReadyPromise = (async () => {
      await db.init();
      await seed();
    })().catch((err) => {
      dbReadyPromise = null;
      throw err;
    });
  }
  return dbReadyPromise;
}

// Wait until DB tables and seed data are ready before handling requests
app.use(async (req, res, next) => {
  try {
    await ensureDbReady();
    next();
  } catch (err) {
    next(err);
  }
});

const PORT = process.env.PORT || config.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Open Tale is running on port ${PORT}`);
});

ensureDbReady().catch((err) => {
  console.error('Could not initialize Open Tale database:', err.message);
  server.close(() => process.exit(1));
});
