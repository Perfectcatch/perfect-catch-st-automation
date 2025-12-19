/**
 * Server Entry Point
 * Loads configuration and starts the Express server
 */

import config from './config/index.js';
import app from './app.js';
import { logger } from './lib/logger.js';

// GHL Sync Scheduler - loaded dynamically to prevent startup failures
let startGHLSyncScheduler = null;
let stopGHLSyncScheduler = null;

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  logger.info({
    port: PORT,
    environment: config.nodeEnv,
    version: '2.0.0',
  }, 'ServiceTitan API server started');

  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Perfect Catch ST Automation Server v2.0.0                ║
╠════════════════════════════════════════════════════════════╣
║   Port:        ${PORT}                                         ║
║   Environment: ${config.nodeEnv.padEnd(41)}║
║   API Docs:    http://localhost:${PORT}/                       ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Start GHL Sync Scheduler (every 5 minutes)
  if (process.env.GHL_SYNC_ENABLED !== 'false') {
    (async () => {
      try {
        const ghlSync = await import('./sync/ghl/index.js');
        startGHLSyncScheduler = ghlSync.startGHLSyncScheduler;
        stopGHLSyncScheduler = ghlSync.stopGHLSyncScheduler;
        startGHLSyncScheduler();
        logger.info('GHL Sync Scheduler started (every 5 minutes)');
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to start GHL Sync Scheduler');
      }
    })();
  } else {
    logger.info('GHL Sync Scheduler disabled (GHL_SYNC_ENABLED=false)');
  }
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal');

  // Stop GHL Sync Scheduler
  if (stopGHLSyncScheduler) {
    try {
      stopGHLSyncScheduler();
      logger.info('GHL Sync Scheduler stopped');
    } catch (error) {
      logger.error({ error: error.message }, 'Error stopping GHL Sync Scheduler');
    }
  }

  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
});

export default server;
