/**
 * Sync Scheduler
 * Schedules automatic sync operations using cron
 */

import cron from 'node-cron';
import fs from 'fs';
import { runIncrementalSync, runFullSync } from './sync-orchestrator.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('sync-scheduler');

let incrementalJob = null;
let fullSyncJob = null;
let heartbeatInterval = null;
let isRunning = false;

const HEARTBEAT_FILE = '/tmp/worker-heartbeat';

/**
 * Update heartbeat file for health checks
 */
function updateHeartbeat() {
  try {
    fs.writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  } catch (error) {
    logger.warn('Failed to update heartbeat', { error: error.message });
  }
}

/**
 * Start the sync scheduler
 */
export function startSyncScheduler() {
  if (isRunning) {
    logger.warn('Sync scheduler already running');
    return;
  }

  isRunning = true;
  logger.info('Starting sync scheduler...');

  // Start heartbeat for health checks (every 30 seconds)
  updateHeartbeat();
  heartbeatInterval = setInterval(updateHeartbeat, 30000);

  // Incremental sync every 5 minutes
  const incrementalCron = process.env.SYNC_INCREMENTAL_CRON || '*/5 * * * *';
  incrementalJob = cron.schedule(incrementalCron, async () => {
    try {
      logger.info('Running scheduled incremental sync...');
      await runIncrementalSync();
    } catch (error) {
      logger.error('Scheduled incremental sync failed', { error: error.message });
    }
  });
  logger.info(`Incremental sync scheduled: ${incrementalCron}`);

  // Full sync daily at 2 AM
  const fullSyncCron = process.env.SYNC_FULL_CRON || '0 2 * * *';
  fullSyncJob = cron.schedule(fullSyncCron, async () => {
    try {
      logger.info('Running scheduled full sync...');
      await runFullSync();
    } catch (error) {
      logger.error('Scheduled full sync failed', { error: error.message });
    }
  });
  logger.info(`Full sync scheduled: ${fullSyncCron}`);

  logger.info('Sync scheduler started successfully');
}

/**
 * Stop the sync scheduler
 */
export function stopSyncScheduler() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (incrementalJob) {
    incrementalJob.stop();
    incrementalJob = null;
  }
  if (fullSyncJob) {
    fullSyncJob.stop();
    fullSyncJob = null;
  }
  isRunning = false;
  logger.info('Sync scheduler stopped');
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning() {
  return isRunning;
}

// If run directly, start the scheduler
if (process.argv[1]?.endsWith('sync-scheduler.js')) {
  logger.info('='.repeat(60));
  logger.info('STARTING SYNC SCHEDULER');
  logger.info('='.repeat(60));

  startSyncScheduler();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    stopSyncScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    stopSyncScheduler();
    process.exit(0);
  });
}

export default {
  startSyncScheduler,
  stopSyncScheduler,
  isSchedulerRunning
};
