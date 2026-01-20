/**
 * GET /ghl/opportunities/install-pipeline
 * Get all opportunities in Install Pipeline
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';
import { GHL_PIPELINES } from '../../../config/ghl-pipelines.js';

const logger = createLogger('ghl-routes:opportunities');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const getInstallPipelineOpportunities = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { stageId } = req.query;

    let query = `
      SELECT
        o.ghl_id,
        o.name,
        o.monetary_value,
        o.status,
        o.stage_name,
        o.st_customer_id,
        o.st_job_id,
        o.ghl_created_at,
        o.local_updated_at,
        c.name as customer_name,
        j.job_number,
        j.job_status as st_job_status
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      LEFT JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      WHERE o.ghl_pipeline_id = $1
    `;
    const params = [GHL_PIPELINES.INSTALL_PIPELINE.id];

    if (stageId) {
      query += ` AND o.ghl_pipeline_stage_id = $2`;
      params.push(stageId);
    }

    query += ` ORDER BY o.local_updated_at DESC`;

    const result = await client.query(query, params);

    res.json({
      success: true,
      pipeline: 'INSTALL PIPELINE',
      pipelineId: GHL_PIPELINES.INSTALL_PIPELINE.id,
      stages: GHL_PIPELINES.INSTALL_PIPELINE.stages,
      count: result.rows.length,
      data: result.rows
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.get('/install-pipeline', getInstallPipelineOpportunities);
};
