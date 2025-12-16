/**
 * Scheduling Sync Scheduler
 * Manages scheduled sync jobs for scheduling reference data
 */

import cron from 'node-cron';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('scheduling-sync-scheduler');

export class SchedulingSyncScheduler {
  /**
   * @param {import('./scheduling-sync.engine.js').SchedulingSyncEngine} syncEngine
   * @param {Object} options
   */
  constructor(syncEngine, options = {}) {
    this.syncEngine = syncEngine;
    this.options = {
      // Daily full sync at 3 AM (after pricebook sync at 2 AM)
      fullSyncCron: options.fullSyncCron || '0 3 * * *',
      // Incremental sync every 4 hours
      incrementalSyncCron: options.incrementalSyncCron || '0 */4 * * *',
      // Whether scheduling is enabled
      enabled: options.enabled !== false,
    };
    this.jobs = [];
    this.isRunning = false;
    this.lastFullSync = null;
    this.lastIncrementalSync = null;
  }

  /**
   * Start the scheduler
   */
  start() {
    if (!this.options.enabled) {
      logger.info('Scheduling sync scheduler is disabled');
      return;
    }

    logger.info(
      {
        fullSyncCron: this.options.fullSyncCron,
        incrementalSyncCron: this.options.incrementalSyncCron,
      },
      'Starting scheduling sync scheduler'
    );

    // Schedule full sync
    const fullSyncJob = cron.schedule(this.options.fullSyncCron, async () => {
      await this.runFullSync();
    });
    this.jobs.push(fullSyncJob);

    // Schedule incremental sync
    const incrementalJob = cron.schedule(this.options.incrementalSyncCron, async () => {
      await this.runIncrementalSync();
    });
    this.jobs.push(incrementalJob);

    this.isRunning = true;
    logger.info('Scheduling sync scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    logger.info('Stopping scheduling sync scheduler');

    for (const job of this.jobs) {
      job.stop();
    }

    this.jobs = [];
    this.isRunning = false;
    logger.info('Scheduling sync scheduler stopped');
  }

  /**
   * Run a full sync
   * @returns {Promise<Object>}
   */
  async runFullSync() {
    logger.info('Running scheduled full sync');

    try {
      const result = await this.syncEngine.sync({
        entityTypes: ['teams', 'zones', 'technicians', 'jobTypes', 'businessHours', 'arrivalWindows'],
        fullSync: true,
        triggeredBy: 'system',
      });

      this.lastFullSync = new Date();
      logger.info(
        { syncLogId: result.syncLogId, status: result.status, stats: result.stats },
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
    logger.info('Running scheduled incremental sync');

    try {
      // For incremental, we only sync the most frequently changing entities
      const result = await this.syncEngine.sync({
        entityTypes: ['technicians', 'teams', 'zones'],
        fullSync: false,
        triggeredBy: 'system',
      });

      this.lastIncrementalSync = new Date();
      logger.info(
        { syncLogId: result.syncLogId, status: result.status, stats: result.stats },
        'Scheduled incremental sync completed'
      );

      return result;
    } catch (error) {
      logger.error({ error: error.message }, 'Scheduled incremental sync failed');
      throw error;
    }
  }

  /**
   * Trigger a manual sync
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async triggerManualSync(options = {}) {
    logger.info({ options }, 'Triggering manual scheduling sync');

    return this.syncEngine.sync({
      entityTypes: options.entityTypes || ['teams', 'zones', 'technicians', 'jobTypes'],
      fullSync: options.fullSync || false,
      dryRun: options.dryRun || false,
      triggeredBy: 'manual',
    });
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
      lastFullSync: this.lastFullSync,
      lastIncrementalSync: this.lastIncrementalSync,
    };
  }
}

export default SchedulingSyncScheduler;
