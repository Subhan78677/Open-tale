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

const SITE_URL = 'https://opentale.blog';
const DEFAULT_IMAGE = `${SITE_URL}/assets/favicon.png`;
const postTemplateCache = fs.readFileSync(path.join(config.PUBLIC_DIR, 'post.html'), 'utf8');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function stripMarkdownAndHtml(text = '') {
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAbsoluteUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildPostHeadInjection(post, slug) {
  const canonicalUrl = `${SITE_URL}/${encodeURIComponent(slug)}`;
  const titleText = `${post.title} – Open Tale`;
  const rawDesc = post.excerpt || stripMarkdownAndHtml(post.content);
  const descriptionText = (rawDesc || `Read ${post.title} on Open Tale.`).slice(0, 160);
  const imageUrl = resolveAbsoluteUrl(post.cover_image);
  const authorName = post.author_name || 'Open Tale';
  const publishedIso = post.created_at ? new Date(post.created_at).toISOString() : undefined;
  const modifiedIso = post.updated_at
    ? new Date(post.updated_at).toISOString()
    : publishedIso;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    headline: post.title,
    description: descriptionText,
    image: [imageUrl],
    author: {
      '@type': 'Person',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Open Tale',
      logo: {
        '@type': 'ImageObject',
        url: DEFAULT_IMAGE,
      },
    },
    ...(publishedIso ? { datePublished: publishedIso } : {}),
    ...(modifiedIso ? { dateModified: modifiedIso } : {}),
  };

  return [
    `<title>${escapeHtml(titleText)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta name="description" content="${escapeHtml(descriptionText)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="Open Tale">`,
    `<meta property="og:title" content="${escapeHtml(post.title)}">`,
    `<meta property="og:description" content="${escapeHtml(descriptionText)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(post.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(descriptionText)}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    `<script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>`,
  ].join('\n  ');
}

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

// Clean URLs: /my-post-slug shows a post with SSR SEO + JSON-LD, /blog shows blog.html, etc.
app.get('/:slug', asyncHandler(async (req, res, next) => {
  const slug = req.params.slug;
  if (!/^[a-z0-9-]+$/i.test(slug)) return next();

  const post = await db.get(
    `SELECT p.id, p.slug, p.title, p.excerpt, p.content, p.cover_image, p.created_at, p.updated_at,
            u.name AS author_name
     FROM posts p
     LEFT JOIN users u ON u.id = p.author_id
     WHERE p.slug = ?`,
    [slug]
  );

  if (post) {
    const headInjection = buildPostHeadInjection(post, slug);
    const html = postTemplateCache.replace(/<title>.*?<\/title>/s, headInjection);
    return res.type('html').send(html);
  }

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