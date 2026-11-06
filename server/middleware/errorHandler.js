const env = require('../config/env');

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Centralized error handler: never leaks stack traces or internals to clients.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'ValidationError') status = 400;
  if (err.name === 'CastError') { status = 400; message = 'Invalid identifier'; }
  if (err.code === 11000) { status = 409; message = 'Duplicate record'; }
  if (err.name === 'MulterError') { status = 400; }

  if (status >= 500) {
    console.error(err);
    if (env.nodeEnv === 'production') message = 'Internal server error';
  }
  res.status(status).json({ message, ...(err.details ? { details: err.details } : {}) });
}

module.exports = { ApiError, notFound, errorHandler };
