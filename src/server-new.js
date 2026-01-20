/**
 * Server Entry Point - Refactored
 * Uses new worker architecture and modular routes
 */

import config from './config/index.js';
import app from './app.js';
import { logger } from './lib/logger.js';
import workers from './workers-new/index.js';

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  logger.info({
    port: PORT,
    environment: config.nodeEnv,
    version: '3.0.0',
  }, 'ServiceTitan API server started');

  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Perfect Catch ST Automation Server v3.0.0 (Refactored)   ║
╠════════════════════════════════════════════════════════════╣
║   Port:        ${PORT}                                         ║
║   Environment: ${config.nodeEnv.padEnd(41)}║
║   API Docs:    http://localhost:${PORT}/                       ║
║   Workers:     http://localhost:${PORT}/workers/status         ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Start workers if enabled
  if (process.env.WORKERS_ENABLED !== 'false') {
    workers.startWorkers();
    logger.info('Worker scheduler started');
  } else {
    logger.info('Workers disabled (WORKERS_ENABLED=false)');
  }
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal');

  // Stop workers
  if (process.env.WORKERS_ENABLED !== 'false') {
    workers.stopWorkers();
    logger.info('Workers stopped');
  }

  // Close HTTP server
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
