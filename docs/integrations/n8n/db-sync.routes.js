/**
 * Database Sync Routes
 * Endpoints for managing local job/customer sync with PostgreSQL
 * Replaces Airtable functionality
 */

import { Router } from 'express';
import { db } from '../services/database.js';
import logger from '../lib/logger.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// SYNC STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * GET /db/sync-state/:key
 * Get a specific sync state value
 */
router.get('/sync-state/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    
    const result = await db.query(
      'SELECT * FROM sync_state WHERE key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Sync state key not found',
        key
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, key: req.params.key }, 'Error fetching sync state');
    next(error);
  }
});

/**
 * GET /db/sync-state
 * Get all sync state records
 */
router.get('/sync-state', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM sync_state ORDER BY key');
    res.json(result.rows);
  } catch (error) {
    logger.error({ error }, 'Error fetching all sync states');
    next(error);
  }
});

/**
 * PUT /db/sync-state/:key
 * Update sync state (used by n8n after successful job pull)
 */
router.put('/sync-state/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, metadata = {} } = req.body;
    
    if (!value) {
      return res.status(400).json({
        error: 'Missing required field: value'
      });
    }
    
    await db.query(
      'SELECT update_sync_state($1, $2, $3)',
      [key, value, JSON.stringify(metadata)]
    );
    
    const result = await db.query(
      'SELECT * FROM sync_state WHERE key = $1',
      [key]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, key: req.params.key }, 'Error updating sync state');
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════
// JOB MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * POST /db/jobs/upsert
 * Upsert job with customer data (called from n8n)
 * Expects: { job: {...}, customer: {...} }
 */
router.post('/jobs/upsert', async (req, res, next) => {
  try {
    const { job, customer } = req.body;
    
    if (!job || !customer) {
      return res.status(400).json({
        error: 'Missing required fields: job and customer objects'
      });
    }
    
    const result = await db.query(
      'SELECT upsert_job_from_st($1, $2) as job_id',
      [JSON.stringify(job), JSON.stringify(customer)]
    );
    
    logger.info({
      jobId: job.id,
      customerId: customer.customerId,
      dbJobId: result.rows[0].job_id
    }, 'Job upserted successfully');
    
    res.json({
      success: true,
      jobId: result.rows[0].job_id,
      stJobId: job.id,
      stCustomerId: customer.customerId
    });
  } catch (error) {
    logger.error({ error, job: req.body.job }, 'Error upserting job');
    next(error);
  }
});

/**
 * POST /db/jobs/upsert-batch
 * Batch upsert multiple jobs (for initial sync)
 */
router.post('/jobs/upsert-batch', async (req, res, next) => {
  try {
    const { jobs } = req.body;
    
    if (!Array.isArray(jobs)) {
      return res.status(400).json({
        error: 'jobs must be an array of {job, customer} objects'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const item of jobs) {
      try {
        const result = await db.query(
          'SELECT upsert_job_from_st($1, $2) as job_id',
          [JSON.stringify(item.job), JSON.stringify(item.customer)]
        );
        results.push({
          stJobId: item.job.id,
          dbJobId: result.rows[0].job_id,
          success: true
        });
      } catch (error) {
        errors.push({
          stJobId: item.job.id,
          error: error.message
        });
      }
    }
    
    logger.info({
      total: jobs.length,
      succeeded: results.length,
      failed: errors.length
    }, 'Batch job upsert completed');
    
    res.json({
      total: jobs.length,
      succeeded: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    logger.error({ error }, 'Error in batch job upsert');
    next(error);
  }
});

/**
 * GET /db/jobs/pending-ghl-sync
 * Get jobs that need to be synced to GoHighLevel
 */
router.get('/jobs/pending-ghl-sync', async (req, res, next) => {
  try {
    const { limit = 100, businessUnitId } = req.query;
    
    let query = `
      SELECT * FROM jobs_pending_ghl_sync
      WHERE 1=1
    `;
    const params = [];
    
    if (businessUnitId) {
      params.push(businessUnitId);
      query += ` AND business_unit_id = $${params.length}`;
    }
    
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    
    const result = await db.query(query, params);
    
    res.json({
      count: result.rows.length,
      jobs: result.rows
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching pending GHL sync jobs');
    next(error);
  }
});

/**
 * PATCH /db/jobs/:stJobId/ghl-sync
 * Update GHL sync status for a job
 */
router.patch('/jobs/:stJobId/ghl-sync', async (req, res, next) => {
  try {
    const { stJobId } = req.params;
    const { status, opportunityId, error: syncError } = req.body;
    
    const validStatuses = ['pending', 'synced', 'failed', 'skipped'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const updates = [];
    const params = [stJobId];
    
    if (status) {
      params.push(status);
      updates.push(`ghl_sync_status = $${params.length}`);
    }
    
    if (opportunityId) {
      params.push(opportunityId);
      updates.push(`ghl_opportunity_id = $${params.length}`);
    }
    
    if (syncError !== undefined) {
      params.push(syncError);
      updates.push(`ghl_sync_error = $${params.length}`);
    }
    
    if (status === 'synced' || status === 'failed') {
      updates.push(`ghl_synced_at = NOW()`);
    }
    
    updates.push(`updated_at = NOW()`);
    
    const query = `
      UPDATE jobs 
      SET ${updates.join(', ')}
      WHERE st_job_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Job not found',
        stJobId
      });
    }
    
    logger.info({
      stJobId,
      status,
      opportunityId
    }, 'Job GHL sync status updated');
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, stJobId: req.params.stJobId }, 'Error updating job GHL sync status');
    next(error);
  }
});

/**
 * GET /db/jobs/:stJobId
 * Get a specific job by ST job ID
 */
router.get('/jobs/:stJobId', async (req, res, next) => {
  try {
    const { stJobId } = req.params;
    
    const result = await db.query(
      `SELECT j.*, c.* 
       FROM jobs j
       LEFT JOIN customers c ON j.st_customer_id = c.st_customer_id
       WHERE j.st_job_id = $1`,
      [stJobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Job not found',
        stJobId
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, stJobId: req.params.stJobId }, 'Error fetching job');
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * GET /db/customers/:stCustomerId
 * Get a specific customer by ST customer ID
 */
router.get('/customers/:stCustomerId', async (req, res, next) => {
  try {
    const { stCustomerId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM customers WHERE st_customer_id = $1',
      [stCustomerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        stCustomerId
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, stCustomerId: req.params.stCustomerId }, 'Error fetching customer');
    next(error);
  }
});

/**
 * PATCH /db/customers/:stCustomerId/ghl-sync
 * Update GHL sync status for a customer
 */
router.patch('/customers/:stCustomerId/ghl-sync', async (req, res, next) => {
  try {
    const { stCustomerId } = req.params;
    const { status, contactId, error: syncError } = req.body;
    
    const validStatuses = ['pending', 'synced', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const updates = [];
    const params = [stCustomerId];
    
    if (status) {
      params.push(status);
      updates.push(`ghl_sync_status = $${params.length}`);
    }
    
    if (contactId) {
      params.push(contactId);
      updates.push(`ghl_contact_id = $${params.length}`);
    }
    
    if (syncError !== undefined) {
      params.push(syncError);
      updates.push(`ghl_sync_error = $${params.length}`);
    }
    
    if (status === 'synced' || status === 'failed') {
      updates.push(`ghl_synced_at = NOW()`);
    }
    
    updates.push(`updated_at = NOW()`);
    
    const query = `
      UPDATE customers 
      SET ${updates.join(', ')}
      WHERE st_customer_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        stCustomerId
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, stCustomerId: req.params.stCustomerId }, 'Error updating customer GHL sync status');
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════
// SYNC LOGGING
// ═══════════════════════════════════════════════════════════════

/**
 * POST /db/sync-logs
 * Create a sync log entry
 */
router.post('/sync-logs', async (req, res, next) => {
  try {
    const {
      syncType,
      entityType,
      entityId,
      status,
      recordsProcessed = 0,
      recordsSucceeded = 0,
      recordsFailed = 0,
      errorMessage,
      errorDetails,
      workflowExecutionId,
      metadata = {},
      durationMs
    } = req.body;
    
    const result = await db.query(
      `INSERT INTO sync_logs (
        sync_type, entity_type, entity_id, status,
        records_processed, records_succeeded, records_failed,
        error_message, error_details,
        workflow_execution_id, metadata, duration_ms,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *`,
      [
        syncType,
        entityType,
        entityId,
        status,
        recordsProcessed,
        recordsSucceeded,
        recordsFailed,
        errorMessage,
        errorDetails ? JSON.stringify(errorDetails) : null,
        workflowExecutionId,
        JSON.stringify(metadata),
        durationMs
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ error }, 'Error creating sync log');
    next(error);
  }
});

/**
 * GET /db/sync-logs
 * Get sync logs with filtering
 */
router.get('/sync-logs', async (req, res, next) => {
  try {
    const { 
      syncType, 
      status, 
      limit = 100,
      offset = 0 
    } = req.query;
    
    let query = 'SELECT * FROM sync_logs WHERE 1=1';
    const params = [];
    
    if (syncType) {
      params.push(syncType);
      query += ` AND sync_type = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    query += ' ORDER BY started_at DESC';
    
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    
    const result = await db.query(query, params);
    
    res.json({
      count: result.rows.length,
      logs: result.rows
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching sync logs');
    next(error);
  }
});

/**
 * GET /db/sync-logs/statistics
 * Get sync statistics
 */
router.get('/sync-logs/statistics', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM sync_statistics');
    res.json(result.rows);
  } catch (error) {
    logger.error({ error }, 'Error fetching sync statistics');
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /db/business-units
 * Get all business units with sync configuration
 */
router.get('/business-units', async (req, res, next) => {
  try {
    const { syncEnabled } = req.query;
    
    let query = 'SELECT * FROM business_units WHERE 1=1';
    const params = [];
    
    if (syncEnabled !== undefined) {
      params.push(syncEnabled === 'true');
      query += ` AND sync_enabled = $${params.length}`;
    }
    
    query += ' ORDER BY name';
    
    const result = await db.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ error }, 'Error fetching business units');
    next(error);
  }
});

/**
 * GET /db/business-units/:stBusinessUnitId
 * Get a specific business unit
 */
router.get('/business-units/:stBusinessUnitId', async (req, res, next) => {
  try {
    const { stBusinessUnitId } = req.params;
    
    const result = await db.query(
      'SELECT * FROM business_units WHERE st_business_unit_id = $1',
      [stBusinessUnitId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Business unit not found',
        stBusinessUnitId
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ error, stBusinessUnitId: req.params.stBusinessUnitId }, 'Error fetching business unit');
    next(error);
  }
});

export default router;
