/**
 * Base Worker Class
 * Provides common functionality for all workers:
 * - Structured logging
 * - Run history tracking
 * - Error handling
 * - Cron scheduling support
 */

import { createLogger } from '../lib/logger.js';
import { getPool } from '../services/sync/sync-base.js';

export class BaseWorker {
  constructor(name, options = {}) {
    this.name = name;
    this.schedule = options.schedule || null; // cron expression
    this.enabled = options.enabled !== false;
    this.timeout = options.timeout || 300000; // 5 minutes default
    this.lastRun = null;
    this.isRunning = false;
    this.logger = createLogger(`worker:${name}`);
  }

  /**
   * Log a message with structured data
   */
  async log(level, message, meta = {}) {
    this.logger[level]({ ...meta, worker: this.name }, message);

    // Also persist to database for audit trail
    try {
      const client = await getPool().connect();
      try {
        await client.query(`
          INSERT INTO public.worker_logs (
            worker_name, level, message, meta, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [this.name, level, message, JSON.stringify(meta)]);
      } finally {
        client.release();
      }
    } catch (dbError) {
      // Don't fail if logging fails - just console log
      console.error(`Failed to persist log: ${dbError.message}`);
    }
  }

  /**
   * Record a worker run in the database
   */
  async recordRun(status, durationMs, result = null, error = null) {
    try {
      const client = await getPool().connect();
      try {
        await client.query(`
          INSERT INTO public.worker_runs (
            worker_name, status, duration_ms, result, error, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          this.name,
          status,
          durationMs,
          result ? JSON.stringify(result) : null,
          error
        ]);
      } finally {
        client.release();
      }
    } catch (dbError) {
      this.logger.error({ error: dbError.message }, 'Failed to record worker run');
    }
  }

  /**
   * Run the worker with proper error handling and tracking
   */
  async run() {
    if (this.isRunning) {
      await this.log('warn', 'Worker already running, skipping');
      return { status: 'skipped', reason: 'already_running' };
    }

    if (!this.enabled) {
      return { status: 'skipped', reason: 'disabled' };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      await this.log('info', 'Starting worker');

      // Run with timeout
      const result = await Promise.race([
        this.execute(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Worker timeout')), this.timeout)
        )
      ]);

      const duration = Date.now() - startTime;

      await this.log('info', 'Worker completed successfully', {
        duration,
        result
      });

      await this.recordRun('success', duration, result);

      this.lastRun = {
        timestamp: new Date(),
        status: 'success',
        duration,
        result
      };

      return { status: 'success', duration, result };
    } catch (error) {
      const duration = Date.now() - startTime;

      await this.log('error', 'Worker failed', {
        error: error.message,
        stack: error.stack,
        duration
      });

      await this.recordRun('error', duration, null, error.message);

      this.lastRun = {
        timestamp: new Date(),
        status: 'error',
        duration,
        error: error.message
      };

      return { status: 'error', duration, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      schedule: this.schedule,
      isRunning: this.isRunning,
      lastRun: this.lastRun
    };
  }

  /**
   * Override in subclass - the actual worker logic
   */
  async execute() {
    throw new Error('execute() must be implemented by subclass');
  }
}

export default BaseWorker;
