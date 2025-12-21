/**
 * Redis Connection
 * 
 * Provides Redis client for:
 * - Salesforce token storage
 * - Session management
 * - Job queues
 */

import Redis from 'ioredis';
import { logger } from '../lib/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL or use defaults
let redisConfig;
try {
  const url = new URL(redisUrl);
  redisConfig = {
    host: url.hostname || 'localhost',
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    db: parseInt(url.pathname?.slice(1) || '0', 10),
  };
} catch {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
}

// Add retry strategy
redisConfig.maxRetriesPerRequest = 3;
redisConfig.retryStrategy = (times) => {
  if (times > 3) {
    logger.error('Redis connection failed after 3 retries');
    return null;
  }
  return Math.min(times * 200, 2000);
};

// Create Redis client
export const redis = new Redis(redisConfig);

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ error: error.message }, 'Redis error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Check Redis health
 */
export async function checkRedisHealth() {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export default redis;
