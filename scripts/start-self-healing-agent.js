#!/usr/bin/env node

/**
 * Start Self-Healing Agent
 * Monitors system health and automatically fixes issues
 */

import 'dotenv/config';
import { selfHealingAgent } from '../src/services/monitoring/self-healing-agent.js';
import { createLogger } from '../src/lib/logger.js';
import { startHeartbeat, stopHeartbeat } from '../src/workers/base-worker.js';

const logger = createLogger('self-healing-startup');

logger.info('Starting self-healing agent...');
logger.info('Configuration:', {
  checkInterval: process.env.HEALTH_CHECK_INTERVAL_MS || '300000ms (5 minutes)',
  hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
  database: process.env.SERVICETITAN_DATABASE_URL ? 'configured' : 'not configured'
});

// Start heartbeat for Docker health checks
startHeartbeat();

selfHealingAgent.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, stopping agent...');
  stopHeartbeat();
  selfHealingAgent.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, stopping agent...');
  stopHeartbeat();
  selfHealingAgent.stop();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  selfHealingAgent.stop();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

logger.info('Self-healing agent started. Press Ctrl+C to stop.');
