const multer = require('multer');
const { HttpError } = require('../utils/errors');

// Must be registered after all routes
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    err = new HttpError(400, err.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be 5 MB or smaller'
      : 'The upload could not be processed');
  }

  // Invalid JSON from the browser is a client error (status 400 from express.json)
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server' : err.message,
    ...(err.extra || {}),
  });
}

module.exports = { errorHandler };
