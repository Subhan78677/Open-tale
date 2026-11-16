const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { HttpError } = require('../utils/errors');

fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: config.UPLOAD_DIR,
    // The file name is random and the extension comes from the file type, not the file name
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) return cb(null, true);
    cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
  },
});

// Public URL for a saved upload, e.g. /uploads/1700000000-abc.jpg
const uploadUrl = (file) => `/uploads/${file.filename}`;

// Deletes an upload from disk if it was saved by this app
function removeUpload(url) {
  if (url && url.startsWith('/uploads/')) {
    fs.unlink(path.join(config.UPLOAD_DIR, path.basename(url)), () => {});
  }
}

// Deletes a file that was uploaded during a request that then failed
function discardUpload(req) {
  if (req.file) fs.unlink(req.file.path, () => {});
}

module.exports = { imageUpload, uploadUrl, removeUpload, discardUpload };
