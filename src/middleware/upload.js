const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const config = require('../config');
const { HttpError } = require('../utils/errors');

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

let cloudinaryConfigured = false;

function ensureCloudinary() {
  if (cloudinaryConfigured) return;

  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
    cloudinaryConfigured = true;
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(500, 'Cloudinary environment variables are missing');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  cloudinaryConfigured = true;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (MIME_EXT[file.mimetype]) return cb(null, true);
    cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'));
  },
});

// Uploads a Multer memory file to Cloudinary and returns its permanent secure URL
async function uploadUrl(file) {
  if (!file || !file.buffer) {
    throw new HttpError(400, 'No image file provided');
  }

  ensureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'opentale/posts',
        resource_type: 'image',
      },
      (err, result) => {
        if (err || !result || !result.secure_url) {
          return reject(err || new HttpError(500, 'Failed to upload image to Cloudinary'));
        }
        resolve(result.secure_url);
      }
    );

    stream.end(file.buffer);
  });
}

// Deletes a Cloudinary image if public_id can be extracted; safely ignores legacy /uploads/ paths
function removeUpload(url) {
  if (!url || typeof url !== 'string') return;
  if (!url.includes('res.cloudinary.com')) return;

  try {
    ensureCloudinary();
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+(?:\?.*)?$/);
    if (match && match[1]) {
      cloudinary.uploader.destroy(match[1], () => {});
    }
  } catch (_) {
    // Ignore cleanup failures
  }
}

// Nothing on disk to clean up when using memoryStorage
function discardUpload() {}

module.exports = { imageUpload, uploadUrl, removeUpload, discardUpload };