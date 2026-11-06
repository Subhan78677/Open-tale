const bcrypt = require('bcryptjs');

// Runs on every start, but only creates things that are missing.
module.exports = function seed(db) {
  // ----- Admin account -----
  // Set ADMIN_EMAIL and ADMIN_PASSWORD before the first start to use your own login.
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@opentale.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (!db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)) {
    db.prepare(`INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?, ?, ?, 'admin', 1)`)
      .run('Open Tale Admin', adminEmail, bcrypt.hashSync(adminPassword, 10));
    console.log(`Admin account created: ${adminEmail}`);
  }

  // ----- Demo content (only when the site has no posts yet) -----
  if (db.prepare('SELECT COUNT(*) AS n FROM posts').get().n > 0) return;

  const authorId = db
    .prepare(`INSERT INTO users (name, email, password_hash, bio, email_verified) VALUES (?, ?, ?, ?, 1)`)
    .run(
      'Sarah Khan',
      'sarah@opentale.com',
      bcrypt.hashSync('password123', 10),
      'Travel blogger and photographer exploring the world one story at a time.'
    ).lastInsertRowid;

  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const demo = [
    {
      title: '10 Breathtaking Places You Must Visit in 2026',
      category: 'Travel', tags: 'travel,nature,adventure', views: 120, cover: 'assets/post-travel.jpg',
      excerpt: 'From mountain lakes to hidden European villages, these destinations deserve a spot on your list.',
      paragraphs: [
        'The world is full of incredible places, but some destinations stand out for their natural beauty, rich culture, and unforgettable experiences.',
        '## 1. Banff National Park, Canada',
        'Turquoise lakes framed by jagged peaks make Banff one of the most photographed places on earth. Visit in summer for hiking and in winter for skiing.',
        '## 2. Cinque Terre, Italy',
        'Five colorful villages cling to the Ligurian coast. Walk the coastal trail between them for views you will never forget.',
      ],
    },
    {
      title: 'The Best Tools for Productivity in 2026',
      category: 'Technology', tags: 'productivity,tools,tech', views: 80, cover: 'assets/post-tech.jpg',
      excerpt: 'A short list of apps and habits that help you focus, plan, and get more done with less stress.',
      paragraphs: [
        'Good tools do not replace good habits, but the right setup can make focused work much easier.',
        '## Choose one system and stick with it',
        'Switching between task apps every month costs more time than it saves. Pick a simple system, learn it well, and review it weekly.',
      ],
    },
    {
      title: 'Simple Habits for a Healthier, Happier You',
      category: 'Health & Wellness', tags: 'health,habits,wellness', views: 60, cover: 'assets/post-health.jpg',
      excerpt: 'Small changes can make a big difference. Discover simple habits to improve your health and well-being.',
      paragraphs: [
        'You do not need a complete life overhaul to feel better. Small, consistent steps add up over time.',
        '## Start with a ten-minute walk',
        'A short walk after meals improves digestion and clears your head. Make it a routine rather than a goal.',
      ],
    },
    {
      title: 'How to Create a Minimalist and Peaceful Home',
      category: 'Lifestyle', tags: 'home,minimalism,lifestyle', views: 30, cover: 'assets/post-lifestyle.jpg',
      excerpt: 'Declutter your space, choose calm colors, and bring in natural light to create a home that feels restful.',
      paragraphs: [
        'A peaceful home starts with removing what you do not use or love.',
        '## Begin with one drawer',
        'Work through one small space at a time. Keep only what is useful or meaningful, and give the rest away.',
      ],
    },
    {
      title: 'Healthy Bowls: A Simple Guide to Colorful Everyday Meals',
      category: 'Food', tags: 'food,healthy,recipes', views: 45, cover: 'assets/post-food.jpg',
      excerpt: 'Build a balanced bowl with grains, greens, colorful vegetables and a creamy dressing.',
      paragraphs: [
        'A good bowl is built from a few simple parts: a base of grains, plenty of colorful vegetables, a protein, and something creamy to tie it together.',
        '## Start with a balanced base',
        'Mix brown rice, quinoa, or farro with fresh greens. Add roasted sweet potato or chickpeas for protein and fiber.',
      ],
    },
    {
      title: 'Work Smarter: How Small Teams Plan Better Together',
      category: 'Business', tags: 'business,teamwork,planning', views: 25, cover: 'assets/post-business.jpg',
      excerpt: 'Short, focused meetings and shared dashboards help teams make decisions faster.',
      paragraphs: [
        'Good teams do not need longer meetings. They need clearer goals, shared numbers, and fewer surprises.',
        '## Review the numbers together',
        'Keep one dashboard that everyone can see. When the whole team reads the same data, discussions move faster and decisions stick.',
      ],
    },
  ];

  const insert = db.prepare(`
    INSERT INTO posts (title, slug, excerpt, content, category, tags, cover_image, read_time, views, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  demo.forEach((d, i) => {
    const content = d.paragraphs.join('\n\n');
    const readTime = Math.max(1, Math.ceil(content.split(/\s+/).length / 200));
    insert.run(
      d.title,
      `${slugify(d.title)}-${i + 1}`,
      d.excerpt,
      content,
      d.category,
      d.tags,
      d.cover,
      readTime,
      d.views,
      authorId,
      `-${i * 2} days`
    );
  });
};
