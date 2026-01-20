/**
 * GET /health/ready
 * Kubernetes readiness probe endpoint
 * Returns 200 if app is ready to receive traffic
 */

import { asyncHandler } from '../../middleware/asyncHandler.js';
import { getPool } from '../../services/sync/sync-base.js';

export const healthReady = asyncHandler(async (req, res) => {
  const checks = {
    server: true,
    database: false
  };

  try {
    // Check database connection
    const pool = getPool();
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    checks.database = true;
  } catch (error) {
    checks.database = false;
  }

  const allHealthy = Object.values(checks).every(v => v);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString()
  });
});

export default (router) => {
  router.get('/ready', healthReady);
};
