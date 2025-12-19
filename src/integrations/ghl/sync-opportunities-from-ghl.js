/**
 * Import opportunities FROM GoHighLevel
 * Stores in ghl_opportunities table
 * Creates ST jobs for won opportunities
 *
 * Schema:
 *   - integrations.ghl_opportunities - GHL opportunities
 *   - integrations.ghl_contacts - GHL contacts
 *   - integrations.ghl_sync_log - Sync log
 *   - servicetitan.st_customers - ST customers
 *   - servicetitan.st_jobs - ST jobs
 *   - servicetitan.st_business_units - Business units
 */

import axios from 'axios';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';

// Schema prefixes for proper table references
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

const logger = createLogger('ghl-opportunities');

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

// Add auth header dynamically
ghlClient.interceptors.request.use((config) => {
  config.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY || process.env.GHL_ACCESS_TOKEN}`;
  return config;
});

/**
 * Sync opportunities from GHL
 */
export async function syncOpportunitiesFromGHL() {
  const syncId = await startSyncLog('import_opportunities', 'from_ghl');
  let stats = { fetched: 0, created: 0, updated: 0, failed: 0, jobsCreated: 0 };
  
  try {
    logger.info('Syncing opportunities from GHL...');
    
    const locationId = process.env.GHL_LOCATION_ID;
    if (!locationId) {
      throw new Error('GHL_LOCATION_ID environment variable not set');
    }
    
    // Get all pipelines first
    const pipelinesResponse = await ghlClient.get(`/opportunities/pipelines`, {
      params: { locationId }
    });
    
    const pipelines = pipelinesResponse.data?.pipelines || [];
    logger.info(`Found ${pipelines.length} pipelines`);
    
    // Get opportunities from each pipeline
    for (const pipeline of pipelines) {
      try {
        const oppsResponse = await ghlClient.get(`/opportunities/search`, {
          params: {
            location_id: locationId,
            pipeline_id: pipeline.id,
            limit: 100
          }
        });
        
        const opportunities = oppsResponse.data?.opportunities || [];
        stats.fetched += opportunities.length;
        
        for (const opp of opportunities) {
          try {
            const result = await upsertGHLOpportunity(opp, pipeline);
            result.isNew ? stats.created++ : stats.updated++;
            
            // If opportunity is "won" and not yet synced to ST, create job
            if (opp.status === 'won' && !result.existing?.st_job_id) {
              const jobCreated = await createSTJobFromOpportunity(opp.id);
              if (jobCreated) stats.jobsCreated++;
            }
            
          } catch (error) {
            logger.error('Failed to process opportunity', {
              opportunityId: opp.id,
              error: error.message
            });
            stats.failed++;
          }
        }
      } catch (error) {
        logger.error('Failed to fetch opportunities from pipeline', {
          pipelineId: pipeline.id,
          error: error.message
        });
      }
    }
    
    await completeSyncLog(syncId, stats);
    logger.info('GHL opportunities sync completed', stats);
    return stats;
    
  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('GHL opportunities sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a GHL opportunity to local database
 */
async function upsertGHLOpportunity(opp, pipeline) {
  const client = await getPool().connect();
  
  try {
    // Check if exists
    const existing = await client.query(
      `SELECT id, st_job_id, st_customer_id FROM ${SCHEMA.ghl}.ghl_opportunities WHERE ghl_id = $1`,
      [opp.id]
    );

    // Try to find linked ST customer via contact
    let stCustomerId = null;
    if (opp.contactId) {
      const contactResult = await client.query(
        `SELECT st_customer_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE ghl_id = $1`,
        [opp.contactId]
      );
      stCustomerId = contactResult.rows[0]?.st_customer_id;
    }
    
    const stageName = pipeline.stages?.find(s => s.id === opp.pipelineStageId)?.name || null;
    
    if (existing.rows.length === 0) {
      // Insert new
      await client.query(`
        INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
          ghl_id, ghl_contact_id, ghl_location_id, ghl_pipeline_id, pipeline_name,
          ghl_pipeline_stage_id, stage_name, name, monetary_value, status,
          assigned_to, source, st_customer_id, custom_fields,
          ghl_created_at, ghl_updated_at, closed_at, full_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        opp.id,
        opp.contactId,
        opp.locationId,
        opp.pipelineId,
        pipeline.name,
        opp.pipelineStageId,
        stageName,
        opp.name,
        opp.monetaryValue || 0,
        opp.status,
        opp.assignedTo,
        opp.source,
        stCustomerId,
        JSON.stringify(opp.customFields || {}),
        opp.createdAt ? new Date(opp.createdAt) : null,
        opp.updatedAt ? new Date(opp.updatedAt) : null,
        opp.closedAt ? new Date(opp.closedAt) : null,
        JSON.stringify(opp)
      ]);
      
      return { isNew: true, existing: null };
    } else {
      // Update existing
      await client.query(`
        UPDATE ${SCHEMA.ghl}.ghl_opportunities SET
          pipeline_name = $2,
          ghl_pipeline_stage_id = $3,
          stage_name = $4,
          name = $5,
          monetary_value = $6,
          status = $7,
          assigned_to = $8,
          ghl_updated_at = $9,
          closed_at = $10,
          full_data = $11,
          local_synced_at = NOW()
        WHERE ghl_id = $1
      `, [
        opp.id,
        pipeline.name,
        opp.pipelineStageId,
        stageName,
        opp.name,
        opp.monetaryValue || 0,
        opp.status,
        opp.assignedTo,
        opp.updatedAt ? new Date(opp.updatedAt) : null,
        opp.closedAt ? new Date(opp.closedAt) : null,
        JSON.stringify(opp)
      ]);
      
      return { isNew: false, existing: existing.rows[0] };
    }
  } finally {
    client.release();
  }
}

/**
 * Create a ServiceTitan job from a won GHL opportunity
 */
async function createSTJobFromOpportunity(ghlOpportunityId) {
  const client = await getPool().connect();
  
  try {
    // Get opportunity
    const oppResult = await client.query(
      `SELECT * FROM ${SCHEMA.ghl}.ghl_opportunities WHERE ghl_id = $1`,
      [ghlOpportunityId]
    );
    
    const opp = oppResult.rows[0];
    if (!opp || opp.st_job_id) {
      return false; // Already synced or not found
    }
    
    if (!opp.st_customer_id) {
      logger.warn('Cannot create ST job - no linked customer', {
        opportunityId: ghlOpportunityId
      });

      await client.query(
        `UPDATE ${SCHEMA.ghl}.ghl_opportunities SET st_sync_error = $2 WHERE ghl_id = $1`,
        [ghlOpportunityId, 'No linked ServiceTitan customer']
      );
      return false;
    }

    // Get customer details
    const customerResult = await client.query(
      `SELECT * FROM ${SCHEMA.st}.st_customers WHERE st_id = $1`,
      [opp.st_customer_id]
    );
    
    const customer = customerResult.rows[0];
    if (!customer) {
      logger.error('Customer not found in database', { customerId: opp.st_customer_id });
      return false;
    }
    
    // Get business unit from pipeline mapping
    const buResult = await client.query(
      `SELECT * FROM ${SCHEMA.st}.st_business_units WHERE ghl_pipeline_id = $1`,
      [opp.ghl_pipeline_id]
    );

    const businessUnit = buResult.rows[0];
    if (!businessUnit) {
      logger.warn('No business unit mapped to GHL pipeline', {
        pipelineId: opp.ghl_pipeline_id,
        pipelineName: opp.pipeline_name
      });

      await client.query(
        `UPDATE ${SCHEMA.ghl}.ghl_opportunities SET st_sync_error = $2 WHERE ghl_id = $1`,
        [ghlOpportunityId, `No business unit mapped to pipeline: ${opp.pipeline_name}`]
      );
      return false;
    }
    
    // Create job in ServiceTitan via API
    const tenantId = config.serviceTitan.tenantId;
    const jobUrl = `${config.serviceTitan.apiBaseUrl}/jpm/v2/tenant/${tenantId}/jobs`;
    
    const jobData = {
      customerId: Number(customer.st_id),
      businessUnitId: Number(businessUnit.st_id),
      summary: opp.name,
      jobTypeId: null, // Could map from opportunity type
    };
    
    const response = await stRequest(jobUrl, {
      method: 'POST',
      body: jobData
    });
    
    if (!response.ok) {
      throw new Error(`ST API error: ${response.status}`);
    }
    
    const createdJob = response.data;
    
    // Store in local database
    await client.query(`
      INSERT INTO ${SCHEMA.st}.st_jobs (
        st_id, tenant_id, job_number, customer_id, business_unit_id,
        summary, job_status, ghl_opportunity_id, ghl_synced_at, ghl_sync_status,
        full_data, st_created_on, st_modified_on
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12)
      ON CONFLICT (st_id) DO UPDATE SET
        ghl_opportunity_id = EXCLUDED.ghl_opportunity_id,
        ghl_synced_at = NOW(),
        ghl_sync_status = 'synced'
    `, [
      createdJob.id,
      createdJob.tenantId || tenantId,
      createdJob.jobNumber,
      customer.st_id,
      businessUnit.st_id,
      opp.name,
      'New',
      opp.ghl_id,
      'synced',
      JSON.stringify(createdJob),
      createdJob.createdOn ? new Date(createdJob.createdOn) : new Date(),
      createdJob.modifiedOn ? new Date(createdJob.modifiedOn) : new Date()
    ]);
    
    // Link back in GHL opportunity table
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_opportunities SET
        st_job_id = $2,
        synced_to_st = true,
        st_sync_error = NULL,
        local_updated_at = NOW()
      WHERE ghl_id = $1
    `, [ghlOpportunityId, createdJob.id]);
    
    logger.info('Created ST job from GHL opportunity', {
      opportunityId: ghlOpportunityId,
      jobId: createdJob.id,
      jobNumber: createdJob.jobNumber
    });
    
    return true;
    
  } catch (error) {
    logger.error('Error creating ST job from opportunity', {
      opportunityId: ghlOpportunityId,
      error: error.message
    });

    await client.query(
      `UPDATE ${SCHEMA.ghl}.ghl_opportunities SET st_sync_error = $2 WHERE ghl_id = $1`,
      [ghlOpportunityId, error.message]
    );
    
    return false;
  } finally {
    client.release();
  }
}

// ============================================
// Sync Log Helpers
// ============================================

async function startSyncLog(type, direction) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_sync_log (sync_type, direction, status, triggered_by)
      VALUES ($1, $2, 'started', 'scheduled')
      RETURNING id
    `, [type, direction]);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

async function completeSyncLog(id, stats) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_sync_log SET
        status = 'completed',
        records_fetched = $2,
        records_created = $3,
        records_updated = $4,
        records_failed = $5,
        completed_at = NOW()
      WHERE id = $1
    `, [id, stats.fetched, stats.created, stats.updated, stats.failed]);
  } finally {
    client.release();
  }
}

async function failSyncLog(id, error) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_sync_log SET
        status = 'failed',
        error_message = $2,
        completed_at = NOW()
      WHERE id = $1
    `, [id, error.message]);
  } finally {
    client.release();
  }
}

export default { syncOpportunitiesFromGHL };
