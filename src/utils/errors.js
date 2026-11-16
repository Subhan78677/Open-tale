// An error with an HTTP status code. Throw it anywhere; the error handler sends it as JSON.
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    if (extra) this.extra = extra;
  }
}

// Lets async route handlers pass errors on to the error handler
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, asyncHandler };
