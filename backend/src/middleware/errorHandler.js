import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/response.js';

// Centralized error handler. Marks unexpected failures as 500 with a
// generic message while logging the real detail server-side.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body',
      code: 'BAD_JSON',
    });
  }

  const status = err.status || 500;
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    message: err.message,
    stack: err.stack,
  });

  return res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL',
  });
}

// 404 handler for unknown routes.
export function notFoundHandler(req, res) {
  return res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
}