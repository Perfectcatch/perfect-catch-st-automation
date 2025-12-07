/**
 * Prisma Client Singleton
 * Ensures a single Prisma client instance across the application
 */

import { PrismaClient } from '@prisma/client';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('prisma');

// Global variable to store the Prisma client instance
let prisma;

/**
 * Get or create the Prisma client instance
 * @returns {PrismaClient}
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query', (e) => {
        logger.debug({ query: e.query, duration: e.duration }, 'Prisma query');
      });
    }

    prisma.$on('error', (e) => {
      logger.error({ error: e.message }, 'Prisma error');
    });

    prisma.$on('warn', (e) => {
      logger.warn({ warning: e.message }, 'Prisma warning');
    });

    logger.info('Prisma client initialized');
  }

  return prisma;
}

/**
 * Disconnect the Prisma client
 */
export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('Prisma client disconnected');
  }
}

/**
 * Check database connection
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseConnection() {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Database connection check failed');
    return false;
  }
}

export default getPrismaClient;
