/**
 * Configuration Loader
 * Loads and validates environment variables, exports typed config object
 */

import dotenv from 'dotenv';
import { validateEnv } from './env.schema.js';

// Load .env file
dotenv.config();

// Validate and parse environment
const env = validateEnv();

export const config = {
  // Server
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // ServiceTitan
  serviceTitan: {
    tenantId: env.SERVICE_TITAN_TENANT_ID,
    clientId: env.SERVICE_TITAN_CLIENT_ID,
    clientSecret: env.SERVICE_TITAN_CLIENT_SECRET,
    appKey: env.SERVICE_TITAN_APP_KEY,
    authUrl: 'https://auth.servicetitan.io/connect/token',
    apiBaseUrl: 'https://api.servicetitan.io',
  },

  // Security
  apiKey: env.API_KEY,

  // Rate limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },

  // Token management
  tokenRefreshBufferSeconds: env.TOKEN_REFRESH_BUFFER_SECONDS,

  // Retry configuration
  retry: {
    maxRetries: env.MAX_RETRIES,
    delayMs: env.RETRY_DELAY_MS,
  },
};

export default config;
