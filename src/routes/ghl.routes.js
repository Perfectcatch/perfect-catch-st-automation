/**
 * GHL (GoHighLevel) Integration Routes
 * API endpoints for GHL pipeline management and sync operations
 */

import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { getPool } from '../services/sync/sync-base.js';
import {
  moveOpportunityToInstallPipeline,
  detectInstallJobsNeedingMove,
  processInstallJobMoves
} from '../integrations/ghl/move-to-install-pipeline.js';
import { GHL_PIPELINES } from '../config/ghl-pipelines.js';

const logger = createLogger('ghl-routes');
const router = Router();

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// ═══════════════════════════════════════════════════════════════
// INSTALL PIPELINE ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /install-pipeline/pending - Get install jobs pending opportunity move
 * Shows install jobs where the customer has an opportunity in Job Sold stage
 */
router.get('/install-pipeline/pending', async (req, res) => {
  try {
    const pendingMoves = await detectInstallJobsNeedingMove();

    res.json({
      success: true,
      count: pendingMoves.length,
      description: 'Install jobs with opportunities still in Sales Pipeline (Job Sold stage)',
      data: pendingMoves
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get pending install moves');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /install-pipeline/process - Process all pending install job moves
 * Moves opportunities from Sales Pipeline to Install Pipeline
 */
router.post('/install-pipeline/process', async (req, res) => {
  try {
    logger.info('Manual trigger: Processing install job moves');

    const result = await processInstallJobMoves();

    res.json({
      success: true,
      message: `Processed ${result.total} install jobs`,
      result
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to process install moves');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /install-pipeline/move/:installJobId - Move specific opportunity to Install Pipeline
 */
router.post('/install-pipeline/move/:installJobId', async (req, res) => {
  try {
    const { installJobId } = req.params;
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'customerId is required in request body'
      });
    }

    logger.info('Manual move to Install Pipeline', { installJobId, customerId });

    const opportunityId = await moveOpportunityToInstallPipeline(
      parseInt(installJobId),
      parseInt(customerId)
    );

    res.json({
      success: true,
      message: opportunityId
        ? 'Opportunity moved to Install Pipeline'
        : 'No opportunity found in Job Sold stage',
      opportunityId
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to move opportunity');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// OPPORTUNITY TRACKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /opportunities/by-customer/:customerId - Get all opportunities for a customer
 * Shows the full journey from Sales to Install pipeline
 */
router.get('/opportunities/by-customer/:customerId', async (req, res) => {
  const client = await getPool().connect();

  try {
    const { customerId } = req.params;

    const result = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.monetary_value,
        o.status,
        o.pipeline_name,
        o.stage_name,
        o.st_job_id,
        o.ghl_created_at,
        o.local_updated_at,
        c.name as customer_name,
        j.job_number,
        j.job_status,
        bu.name as business_unit
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      LEFT JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      LEFT JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE o.st_customer_id = $1
      ORDER BY o.ghl_created_at DESC
    `, [parseInt(customerId)]);

    res.json({
      success: true,
      customerId: parseInt(customerId),
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get opportunities by customer');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /opportunities/install-pipeline - Get all opportunities in Install Pipeline
 */
router.get('/opportunities/install-pipeline', async (req, res) => {
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
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get install pipeline opportunities');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /job-to-estimate/:installJobId - Trace install job back to original estimate
 * Shows the relationship: Install Job → Customer → Sold Estimate → Original Sales Job
 */
router.get('/job-to-estimate/:installJobId', async (req, res) => {
  const client = await getPool().connect();

  try {
    const { installJobId } = req.params;

    // Get the install job and its customer
    const installJobResult = await client.query(`
      SELECT
        j.st_id as install_job_id,
        j.job_number as install_job_number,
        j.summary as install_summary,
        j.job_status as install_status,
        j.st_created_on as install_created,
        j.customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.email as customer_email,
        bu.name as business_unit
      FROM ${SCHEMA.st}.st_jobs j
      JOIN ${SCHEMA.st}.st_customers c ON j.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE j.st_id = $1
    `, [parseInt(installJobId)]);

    if (installJobResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Install job not found'
      });
    }

    const installJob = installJobResult.rows[0];

    // Find sold estimates for this customer (the source of the install job)
    const estimatesResult = await client.query(`
      SELECT
        e.st_id as estimate_id,
        e.estimate_number,
        e.name as estimate_name,
        e.total as estimate_total,
        e.status as estimate_status,
        e.sold_on,
        e.st_created_on as estimate_created,
        sj.st_id as sales_job_id,
        sj.job_number as sales_job_number,
        sj.summary as sales_summary,
        sbu.name as sales_business_unit
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_jobs sj ON e.job_id = sj.st_id
      JOIN ${SCHEMA.st}.st_business_units sbu ON sj.business_unit_id = sbu.st_id
      WHERE e.customer_id = $1
        AND e.status = 'Sold'
      ORDER BY e.sold_on DESC
    `, [installJob.customer_id]);

    // Find GHL opportunities for this customer
    const opportunitiesResult = await client.query(`
      SELECT
        o.ghl_id,
        o.name as opportunity_name,
        o.monetary_value,
        o.status,
        o.pipeline_name,
        o.stage_name,
        o.st_job_id,
        o.ghl_created_at
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      WHERE o.st_customer_id = $1
      ORDER BY o.ghl_created_at DESC
    `, [installJob.customer_id]);

    res.json({
      success: true,
      installJob: {
        id: installJob.install_job_id,
        jobNumber: installJob.install_job_number,
        summary: installJob.install_summary,
        status: installJob.install_status,
        businessUnit: installJob.business_unit,
        createdOn: installJob.install_created
      },
      customer: {
        id: installJob.customer_id,
        name: installJob.customer_name,
        phone: installJob.customer_phone,
        email: installJob.customer_email
      },
      soldEstimates: estimatesResult.rows.map(e => ({
        id: e.estimate_id,
        number: e.estimate_number,
        name: e.estimate_name,
        total: e.estimate_total,
        status: e.estimate_status,
        soldOn: e.sold_on,
        createdOn: e.estimate_created,
        salesJob: {
          id: e.sales_job_id,
          number: e.sales_job_number,
          summary: e.sales_summary,
          businessUnit: e.sales_business_unit
        }
      })),
      ghlOpportunities: opportunitiesResult.rows,
      relationship: {
        description: 'Install job traced back to sold estimate via customer',
        flow: 'Sales Job → Estimate Sold → Install Job Created → Install Pipeline'
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to trace job to estimate');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE & SYNC STATUS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /pipelines - Get all configured GHL pipelines
 */
router.get('/pipelines', async (req, res) => {
  try {
    res.json({
      success: true,
      data: GHL_PIPELINES
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get pipelines');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /sync/status - Get GHL sync status and recent logs
 */
router.get('/sync/status', async (req, res) => {
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
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get sync status');
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

export default router;
