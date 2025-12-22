/**
 * CRM Integration Routes
 * API endpoints for Perfect Catch CRM integration
 * Handles sync operations, webhooks, and CRM data access
 */

import { Router } from 'express';
import pg from 'pg';
import config from '../config/index.js';
import { runCRMSync, startCRMSyncScheduler, stopCRMSyncScheduler } from '../sync/crm/crm-sync.worker.js';
import { CRM_PIPELINES, getStagesArray, getPipelineBySlug } from '../config/crm-pipelines.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('crm-routes');

// Database pool
const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 5,
});

// Schema prefix
const SCHEMA = {
  crm: 'crm',
  st: 'servicetitan',
};

// Webhook secret validation
const CRM_WEBHOOK_SECRET = process.env.CRM_WEBHOOK_SECRET;

function validateWebhookSecret(req, res, next) {
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (CRM_WEBHOOK_SECRET && secret !== CRM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
// SYNC OPERATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /crm/sync/trigger
 * Manually trigger a CRM sync
 */
router.post('/sync/trigger', async (req, res) => {
  try {
    logger.info('Manual CRM sync triggered');
    const result = await runCRMSync();
    res.json({
      success: true,
      message: 'CRM sync completed',
      stats: result,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Manual CRM sync failed');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /crm/sync/status
 * Get sync status and recent activity
 */
router.get('/sync/status', async (req, res) => {
  const client = await pool.connect();
  try {
    // Get sync status summary
    const statusResult = await client.query(`
      SELECT * FROM ${SCHEMA.crm}.v_sync_status
    `);

    // Get recent sync activity
    const activityResult = await client.query(`
      SELECT * FROM ${SCHEMA.crm}.v_recent_activity
      LIMIT 20
    `);

    // Get pending counts
    const pendingResult = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM ${SCHEMA.crm}.crm_contacts WHERE sync_status = 'pending') as pending_contacts,
        (SELECT COUNT(*) FROM ${SCHEMA.crm}.crm_opportunities WHERE sync_status = 'pending') as pending_opportunities,
        (SELECT COUNT(*) FROM ${SCHEMA.crm}.crm_webhook_events WHERE processed = false) as pending_webhooks
    `);

    res.json({
      status: statusResult.rows,
      recentActivity: activityResult.rows,
      pending: pendingResult.rows[0],
      syncEnabled: process.env.CRM_SYNC_ENABLED === 'true',
      syncCron: process.env.CRM_SYNC_CRON || '*/5 * * * *',
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get sync status');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/sync/scheduler/start
 * Start the sync scheduler
 */
router.post('/sync/scheduler/start', (req, res) => {
  try {
    startCRMSyncScheduler();
    res.json({ success: true, message: 'CRM sync scheduler started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /crm/sync/scheduler/stop
 * Stop the sync scheduler
 */
router.post('/sync/scheduler/stop', (req, res) => {
  try {
    stopCRMSyncScheduler();
    res.json({ success: true, message: 'CRM sync scheduler stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * GET /crm/pipelines
 * Get pipeline configuration
 */
router.get('/pipelines', (req, res) => {
  const pipelines = Object.entries(CRM_PIPELINES).map(([key, pipeline]) => ({
    key,
    slug: pipeline.slug,
    name: pipeline.name,
    type: pipeline.type,
    stages: getStagesArray(key),
  }));

  res.json(pipelines);
});

/**
 * GET /crm/pipelines/:slug
 * Get specific pipeline with stages
 */
router.get('/pipelines/:slug', (req, res) => {
  const pipeline = getPipelineBySlug(req.params.slug);
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }

  res.json({
    ...pipeline,
    stages: getStagesArray(pipeline.key),
  });
});

// ═══════════════════════════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /crm/contacts
 * Get CRM contacts with sync status
 */
router.get('/contacts', async (req, res) => {
  const client = await pool.connect();
  try {
    const { syncStatus, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        c.*,
        sc.name as st_customer_name,
        sc.email as st_email,
        sc.phone as st_phone
      FROM ${SCHEMA.crm}.crm_contacts c
      LEFT JOIN ${SCHEMA.st}.st_customers sc ON c.st_customer_id = sc.st_id
    `;

    const params = [];
    if (syncStatus) {
      params.push(syncStatus);
      query += ` WHERE c.sync_status = $1`;
    }

    query += ` ORDER BY c.local_created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /crm/contacts/:stId
 * Get contact by ST customer ID
 */
router.get('/contacts/:stId', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        c.*,
        sc.name as st_customer_name,
        sc.email as st_email,
        sc.phone as st_phone,
        sc.full_data as st_full_data
      FROM ${SCHEMA.crm}.crm_contacts c
      LEFT JOIN ${SCHEMA.st}.st_customers sc ON c.st_customer_id = sc.st_id
      WHERE c.st_customer_id = $1
    `, [req.params.stId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// OPPORTUNITIES
// ═══════════════════════════════════════════════════════════════

/**
 * GET /crm/opportunities
 * Get CRM opportunities with sync status
 */
router.get('/opportunities', async (req, res) => {
  const client = await pool.connect();
  try {
    const { pipeline, stage, status, syncStatus, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT
        o.*,
        sc.name as customer_name,
        j.job_number,
        j.job_status
      FROM ${SCHEMA.crm}.crm_opportunities o
      LEFT JOIN ${SCHEMA.st}.st_customers sc ON o.st_customer_id = sc.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      WHERE 1=1
    `;

    const params = [];
    if (pipeline) {
      params.push(pipeline);
      query += ` AND o.crm_pipeline_slug = $${params.length}`;
    }
    if (stage) {
      params.push(stage);
      query += ` AND o.crm_stage_slug = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND o.status = $${params.length}`;
    }
    if (syncStatus) {
      params.push(syncStatus);
      query += ` AND o.sync_status = $${params.length}`;
    }

    query += ` ORDER BY o.local_created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /crm/opportunities/by-customer/:customerId
 * Get opportunities for a customer
 */
router.get('/opportunities/by-customer/:customerId', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        o.*,
        j.job_number,
        j.job_status,
        e.estimate_number,
        e.status as estimate_status
      FROM ${SCHEMA.crm}.crm_opportunities o
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      LEFT JOIN ${SCHEMA.st}.st_estimates e ON o.st_estimate_id = e.st_id
      WHERE o.st_customer_id = $1
      ORDER BY o.local_created_at DESC
    `, [req.params.customerId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /crm/opportunities/:id/history
 * Get stage history for an opportunity
 */
router.get('/opportunities/:id/history', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT *
      FROM ${SCHEMA.crm}.crm_stage_history
      WHERE crm_opportunity_id = $1 OR crm_id = $1
      ORDER BY changed_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOKS (Receive from CRM)
// ═══════════════════════════════════════════════════════════════

/**
 * POST /crm/webhook/stage-change
 * Receive opportunity stage change from CRM
 */
router.post('/webhook/stage-change', validateWebhookSecret, async (req, res) => {
  const client = await pool.connect();
  try {
    const { opportunityId, fromStage, toStage, pipeline, triggeredBy } = req.body;

    logger.info({ opportunityId, fromStage, toStage }, 'Received stage change webhook');

    // Store webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.crm}.crm_webhook_events (
        event_type, event_source, entity_type, entity_id, payload
      ) VALUES ('opportunity.stage_changed', 'crm', 'opportunity', $1, $2)
    `, [opportunityId, JSON.stringify(req.body)]);

    // Update local tracking
    await client.query(`
      UPDATE ${SCHEMA.crm}.crm_opportunities
      SET crm_stage_slug = $2,
          previous_stage_slug = $3,
          sync_direction = 'from_crm',
          last_synced_at = NOW()
      WHERE crm_id = $1
    `, [opportunityId, toStage, fromStage]);

    res.json({ success: true, message: 'Stage change recorded' });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process stage change webhook');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/webhook/opportunity-won
 * Receive opportunity won notification from CRM - creates ST job
 */
router.post('/webhook/opportunity-won', validateWebhookSecret, async (req, res) => {
  const client = await pool.connect();
  try {
    const { opportunityId, contactId, value, customerId } = req.body;

    logger.info({ opportunityId, value }, 'Received opportunity won webhook');

    // Store webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.crm}.crm_webhook_events (
        event_type, event_source, entity_type, entity_id, payload
      ) VALUES ('opportunity.won', 'crm', 'opportunity', $1, $2)
    `, [opportunityId, JSON.stringify(req.body)]);

    // TODO: Create job in ServiceTitan
    // This would use the stRequest to create a job

    res.json({ success: true, message: 'Opportunity won recorded' });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process opportunity won webhook');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/webhook/pricebook-push
 * Receive pricebook update request from CRM
 */
router.post('/webhook/pricebook-push', validateWebhookSecret, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, type } = req.body; // type: 'services', 'materials', 'equipment'

    logger.info({ type, itemCount: items?.length }, 'Received pricebook push webhook');

    // Store webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.crm}.crm_webhook_events (
        event_type, event_source, entity_type, payload
      ) VALUES ('pricebook.push_requested', 'crm', 'pricebook', $1)
    `, [JSON.stringify(req.body)]);

    // TODO: Push pricebook updates to ServiceTitan
    // This would use the stRequest to update pricebook items

    res.json({ success: true, message: 'Pricebook push queued' });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process pricebook push webhook');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/webhook/contact-update
 * Receive contact update from CRM
 */
router.post('/webhook/contact-update', validateWebhookSecret, async (req, res) => {
  const client = await pool.connect();
  try {
    const { contactId, updates, stCustomerId } = req.body;

    logger.info({ contactId, stCustomerId }, 'Received contact update webhook');

    // Store webhook event
    await client.query(`
      INSERT INTO ${SCHEMA.crm}.crm_webhook_events (
        event_type, event_source, entity_type, entity_id, st_entity_id, payload
      ) VALUES ('contact.updated', 'crm', 'contact', $1, $2, $3)
    `, [contactId, stCustomerId, JSON.stringify(req.body)]);

    // Update local tracking
    if (contactId) {
      await client.query(`
        UPDATE ${SCHEMA.crm}.crm_contacts
        SET sync_direction = 'from_crm',
            last_synced_at = NOW()
        WHERE crm_id = $1
      `, [contactId]);
    }

    res.json({ success: true, message: 'Contact update recorded' });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process contact update webhook');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// WEBHOOK EVENTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /crm/webhook-events
 * Get webhook events
 */
router.get('/webhook-events', async (req, res) => {
  const client = await pool.connect();
  try {
    const { processed, limit = 50 } = req.query;

    let query = `
      SELECT *
      FROM ${SCHEMA.crm}.crm_webhook_events
    `;

    const params = [];
    if (processed !== undefined) {
      params.push(processed === 'true');
      query += ` WHERE processed = $1`;
    }

    query += ` ORDER BY received_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await client.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/webhook-events/:id/process
 * Manually process a webhook event
 */
router.post('/webhook-events/:id/process', async (req, res) => {
  const client = await pool.connect();
  try {
    // Mark as processed
    await client.query(`
      UPDATE ${SCHEMA.crm}.crm_webhook_events
      SET processed = true,
          processed_at = NOW(),
          processing_result = $2
      WHERE id = $1
    `, [req.params.id, JSON.stringify({ manual: true })]);

    res.json({ success: true, message: 'Event marked as processed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE MAPPINGS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /crm/pipeline-mappings
 * Get pipeline mappings
 */
router.get('/pipeline-mappings', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT *
      FROM ${SCHEMA.crm}.crm_pipeline_mapping
      ORDER BY priority DESC, is_default DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /crm/pipeline-mappings
 * Create a pipeline mapping
 */
router.post('/pipeline-mappings', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      stBusinessUnitId,
      stBusinessUnitName,
      stJobTypeId,
      stJobTypeName,
      crmPipelineSlug,
      crmPipelineName,
      crmDefaultStageSlug,
      crmDefaultStageName,
      stageMappings,
      isDefault,
      priority,
      isInstallPipeline,
    } = req.body;

    const result = await client.query(`
      INSERT INTO ${SCHEMA.crm}.crm_pipeline_mapping (
        st_business_unit_id, st_business_unit_name,
        st_job_type_id, st_job_type_name,
        crm_pipeline_slug, crm_pipeline_name,
        crm_default_stage_slug, crm_default_stage_name,
        stage_mappings, is_default, priority, is_install_pipeline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      stBusinessUnitId,
      stBusinessUnitName,
      stJobTypeId,
      stJobTypeName,
      crmPipelineSlug,
      crmPipelineName,
      crmDefaultStageSlug,
      crmDefaultStageName,
      JSON.stringify(stageMappings || {}),
      isDefault || false,
      priority || 0,
      isInstallPipeline || false,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

export default router;
