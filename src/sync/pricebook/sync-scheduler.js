/**
 * Sync Scheduler
 * Manages scheduled sync jobs using node-cron
 */

import cron from 'node-cron';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('sync-scheduler');

export class SyncScheduler {
  /**
   * @param {import('./pricebook-sync.engine.js').PricebookSyncEngine} syncEngine
   * @param {Object} options
   */
  constructor(syncEngine, options = {}) {
    this.syncEngine = syncEngine;
    this.options = {
      fullSyncCron: options.fullSyncCron || process.env.SYNC_FULL_CRON || '0 2 * * *', // Daily at 2 AM
      incrementalSyncCron: options.incrementalSyncCron || process.env.SYNC_INCREMENTAL_CRON || '0 */6 * * *', // Every 6 hours
      enabled: options.enabled !== false,
    };
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (!this.options.enabled) {
      logger.info('Sync scheduler is disabled');
      return;
    }

    logger.info(
      {
        fullSyncCron: this.options.fullSyncCron,
        incrementalSyncCron: this.options.incrementalSyncCron,
      },
      'Starting sync scheduler'
    );

    // Schedule full sync
    const fullSyncJob = cron.schedule(this.options.fullSyncCron, async () => {
      await this.runFullSync();
    });
    this.jobs.push(fullSyncJob);

    // Schedule incremental sync
    const incrementalSyncJob = cron.schedule(this.options.incrementalSyncCron, async () => {
      await this.runIncrementalSync();
    });
    this.jobs.push(incrementalSyncJob);

    this.isRunning = true;
    logger.info('Sync scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    logger.info('Stopping sync scheduler');

    for (const job of this.jobs) {
      job.stop();
    }

    this.jobs = [];
    this.isRunning = false;
    logger.info('Sync scheduler stopped');
  }

  /**
   * Run a full sync
   * @returns {Promise<Object>}
   */
  async runFullSync() {
    logger.info('Starting scheduled full sync');

    try {
      const result = await this.syncEngine.sync({
        direction: 'from_st',
        fullSync: true,
        resolveConflicts: 'manual',
        triggeredBy: 'system',
      });

      logger.info(
        {
          syncLogId: result.syncLogId,
          status: result.status,
          duration: result.duration,
          stats: result.stats,
        },
        'Scheduled full sync completed'
      );

      return result;
    } catch (error) {
      logger.error({ error: error.message }, 'Scheduled full sync failed');
      throw error;
    }
  }

  /**
   * Run an incremental sync
   * @returns {Promise<Object>}
   */
  async runIncrementalSync() {
    logger.info('Starting scheduled incremental sync');

    try {
      const result = await this.syncEngine.sync({
        direction: 'from_st',
        fullSync: false,
        resolveConflicts: 'manual',
        triggeredBy: 'system',
      });

      logger.info(
        {
          syncLogId: result.syncLogId,
          status: result.status,
          duration: result.duration,
          stats: result.stats,
        },
        'Scheduled incremental sync completed'
      );

      return result;
    } catch (error) {
      logger.error({ error: error.message }, 'Scheduled incremental sync failed');
      throw error;
    }
  }

  /**
   * Get scheduler status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobCount: this.jobs.length,
      schedules: {
        fullSync: this.options.fullSyncCron,
        incrementalSync: this.options.incrementalSyncCron,
      },
    };
  }

  /**
   * Trigger a manual sync
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async triggerManualSync(options = {}) {
    logger.info({ options }, 'Triggering manual sync');

    return this.syncEngine.sync({
      direction: options.direction || 'from_st',
      fullSync: options.fullSync || false,
      entityTypes: options.entityTypes,
      resolveConflicts: options.resolveConflicts || 'manual',
      dryRun: options.dryRun || false,
      triggeredBy: 'manual',
    });
  }
}

export default SyncScheduler;
