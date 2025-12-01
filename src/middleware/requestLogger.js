/**
 * Request Logger Middleware
 * Logs incoming requests and response times
 */

import { createLogger } from '../lib/logger.js';

const logger = createLogger('http');

export function requestLogger(req, res, next) {
  const start = Date.now();

  // Log request
  logger.info({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  }, 'Incoming request');

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;

    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
    };

    if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  next();
}

export default requestLogger;
