const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Import and mount API routes from 'api/' folder
// (Hostinger par single entry point chalane ke liye)
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

// Fallback to index.html for SPA/frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});