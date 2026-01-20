/**
 * POST /ghl/webhooks/opportunity-created
 * Handle GHL opportunity creation webhook
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { getPool } from '../../../services/sync/sync-base.js';

const logger = createLogger('ghl-webhooks:opportunity-created');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

export const handleOpportunityCreated = asyncHandler(async (req, res) => {
  const client = await getPool().connect();

  try {
    const { opportunity, contact, pipelineId, stageId } = req.body;

    if (!opportunity?.id) {
      return res.status(400).json({
        success: false,
        error: 'Missing opportunity data'
      });
    }

    logger.info('Received opportunity created webhook', {
      opportunityId: opportunity.id,
      name: opportunity.name,
      pipelineId,
      stageId
    });

    // Log webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_webhook_log (
        event_type, ghl_id, payload, received_at
      ) VALUES ($1, $2, $3, NOW())
    `, ['opportunity.created', opportunity.id, JSON.stringify(req.body)]);

    // Check if opportunity already exists
    const existingOpp = await client.query(`
      SELECT id FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE ghl_id = $1
    `, [opportunity.id]);

    if (existingOpp.rows.length > 0) {
      logger.info('Opportunity already exists, skipping', { opportunityId: opportunity.id });
      return res.json({
        success: true,
        action: 'skipped',
        reason: 'already_exists',
        opportunityId: opportunity.id
      });
    }

    // Try to find linked contact
    let stCustomerId = null;
    if (contact?.id || opportunity.contactId) {
      const contactResult = await client.query(`
        SELECT st_customer_id FROM ${SCHEMA.ghl}.ghl_contacts
        WHERE ghl_id = $1
      `, [contact?.id || opportunity.contactId]);

      if (contactResult.rows.length > 0) {
        stCustomerId = contactResult.rows[0].st_customer_id;
      }
    }

    // Insert opportunity
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
        ghl_id,
        ghl_contact_id,
        ghl_pipeline_id,
        ghl_pipeline_stage_id,
        name,
        monetary_value,
        status,
        pipeline_name,
        stage_name,
        st_customer_id,
        source,
        raw_data,
        ghl_created_at,
        local_created_at,
        local_updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    `, [
      opportunity.id,
      contact?.id || opportunity.contactId,
      pipelineId || opportunity.pipelineId,
      stageId || opportunity.stageId,
      opportunity.name,
      opportunity.monetaryValue || opportunity.value || 0,
      opportunity.status || 'open',
      opportunity.pipelineName || 'Unknown',
      opportunity.stageName || 'Unknown',
      stCustomerId,
      opportunity.source || 'GHL Webhook',
      JSON.stringify(opportunity),
      opportunity.dateAdded || new Date().toISOString()
    ]);

    logger.info('Opportunity created successfully', {
      opportunityId: opportunity.id,
      stCustomerId
    });

    res.json({
      success: true,
      action: 'created',
      opportunityId: opportunity.id,
      stCustomerId
    });
  } finally {
    client.release();
  }
});

export default (router) => {
  router.post('/opportunity-created', handleOpportunityCreated);
};
