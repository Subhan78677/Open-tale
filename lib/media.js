const Busboy = require('busboy');
const crypto = require('crypto');
const { put, del } = require('@vercel/blob');
const { httpError } = require('./http');

// Vercel limits a request body to about 4.5 MB, so images are capped at 4 MB
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

// Reads the request body.
// Forms with files (multipart) return { fields, files }.
// JSON bodies (already parsed by Vercel) return { fields: body, files: {} }.
function readForm(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data')) {
    return Promise.resolve({ fields: req.body || {}, files: {} });
  }

  return new Promise((resolve, reject) => {
    const fields = {};
    const files = {};
    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

    bb.on('field', (name, value) => { fields[name] = value; });

    bb.on('file', (name, stream, info) => {
      if (!info.filename) { stream.resume(); return; } // empty file input
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => reject(httpError(400, 'Image must be 4 MB or smaller')));
      stream.on('end', () => {
        if (stream.truncated || !chunks.length) return;
        files[name] = { buffer: Buffer.concat(chunks), filename: info.filename, mimetype: info.mimeType };
      });
    });

    bb.on('error', (err) => reject(httpError(400, 'Could not read the upload: ' + err.message)));
    bb.on('finish', () => resolve({ fields, files }));
    req.pipe(bb);
  });
}

// Saves an uploaded image in Vercel Blob and returns its public URL
async function uploadImage(file) {
  const ext = EXT[file.mimetype];
  if (!ext) throw httpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed');
  const name = `uploads/${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const blob = await put(name, file.buffer, { access: 'public', contentType: file.mimetype });
  return blob.url;
}

// Deletes an image that was stored in Vercel Blob (ignores local paths)
async function removeImage(url) {
  if (url && url.startsWith('https://')) {
    try { await del(url); } catch (_) { /* already removed */ }
  }
}

module.exports = { readForm, uploadImage, removeImage };
