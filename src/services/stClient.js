/**
 * ServiceTitan API Client
 * Handles all HTTP communication with ServiceTitan APIs
 * Features: automatic token refresh, retry logic, error normalization
 */

import fetch from 'node-fetch';
import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { getAccessToken } from './tokenManager.js';
import { RateLimitError, ServiceTitanError } from '../lib/errors.js';

const logger = createLogger('stClient');

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build URL with query parameters
 */
function buildUrl(baseUrl, queryParams = {}) {
  const url = new URL(baseUrl);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, String(value));
    }
  });

  return url.toString();
}

/**
 * Make a request to the ServiceTitan API
 *
 * @param {string} url - The full ServiceTitan API URL
 * @param {object} options - Request options
 * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param {object} options.query - Query parameters to append to URL
 * @param {object} options.body - Request body for POST/PUT/PATCH
 * @param {number} options.retryCount - Current retry attempt (internal use)
 * @returns {Promise<{status: number, data: object}>}
 */
export async function stRequest(url, options = {}) {
  const { method = 'GET', query = {}, body = null, retryCount = 0 } = options;

  // Build final URL with query params
  const finalUrl = Object.keys(query).length > 0 ? buildUrl(url, query) : url;

  // Get access token (with caching)
  const token = await getAccessToken();

  const requestOptions = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': config.serviceTitan.appKey,
      'Content-Type': 'application/json',
    },
  };

  // Add body for non-GET requests
  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  logger.debug({ method, url: finalUrl }, 'ServiceTitan API request');

  try {
    const response = await fetch(finalUrl, requestOptions);
    let data;

    // Try to parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // For non-JSON responses (empty bodies, etc.)
      const text = await response.text();
      data = text ? { message: text } : {};
    }

    // Handle retry-able errors
    if (response.status === 429 || response.status >= 500) {
      if (retryCount < config.retry.maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : config.retry.delayMs * (retryCount + 1);

        logger.warn(
          { status: response.status, retryCount: retryCount + 1, delayMs },
          'Retrying ServiceTitan request'
        );

        await sleep(delayMs);
        return stRequest(url, { ...options, retryCount: retryCount + 1 });
      }

      // Max retries exceeded
      logger.error({ status: response.status, retries: retryCount }, 'Max retries exceeded');
      throw response.status === 429
        ? new RateLimitError()
        : new ServiceTitanError('ServiceTitan API unavailable after retries', response.status);
    }

    // Log non-2xx responses
    if (!response.ok) {
      logger.warn({ status: response.status, data }, 'ServiceTitan API error response');
    } else {
      logger.debug({ status: response.status }, 'ServiceTitan API success');
    }

    return {
      status: response.status,
      data,
      ok: response.ok,
    };
  } catch (error) {
    // If it's already our error type, rethrow
    if (error.isOperational) {
      throw error;
    }

    // Network or other errors
    logger.error({ error: error.message, url: finalUrl }, 'ServiceTitan request failed');
    throw new ServiceTitanError(`Request failed: ${error.message}`, 500);
  }
}

export default { stRequest };
