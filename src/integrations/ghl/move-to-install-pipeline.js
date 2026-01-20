/**
 * Move Opportunity to Install Pipeline
 *
 * When an estimate is sold and an install job is created,
 * move the opportunity from SALES PIPELINE (Job Sold) to
 * INSTALL PIPELINE (Estimate Approved / Job Created)
 */

import axios from 'axios';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { GHL_PIPELINES, GHL_LOCATION_ID, buildOpportunityCustomFields } from '../../config/ghl-pipelines.js';

const logger = createLogger('ghl-install-pipeline');

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

ghlClient.interceptors.request.use((cfg) => {
  cfg.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY}`;
  return cfg;
});

/**
 * Move opportunity from Sales Pipeline to Install Pipeline
 * Called when a new install job is detected for a customer with a sold estimate
 *
 * @param {number} installJobId - The new install job ID from ServiceTitan
 * @param {number} customerId - The customer ID
 * @param {object} options - Additional options
 */
export async function moveOpportunityToInstallPipeline(installJobId, customerId, options = {}) {
  const client = await getPool().connect();

  try {
    logger.info('Moving opportunity to Install Pipeline', { installJobId, customerId });

    // Find the GHL opportunity for this customer in the Sales Pipeline (Job Sold stage)
    // Find opportunity via st_job_id -> st_jobs -> customer_id match
    const oppResult = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.monetary_value,
        o.pipeline_id,
        o.pipeline_stage_id,
        o.contact_id as ghl_contact_id,
        o.st_job_id,
        j.customer_id as st_customer_id
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      JOIN ${SCHEMA.st}.st_jobs j ON o.st_job_id = j.st_id
      WHERE j.customer_id = $1
        AND o.pipeline_id = $2
        AND o.pipeline_stage_id = $3
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [customerId, GHL_PIPELINES.SALES_PIPELINE.id, GHL_PIPELINES.SALES_PIPELINE.stages.JOB_SOLD]);

    const opportunity = oppResult.rows[0];

    if (!opportunity) {
      logger.info('No opportunity found in Job Sold stage for customer', { customerId });
      return null;
    }

    // Get install job details for naming and custom fields
    const jobResult = await client.query(`
      SELECT
        j.st_id,
        j.job_number,
        j.summary,
        j.customer_id,
        c.name as customer_name,
        c.address_line1 as street_address,
        c.city,
        c.state,
        c.zip as postal_code
      FROM ${SCHEMA.st}.st_jobs j
      JOIN ${SCHEMA.st}.st_customers c ON j.customer_id = c.st_id
      WHERE j.st_id = $1
    `, [installJobId]);

    const installJob = jobResult.rows[0];

    // Build custom fields with install job data
    const customFields = buildOpportunityCustomFields({
      stCustomerId: installJob?.customer_id || customerId,
      stJobId: installJobId,
      streetAddress: installJob?.street_address,
      city: installJob?.city,
      state: installJob?.state,
      postalCode: installJob?.postal_code
    });

    // Update opportunity in GHL - move to Install Pipeline
    const updateData = {
      pipelineId: GHL_PIPELINES.INSTALL_PIPELINE.id,
      pipelineStageId: GHL_PIPELINES.INSTALL_PIPELINE.stages.ESTIMATE_APPROVED_JOB_CREATED,
      customFields: customFields
    };

    // Optionally update the name to reflect install job
    if (installJob) {
      updateData.name = `${installJob.customer_name} - Install Job #${installJob.job_number} - $${Number(opportunity.monetary_value).toLocaleString()}`;
    }

    await ghlClient.put(`/opportunities/${opportunity.ghl_id}`, updateData);

    // Update local database
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_opportunities
      SET pipeline_id = $2,
          pipeline_stage_id = $3,
          st_job_id = $4,
          name = COALESCE($5, name),
          updated_at = NOW()
      WHERE ghl_id = $1
    `, [
      opportunity.ghl_id,
      GHL_PIPELINES.INSTALL_PIPELINE.id,
      GHL_PIPELINES.INSTALL_PIPELINE.stages.ESTIMATE_APPROVED_JOB_CREATED,
      installJobId,
      updateData.name
    ]);

    logger.info('✅ Moved opportunity to Install Pipeline', {
      opportunityId: opportunity.ghl_id,
      customerId,
      installJobId,
      fromStage: 'Job Sold',
      toStage: 'Estimate Approved / Job Created'
    });

    return opportunity.ghl_id;

  } catch (error) {
    logger.error('Error moving opportunity to Install Pipeline', {
      installJobId,
      customerId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Detect install jobs that need to trigger opportunity moves
 * Looks for install jobs where the customer has a sold estimate but
 * opportunity is still in Sales Pipeline
 */
export async function detectInstallJobsNeedingMove() {
  const client = await getPool().connect();

  try {
    // Find install jobs with customers who have opportunities still in Job Sold stage
    // Join through st_jobs to find opportunities linked to the same customer
    const result = await client.query(`
      SELECT
        ij.st_id as install_job_id,
        ij.job_number as install_job_number,
        ij.customer_id,
        c.name as customer_name,
        ibu.name as install_bu,
        o.ghl_id as opportunity_id,
        o.pipeline_stage_id,
        ij.st_created_on
      FROM ${SCHEMA.st}.st_jobs ij
      JOIN ${SCHEMA.st}.st_business_units ibu ON ij.business_unit_id = ibu.st_id
      JOIN ${SCHEMA.st}.st_customers c ON ij.customer_id = c.st_id
      -- Find opportunities linked to jobs for the same customer
      JOIN ${SCHEMA.st}.st_jobs oj ON oj.customer_id = c.st_id
      JOIN ${SCHEMA.ghl}.ghl_opportunities o ON o.st_job_id = oj.st_id
      WHERE ibu.name LIKE '%Install%'
        AND o.pipeline_id = $1
        AND o.pipeline_stage_id = $2
        AND ij.st_created_on >= NOW() - INTERVAL '7 days'
        AND ij.st_id != oj.st_id  -- Exclude the install job itself
      ORDER BY ij.st_created_on DESC
    `, [GHL_PIPELINES.SALES_PIPELINE.id, GHL_PIPELINES.SALES_PIPELINE.stages.JOB_SOLD]);

    logger.info(`Found ${result.rows.length} install jobs needing opportunity move`);

    return result.rows;

  } finally {
    client.release();
  }
}

/**
 * Process all pending install job moves
 */
export async function processInstallJobMoves() {
  const pendingMoves = await detectInstallJobsNeedingMove();

  let moved = 0;
  let failed = 0;

  for (const job of pendingMoves) {
    try {
      await moveOpportunityToInstallPipeline(job.install_job_id, job.customer_id);
      moved++;
    } catch (error) {
      logger.error('Failed to move opportunity', {
        installJobId: job.install_job_id,
        error: error.message
      });
      failed++;
    }
  }

  return { moved, failed, total: pendingMoves.length };
}

export default {
  moveOpportunityToInstallPipeline,
  detectInstallJobsNeedingMove,
  processInstallJobMoves
};
