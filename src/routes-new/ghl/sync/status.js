/**
 * GET /ghl/sync/status
 * Get GHL sync status and recent logs
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-routes:sync-status');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const getSyncStatus = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { limit } = req.query;

    // Get recent sync logs
    const logsResult = await client.query(`
      SELECT
        id,
        sync_type,
        direction,
        status,
        records_created,
        records_updated,
        records_failed,
        duration_ms,
        started_at,
        completed_at,
        error_message
      FROM ${SCHEMA.ghl}.ghl_sync_log
      ORDER BY started_at DESC
      LIMIT $1
    `, [parseInt(limit) || 10]);

    // Get opportunity counts by pipeline/stage
    const opportunityStats = await client.query(`
      SELECT
        pipeline_id,
        pipeline_stage_id,
        COUNT(*) as count,
        SUM(monetary_value) as total_value
      FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE status = 'open'
      GROUP BY pipeline_id, pipeline_stage_id
      ORDER BY pipeline_id, pipeline_stage_id
    `);

    // Get contact count
    const contactCount = await client.query(`
      SELECT COUNT(*) as count FROM ${SCHEMA.ghl}.ghl_contacts
    `);

    res.json({
      success: true,
      syncEnabled: process.env.GHL_SYNC_ENABLED === 'true',
      autoSyncSettings: {
        estimates: process.env.GHL_AUTO_SYNC_ESTIMATES === 'true',
        jobs: process.env.GHL_AUTO_SYNC_JOBS === 'true',
        customers: process.env.GHL_AUTO_SYNC_CUSTOMERS === 'true'
      },
      stats: {
        contacts: parseInt(contactCount.rows[0]?.count || 0),
        opportunitiesByStage: opportunityStats.rows
      },
      recentSyncs: logsResult.rows
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.get('/status', getSyncStatus);
};
