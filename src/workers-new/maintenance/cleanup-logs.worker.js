/**
 * Cleanup Logs Worker
 * Removes old logs and run history to prevent database bloat
 *
 * Schedule: Daily at 2am
 */

import { BaseWorker } from '../base.js';
import { getPool } from '../../services/sync/sync-base.js';

class CleanupLogsWorker extends BaseWorker {
  constructor() {
    super('cleanup-logs', {
      schedule: '0 2 * * *', // Daily at 2am
      enabled: true,
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    const client = await getPool().connect();
    const stats = {
      workerLogs: 0,
      workerRuns: 0,
      webhookLogs: 0,
      syncLogs: 0
    };

    try {
      await this.log('info', 'Starting log cleanup');

      // Delete worker logs older than 30 days
      const workerLogsResult = await client.query(`
        DELETE FROM public.worker_logs
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);
      stats.workerLogs = workerLogsResult.rowCount;

      // Delete worker runs older than 30 days
      const workerRunsResult = await client.query(`
        DELETE FROM public.worker_runs
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);
      stats.workerRuns = workerRunsResult.rowCount;

      // Delete webhook logs older than 14 days
      const webhookLogsResult = await client.query(`
        DELETE FROM integrations.ghl_webhook_log
        WHERE received_at < NOW() - INTERVAL '14 days'
      `);
      stats.webhookLogs = webhookLogsResult.rowCount;

      // Delete sync logs older than 30 days
      const syncLogsResult = await client.query(`
        DELETE FROM integrations.ghl_sync_log
        WHERE started_at < NOW() - INTERVAL '30 days'
      `);
      stats.syncLogs = syncLogsResult.rowCount;

      await this.log('info', 'Log cleanup completed', stats);

      return stats;
    } finally {
      client.release();
    }
  }
}

export default new CleanupLogsWorker();
