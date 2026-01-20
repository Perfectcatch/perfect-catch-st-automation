/**
 * GET /health/metrics
 * Prometheus-style metrics endpoint
 */

import { asyncHandler } from '../../middleware/asyncHandler.js';
import { getPool } from '../../services/sync/sync-base.js';

export const healthMetrics = asyncHandler(async (req, res) => {
  const metrics = [];

  // Process metrics
  const mem = process.memoryUsage();
  metrics.push(`# HELP process_heap_bytes Process heap size in bytes`);
  metrics.push(`# TYPE process_heap_bytes gauge`);
  metrics.push(`process_heap_bytes ${mem.heapUsed}`);

  metrics.push(`# HELP process_resident_bytes Process resident memory size in bytes`);
  metrics.push(`# TYPE process_resident_bytes gauge`);
  metrics.push(`process_resident_bytes ${mem.rss}`);

  metrics.push(`# HELP process_uptime_seconds Process uptime in seconds`);
  metrics.push(`# TYPE process_uptime_seconds gauge`);
  metrics.push(`process_uptime_seconds ${Math.round(process.uptime())}`);

  // Database pool metrics
  try {
    const pool = getPool();
    metrics.push(`# HELP db_pool_total Total connections in pool`);
    metrics.push(`# TYPE db_pool_total gauge`);
    metrics.push(`db_pool_total ${pool.totalCount}`);

    metrics.push(`# HELP db_pool_idle Idle connections in pool`);
    metrics.push(`# TYPE db_pool_idle gauge`);
    metrics.push(`db_pool_idle ${pool.idleCount}`);

    metrics.push(`# HELP db_pool_waiting Requests waiting for connection`);
    metrics.push(`# TYPE db_pool_waiting gauge`);
    metrics.push(`db_pool_waiting ${pool.waitingCount}`);

    // Sync metrics from database
    const client = await pool.connect();
    try {
      // GHL contacts count
      const contactsResult = await client.query(
        `SELECT COUNT(*) as count FROM integrations.ghl_contacts`
      );
      metrics.push(`# HELP ghl_contacts_total Total GHL contacts synced`);
      metrics.push(`# TYPE ghl_contacts_total gauge`);
      metrics.push(`ghl_contacts_total ${contactsResult.rows[0].count}`);

      // GHL opportunities count
      const oppsResult = await client.query(
        `SELECT COUNT(*) as count FROM integrations.ghl_opportunities`
      );
      metrics.push(`# HELP ghl_opportunities_total Total GHL opportunities synced`);
      metrics.push(`# TYPE ghl_opportunities_total gauge`);
      metrics.push(`ghl_opportunities_total ${oppsResult.rows[0].count}`);

      // ST customers count
      const customersResult = await client.query(
        `SELECT COUNT(*) as count FROM servicetitan.st_customers`
      );
      metrics.push(`# HELP st_customers_total Total ST customers synced`);
      metrics.push(`# TYPE st_customers_total gauge`);
      metrics.push(`st_customers_total ${customersResult.rows[0].count}`);

      // ST jobs count
      const jobsResult = await client.query(
        `SELECT COUNT(*) as count FROM servicetitan.st_jobs`
      );
      metrics.push(`# HELP st_jobs_total Total ST jobs synced`);
      metrics.push(`# TYPE st_jobs_total gauge`);
      metrics.push(`st_jobs_total ${jobsResult.rows[0].count}`);
    } finally {
      client.release();
    }
  } catch (error) {
    metrics.push(`# Error getting metrics: ${error.message}`);
  }

  res.set('Content-Type', 'text/plain');
  res.send(metrics.join('\n'));
});

export default (router) => {
  router.get('/metrics', healthMetrics);
};
