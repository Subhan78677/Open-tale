// ==========================================================
// Open Tale - single entry point.
// Hostinger runs this file: "node server.js" (or the startup file set in hPanel).
// ==========================================================
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');

// Refuse to start in production with the default login secret
if (config.IS_PRODUCTION && config.JWT_SECRET === config.DEFAULT_JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add a long random JWT_SECRET in the Hostinger environment variables.');
  process.exit(1);
}

// Opens the database and creates the tables (must run before routes)
const db = require('./src/db');
require('./src/seed')();

const { mountRoutes } = require('./src/routes');
const { errorHandler } = require('./src/middleware/errors');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger puts the site behind a proxy

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Old post links (post.html?slug=... or post.html?id=...) redirect to the clean URL
app.get('/post.html', (req, res, next) => {
  if (req.query.slug) return res.redirect(301, `/${encodeURIComponent(String(req.query.slug))}`);
  if (req.query.id) {
    const row = db.prepare('SELECT slug FROM posts WHERE id = ?').get(Number(req.query.id));
    if (row) return res.redirect(301, `/${encodeURIComponent(row.slug)}`);
  }
  next();
});

// Website pages, CSS, JS and images
app.use(express.static(config.PUBLIC_DIR));
// Uploaded images (kept in UPLOAD_DIR so they survive redeploys)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// ==========================================
// Safe & Lightweight Dynamic Sitemap Route
// ==========================================
app.get('/sitemap.xml', (req, res) => {
  try {
    res.header('Content-Type', 'application/xml');

    let posts = [];
    try {
      if (db && typeof db.prepare === 'function') {
        posts = db.prepare('SELECT slug, updated_at FROM posts').all();
      }
    } catch (err) {
      console.error('Error fetching posts for sitemap:', err);
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'daily' },
      { url: '/blog.html', priority: '0.8', changefreq: 'weekly' },
      { url: '/login.html', priority: '0.3', changefreq: 'monthly' },
      { url: '/write.html', priority: '0.5', changefreq: 'monthly' }
    ];

    staticPages.forEach((p) => {
      xml += `  <url>\n    <loc>https://opentale.blog${p.url}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
    });

    // Dynamic blog posts from database
    posts.forEach((post) => {
      xml += `  <url>\n    <loc>https://opentale.blog/${encodeURIComponent(post.slug)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    });

    xml += `</urlset>`;
    res.send(xml);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

// API routes
mountRoutes(app);

// Clean URLs: /my-post-slug shows a post, /blog shows blog.html, etc.
// Runs after the API routes, so it never catches /api/... addresses.
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/i.test(slug)) return next();

  const post = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  if (post) return res.sendFile(path.join(config.PUBLIC_DIR, 'post.html'));

  const page = path.join(config.PUBLIC_DIR, `${slug}.html`);
  if (fs.existsSync(page)) return res.sendFile(page);
  next();
});

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