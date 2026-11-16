const authRoutes = require('./auth');
const postRoutes = require('./posts');
const adminRoutes = require('./admin');
const siteRoutes = require('./site');

// Mounts every API router. The URLs match what the frontend already calls.
//   /api/auth/*    accounts and login
//   /api/posts/*   posts, quota, related posts
//   /api/admin/*   admin dashboard
//   /api/*         profile, upload, categories, tags
function mountRoutes(app) {
  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', siteRoutes);

  // Any other /api address
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
}

module.exports = { mountRoutes };
