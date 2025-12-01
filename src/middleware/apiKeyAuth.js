/**
 * API Key Authentication Middleware
 * Optional protection for internal endpoints
 */

import config from '../config/index.js';
import { AuthorizationError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('apiKeyAuth');

/**
 * Middleware that validates API key if one is configured
 * If no API_KEY is set in environment, all requests pass through
 */
export function apiKeyAuth(req, res, next) {
  // If no API key is configured, skip authentication
  if (!config.apiKey) {
    return next();
  }

  // Check for API key in headers
  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!providedKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'Missing API key');
    throw new AuthorizationError('API key required');
  }

  if (providedKey !== config.apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'Invalid API key');
    throw new AuthorizationError('Invalid API key');
  }

  next();
}

/**
 * Middleware that always requires API key (for sensitive endpoints)
 */
export function requireApiKey(req, res, next) {
  if (!config.apiKey) {
    logger.error('API_KEY not configured but required for this endpoint');
    throw new AuthorizationError('Server misconfiguration: API key required');
  }

  return apiKeyAuth(req, res, next);
}

export default apiKeyAuth;
