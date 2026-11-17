// ==========================================================
// Open Tale - single entry point.
// Hostinger runs this file: "node server.js" (or the startup file set in hPanel).
// ==========================================================
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');

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

// Website pages, CSS, JS and images
app.use(express.static(config.PUBLIC_DIR));
// Uploaded images (kept in UPLOAD_DIR so they survive redeploys)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// ==========================================
// Dynamic Sitemap Route for Google Search Console
// ==========================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    res.header('Content-Type', 'application/xml');

    // Static pages
    const links = [
      { url: '/', changefreq: 'daily', priority: 1.0 },
      { url: '/blog.html', changefreq: 'weekly', priority: 0.8 },
      { url: '/login.html', changefreq: 'monthly', priority: 0.3 },
      { url: '/write.html', changefreq: 'monthly', priority: 0.5 }
    ];

    // Fetch posts/blogs from database dynamically
    let posts = [];
    try {
      if (db && typeof db.prepare === 'function') {
        posts = db.prepare('SELECT id, updated_at FROM posts').all();
      }
    } catch (err) {
      console.error('Error fetching posts for sitemap:', err);
    }

    posts.forEach((post) => {
      links.push({
        url: `/post.html?id=${post.id}`,
        changefreq: 'weekly',
        lastmod: post.updated_at || post.createdAt,
        priority: 0.7
      });
    });

    const stream = new SitemapStream({ hostname: 'https://opentale.blog' });
    const data = await streamToPromise(Readable.from(links).pipe(stream));
    res.send(data.toString());
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

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