// ===== Open Tale shared helpers =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Calls the server. Sends JSON, or FormData for file uploads.
// On error it throws an Error with the server message and any extra fields
// (for example needsVerification or nextAt).
async function api(url, options = {}) {
  const opts = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
  if (options.body instanceof FormData) {
    opts.body = options.body;
  } else if (options.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong');
    Object.assign(err, data);
    err.status = res.status;
    throw err;
  }
  return data;
}

function escapeHTML(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Works with both "2026-10-13 10:00:00" (server) and ISO dates
function formatDate(d) {
  const iso = d.includes('T') ? d : d.replace(' ', 'T') + 'Z';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Real image if one exists, otherwise a labeled placeholder box
function coverHTML(src, label = 'Image · 1200 × 675') {
  return src
    ? `<img src="${escapeHTML(src)}" alt="">`
    : `<div class="img-slot"><span>${escapeHTML(label)}</span></div>`;
}

function avatarHTML(name = '?', src = '', size = 36) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
  if (src) return `<img class="avatar" src="${escapeHTML(src)}" alt="${escapeHTML(name)}" style="${style}">`;
  const initials = name.split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  return `<span class="avatar" style="${style}">${escapeHTML(initials)}</span>`;
}

function emptyState(msg) {
  return `<p class="empty">${escapeHTML(msg)}</p>`;
}

function postCardHTML(p) {
  const url = `post.html?slug=${encodeURIComponent(p.slug)}`;
  return `
    <article class="post-card">
      <a href="${url}" class="post-card-media">${coverHTML(p.cover_image, 'Card image · 1200 × 675')}</a>
      <div class="post-card-body">
        <span class="tag">${escapeHTML(p.category)}</span>
        <h3><a href="${url}">${escapeHTML(p.title)}</a></h3>
        <p>${escapeHTML(p.excerpt)}</p>
        <div class="meta">
          ${avatarHTML(p.author_name, p.author_avatar, 26)}
          <span>${escapeHTML(p.author_name)}</span><span>·</span>
          <span>${formatDate(p.created_at)}</span><span>·</span>
          <span>${p.read_time} min read</span>
        </div>
      </div>
    </article>`;
}

// ----- Plain text formatting for older posts -----
// Blank line = paragraph, ## = heading, **bold**, *italic*, ![caption](path) = image
function inline(s) {
  return escapeHTML(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function renderContent(text = '') {
  return text
    .split(/\n\s*\n/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      if (b.startsWith('### ')) return `<h3>${inline(b.slice(4))}</h3>`;
      if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
      const img = b.match(/^!\[(.*?)\]\((.*?)\)$/);
      if (img && !/^(javascript|data):/i.test(img[2])) {
        return `<figure><img src="${escapeHTML(img[2])}" alt="${escapeHTML(img[1])}">
                <figcaption>${escapeHTML(img[1])}</figcaption></figure>`;
      }
      return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
    })
    .join('');
}

// Removes anything dangerous from HTML written in the editor
function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^(javascript|vbscript):/.test(value))) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.innerHTML;
}

// Rich text (HTML from the editor) or older plain-text posts
function bodyHTML(content = '') {
  return /<[a-z][\s\S]*>/i.test(content) ? sanitizeHTML(content) : renderContent(content);
}

// ----- Header and footer (same on every page) -----
async function initLayout(active = '') {
  let user = null;
  try { user = (await api('/api/auth/me')).user; } catch (_) { /* not logged in */ }

  const host = document.getElementById('header');
  if (host) {
    host.innerHTML = `
      <header class="site-header">
        <div class="container nav-inner">
          <a href="index.html" class="brand"><img src="assets/logo.png" alt="Open Tale"></a>
          <nav class="nav-links">
            <a href="index.html" class="${active === 'home' ? 'active' : ''}">Home</a>
            <a href="blog.html" class="${active === 'blog' ? 'active' : ''}">Blog</a>
            <a href="blog.html#categories">Categories</a>
            ${user ? `<a href="profile.html" class="${active === 'profile' ? 'active' : ''}">My Profile</a>` : ''}
            ${user && user.role === 'admin' ? `<a href="admin.html" class="${active === 'admin' ? 'active' : ''}">Admin</a>` : ''}
          </nav>
          <div class="nav-actions">
            <form class="nav-search" action="blog.html" method="get">
              <input name="q" placeholder="Search" aria-label="Search">
              <button aria-label="Search">⌕</button>
            </form>
            ${user
              ? `<a class="btn btn-primary" href="write.html">Write a Post</a>
                 <a class="nav-user" href="profile.html" title="My profile">${avatarHTML(user.name, '', 34)}</a>
                 <button class="btn btn-ghost" id="logout-btn">Logout</button>`
              : `<a class="btn btn-ghost" href="login.html">Login</a>
                 <a class="btn btn-primary" href="login.html?next=write.html">Write a Post</a>`}
          </div>
          <button class="menu-toggle" aria-label="Open menu">☰</button>
        </div>
      </header>`;

    const header = $('.site-header', host);
    $('.menu-toggle', host).onclick = () => header.classList.toggle('open');
    $('#logout-btn', host)?.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      location.href = 'index.html';
    });
  }

  document.body.insertAdjacentHTML(
    'beforeend',
    `<footer class="site-footer"><div class="container">© ${new Date().getFullYear()} Open Tale · Share your stories with the world</div></footer>`
  );
  return user;
}
