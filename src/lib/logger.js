/**
 * Logger Module
 * Centralized logging using Pino with pretty printing in development
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'perfect-catch-st-automation',
    version: '2.0.0',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Child logger factory for modules
export function createLogger(module) {
  return logger.child({ module });
}

export default logger;
