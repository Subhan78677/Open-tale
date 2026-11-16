const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Absolute path configuration for Hostinger
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Import and mount API routes securely
try {
  const adminApi = require('./api/admin');
  const authApi = require('./api/auth');
  const postsApi = require('./api/posts');
  const indexApi = require('./api/index');

  app.use('/api/admin', adminApi);
  app.use('/api/auth', authApi);
  app.use('/api/posts', postsApi);
  app.use('/api', indexApi);
} catch (err) {
  console.error("Error loading API routes:", err);
}

// Fallback route to serve frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});