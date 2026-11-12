const { ensureReady } = require('./init');

// Creates an error that carries an HTTP status code
function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}

function sendJSON(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Wraps a handler: checks the HTTP method, prepares the database once per
// instance, and turns thrown errors into JSON responses.
function route(methods, handler) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw httpError(405, 'Method not allowed');
      await ensureReady();
      await handler(req, res);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJSON(res, status, {
        error: status === 500 ? 'Something went wrong on the server' : err.message,
        ...(err.extra || {}),
      });
    }
  };
}

module.exports = { httpError, sendJSON, route };
