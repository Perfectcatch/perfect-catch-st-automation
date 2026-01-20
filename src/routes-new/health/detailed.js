/**
 * GET /health/detailed
 * Detailed health check with component status
 */

import { asyncHandler } from '../../middleware/asyncHandler.js';
import { getPool } from '../../services/sync/sync-base.js';

export const healthDetailed = asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    version: process.env.npm_package_version || '3.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    components: {
      server: { status: 'healthy' },
      database: { status: 'unknown' },
      ghlSync: { status: 'unknown', enabled: process.env.GHL_SYNC_ENABLED === 'true' },
      crmSync: { status: 'unknown', enabled: process.env.CRM_SYNC_ENABLED === 'true' }
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Check database
    const pool = getPool();
    const startTime = Date.now();
    const client = await pool.connect();
    const dbResult = await client.query('SELECT NOW() as time, COUNT(*) as connections FROM pg_stat_activity');
    const latency = Date.now() - startTime;
    client.release();

    health.components.database = {
      status: 'healthy',
      latencyMs: latency,
      connections: parseInt(dbResult.rows[0]?.connections || 0),
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };

    // Check GHL sync status
    if (process.env.GHL_SYNC_ENABLED === 'true') {
      const syncClient = await pool.connect();
      try {
        const lastSync = await syncClient.query(`
          SELECT started_at, status, duration_ms
          FROM integrations.ghl_sync_log
          ORDER BY started_at DESC
          LIMIT 1
        `);

        if (lastSync.rows.length > 0) {
          const lastSyncTime = new Date(lastSync.rows[0].started_at);
          const ageMinutes = (Date.now() - lastSyncTime.getTime()) / 60000;

          health.components.ghlSync = {
            status: ageMinutes < 10 ? 'healthy' : 'degraded',
            enabled: true,
            lastSync: lastSync.rows[0].started_at,
            lastSyncStatus: lastSync.rows[0].status,
            lastSyncDurationMs: lastSync.rows[0].duration_ms,
            ageMinutes: Math.round(ageMinutes)
          };
        } else {
          health.components.ghlSync = {
            status: 'no_data',
            enabled: true
          };
        }
      } finally {
        syncClient.release();
      }
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.components.database = {
      status: 'unhealthy',
      error: error.message
    };
  }

  // Overall status
  const isHealthy = Object.values(health.components)
    .every(c => c.status === 'healthy' || c.status === 'no_data' || !c.enabled);

  health.status = isHealthy ? 'healthy' : 'unhealthy';

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

export default (router) => {
  router.get('/detailed', healthDetailed);
};
