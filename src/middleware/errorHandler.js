/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent error responses
 */

import { createLogger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const logger = createLogger('errorHandler');

/**
 * Main error handler - should be registered last
 */
export function errorHandler(err, req, res, next) {
  // If headers already sent, delegate to default handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle our custom errors
  if (err instanceof AppError) {
    logger.warn({
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    }, 'Operational error');

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle validation errors from express.json()
  if (err.type === 'entity.parse.failed') {
    logger.warn({ message: err.message }, 'JSON parse error');
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
  }

  // Handle unexpected errors
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unexpected error');

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An unexpected error occurred' : err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}

export default errorHandler;
