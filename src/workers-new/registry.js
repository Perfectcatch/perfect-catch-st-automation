/**
 * Worker Registry
 * Central registry for all workers with scheduling support
 */

import cron from 'node-cron';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('worker-registry');

class WorkerRegistry {
  constructor() {
    this.workers = new Map();
    this.scheduledJobs = new Map();
    this.isStarted = false;
  }

  /**
   * Register a worker
   */
  register(worker) {
    if (this.workers.has(worker.name)) {
      logger.warn({ worker: worker.name }, 'Worker already registered, replacing');
    }

    this.workers.set(worker.name, worker);
    logger.info({ worker: worker.name, schedule: worker.schedule }, 'Worker registered');

    return this;
  }

  /**
   * Get a worker by name
   */
  get(name) {
    return this.workers.get(name);
  }

  /**
   * Get all workers
   */
  getAll() {
    return Array.from(this.workers.values());
  }

  /**
   * Get status of all workers
   */
  getStatus() {
    return this.getAll().map(w => w.getStatus());
  }

  /**
   * Run a specific worker manually
   */
  async runWorker(name) {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker not found: ${name}`);
    }
    return worker.run();
  }

  /**
   * Start all scheduled workers
   */
  start() {
    if (this.isStarted) {
      logger.warn('Worker registry already started');
      return;
    }

    logger.info('Starting worker registry...');

    for (const [name, worker] of this.workers) {
      if (!worker.enabled) {
        logger.info({ worker: name }, 'Worker disabled, skipping');
        continue;
      }

      if (!worker.schedule) {
        logger.debug({ worker: name }, 'Worker has no schedule');
        continue;
      }

      // Validate cron expression
      if (!cron.validate(worker.schedule)) {
        logger.error({ worker: name, schedule: worker.schedule }, 'Invalid cron expression');
        continue;
      }

      // Schedule the worker
      const job = cron.schedule(worker.schedule, async () => {
        try {
          await worker.run();
        } catch (error) {
          logger.error({ worker: name, error: error.message }, 'Scheduled worker execution failed');
        }
      }, {
        scheduled: true,
        timezone: 'America/New_York'
      });

      this.scheduledJobs.set(name, job);
      logger.info({ worker: name, schedule: worker.schedule }, 'Worker scheduled');
    }

    this.isStarted = true;
    logger.info({
      total: this.workers.size,
      scheduled: this.scheduledJobs.size
    }, 'Worker registry started');
  }

  /**
   * Stop all scheduled workers
   */
  stop() {
    logger.info('Stopping worker registry...');

    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      logger.debug({ worker: name }, 'Worker unscheduled');
    }

    this.scheduledJobs.clear();
    this.isStarted = false;
    logger.info('Worker registry stopped');
  }

  /**
   * Enable a worker
   */
  enable(name) {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker not found: ${name}`);
    }
    worker.enabled = true;
    logger.info({ worker: name }, 'Worker enabled');
  }

  /**
   * Disable a worker
   */
  disable(name) {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worker not found: ${name}`);
    }
    worker.enabled = false;

    // Stop scheduled job if running
    const job = this.scheduledJobs.get(name);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(name);
    }

    logger.info({ worker: name }, 'Worker disabled');
  }
}

// Singleton instance
export const registry = new WorkerRegistry();

export default registry;
