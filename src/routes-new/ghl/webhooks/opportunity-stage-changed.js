/**
 * POST /ghl/webhooks/opportunity-stage-changed
 * Handle GHL opportunity stage change webhook
 * Maps stage changes to ServiceTitan actions
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';
import { GHL_PIPELINES } from '../../../config/ghl-pipelines.js';

const logger = createLogger('ghl-webhooks:opportunity-stage');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// Map GHL stage IDs to ST actions
const STAGE_ACTION_MAP = {
  // Sales Pipeline stages
  [GHL_PIPELINES.SALES_PIPELINE?.stages?.JOB_SOLD]: 'estimate_approved',
  [GHL_PIPELINES.SALES_PIPELINE?.stages?.ESTIMATE_LOST]: 'estimate_lost',
  // Install Pipeline stages
  [GHL_PIPELINES.INSTALL_PIPELINE?.stages?.JOB_COMPLETED]: 'job_completed',
};

export const handleOpportunityStageChanged = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const {
      opportunity,
      previousStageId,
      newStageId,
      pipelineId
    } = req.body;

    if (!opportunity?.id) {
      return res.status(400).json({
        success: false,
        error: 'Missing opportunity data'
      });
    }

    logger.info('Received opportunity stage change webhook', {
      opportunityId: opportunity.id,
      previousStageId,
      newStageId,
      pipelineId
    });

    // Log webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_webhook_log (
        event_type, ghl_id, payload, received_at
      ) VALUES ($1, $2, $3, NOW())
    `, ['opportunity.stage_changed', opportunity.id, JSON.stringify(req.body)]);

    // Update opportunity in our database
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_opportunities
      SET
        ghl_pipeline_stage_id = $1,
        stage_name = $2,
        status = $3,
        raw_data = $4,
        local_updated_at = NOW()
      WHERE ghl_id = $5
    `, [
      newStageId,
      opportunity.stageName || 'Unknown',
      opportunity.status || 'open',
      JSON.stringify(opportunity),
      opportunity.id
    ]);

    // Check if this stage change triggers a ST action
    const action = STAGE_ACTION_MAP[newStageId];
    let stActionResult = null;

    if (action) {
      // Get ST IDs linked to this opportunity
      const oppResult = await client.query(`
        SELECT st_job_id, st_customer_id, st_estimate_id
        FROM ${SCHEMA.ghl}.ghl_opportunities
        WHERE ghl_id = $1
      `, [opportunity.id]);

      if (oppResult.rows.length > 0) {
        const { st_job_id, st_customer_id, st_estimate_id } = oppResult.rows[0];

        // Log the sync event
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_sync_events (
            direction, entity, action, ghl_id, st_id, payload, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [
          'ghl_to_st',
          'opportunity',
          action,
          opportunity.id,
          st_job_id || st_estimate_id,
          JSON.stringify({ previousStageId, newStageId, action })
        ]);

        stActionResult = {
          action,
          stJobId: st_job_id,
          stCustomerId: st_customer_id,
          stEstimateId: st_estimate_id,
          queued: true
        };

        logger.info('ST action triggered from stage change', stActionResult);
      }
    }

    res.json({
      success: true,
      opportunityId: opportunity.id,
      previousStageId,
      newStageId,
      stAction: stActionResult
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.post('/opportunity-stage-changed', handleOpportunityStageChanged);
};
