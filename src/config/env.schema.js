/**
 * Environment Variable Schema
 * Validates all required environment variables using Zod
 */

import { z } from 'zod';

export const envSchema = z.object({
  // ServiceTitan API credentials
  SERVICE_TITAN_TENANT_ID: z.string().min(1, 'SERVICE_TITAN_TENANT_ID is required'),
  SERVICE_TITAN_CLIENT_ID: z.string().min(1, 'SERVICE_TITAN_CLIENT_ID is required'),
  SERVICE_TITAN_CLIENT_SECRET: z.string().min(1, 'SERVICE_TITAN_CLIENT_SECRET is required'),
  SERVICE_TITAN_APP_KEY: z.string().min(1, 'SERVICE_TITAN_APP_KEY is required'),

  // Server configuration
  PORT: z.string().default('3001').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Optional: API key for protecting internal endpoints
  API_KEY: z.string().optional(),

  // Optional: Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),

  // Optional: Token cache TTL (seconds before expiry to refresh)
  TOKEN_REFRESH_BUFFER_SECONDS: z.string().default('300').transform(Number),

  // Optional: Retry configuration
  MAX_RETRIES: z.string().default('3').transform(Number),
  RETRY_DELAY_MS: z.string().default('1000').transform(Number),
});

export function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Environment validation failed:');
    result.error.issues.forEach((issue) => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }

  return result.data;
}
