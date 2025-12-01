/**
 * Token Manager Service
 * Handles OAuth token acquisition, caching, and automatic refresh
 */

import fetch from 'node-fetch';
import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { TokenError } from '../lib/errors.js';

const logger = createLogger('tokenManager');

// Token cache
let cachedToken = null;
let tokenExpiresAt = null;

/**
 * Get the current access token, fetching a new one if needed
 * @returns {Promise<string>} Valid access token
 */
export async function getAccessToken() {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiresAt) {
    const now = Date.now();
    const bufferMs = config.tokenRefreshBufferSeconds * 1000;

    // Return cached token if it's still valid (with buffer time)
    if (tokenExpiresAt - now > bufferMs) {
      logger.debug('Using cached access token');
      return cachedToken;
    }

    logger.debug('Token expiring soon, refreshing...');
  }

  // Fetch new token
  return refreshToken();
}

/**
 * Force refresh the access token
 * @returns {Promise<string>} New access token
 */
export async function refreshToken() {
  const { tenantId, clientId, clientSecret, authUrl } = config.serviceTitan;

  logger.info('Fetching new ServiceTitan access token');

  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);

  try {
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-tenant-id': tenantId,
      },
      body,
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      logger.error({ status: response.status, data }, 'Failed to obtain access token');
      throw new TokenError(data.error_description || 'Failed to retrieve ServiceTitan access token');
    }

    // Cache the token
    cachedToken = data.access_token;

    // Calculate expiration time (expires_in is in seconds)
    const expiresInMs = (data.expires_in || 3600) * 1000;
    tokenExpiresAt = Date.now() + expiresInMs;

    logger.info({ expiresIn: data.expires_in }, 'Access token obtained successfully');

    return cachedToken;
  } catch (error) {
    if (error instanceof TokenError) {
      throw error;
    }
    logger.error({ error: error.message }, 'Token fetch failed');
    throw new TokenError(`Token fetch failed: ${error.message}`);
  }
}

/**
 * Check if we have a valid token
 * @returns {boolean}
 */
export function hasValidToken() {
  if (!cachedToken || !tokenExpiresAt) {
    return false;
  }

  const now = Date.now();
  const bufferMs = config.tokenRefreshBufferSeconds * 1000;

  return tokenExpiresAt - now > bufferMs;
}

/**
 * Get token status for health checks
 * @returns {object} Token status information
 */
export function getTokenStatus() {
  if (!cachedToken || !tokenExpiresAt) {
    return {
      valid: false,
      cached: false,
      expiresAt: null,
      expiresIn: null,
    };
  }

  const now = Date.now();
  const expiresIn = Math.max(0, Math.floor((tokenExpiresAt - now) / 1000));
  const bufferMs = config.tokenRefreshBufferSeconds * 1000;

  return {
    valid: tokenExpiresAt - now > bufferMs,
    cached: true,
    expiresAt: new Date(tokenExpiresAt).toISOString(),
    expiresIn,
  };
}

/**
 * Clear the cached token (useful for testing or forced refresh)
 */
export function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = null;
  logger.debug('Token cache cleared');
}

export default {
  getAccessToken,
  refreshToken,
  hasValidToken,
  getTokenStatus,
  clearTokenCache,
};
