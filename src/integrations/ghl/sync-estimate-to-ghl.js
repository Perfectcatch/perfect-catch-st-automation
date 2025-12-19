/**
 * Sync Estimates TO GoHighLevel
 * Creates/updates GHL opportunities from ST estimates
 * This replaces the n8n + Airtable workflow!
 *
 * Schema:
 *   - integrations.ghl_contacts - GHL contact storage
 *   - integrations.ghl_opportunities - GHL opportunity storage
 *   - servicetitan.st_customers - ServiceTitan customers
 *   - servicetitan.st_jobs - ServiceTitan jobs
 *   - servicetitan.st_estimates - ServiceTitan estimates
 *   - servicetitan.st_business_units - Business units with GHL pipeline mappings
 */

import axios from 'axios';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';

// Schema prefixes for proper table references
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

const logger = createLogger('ghl-estimate-sync');

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

// Add auth header dynamically
ghlClient.interceptors.request.use((cfg) => {
  cfg.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY || process.env.GHL_ACCESS_TOKEN}`;
  return cfg;
});

/**
 * Sync a single estimate to GHL as an opportunity
 * @param {number} estimateId - ServiceTitan estimate ID
 */
export async function syncEstimateToGHL(estimateId) {
  const client = await getPool().connect();
  
  try {
    logger.info('Syncing estimate to GHL', { estimateId });
    
    // Get estimate with related data
    const estimateResult = await client.query(`
      SELECT
        e.*,
        c.st_id as customer_st_id,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.address_line1 as customer_address,
        c.city as customer_city,
        c.state as customer_state,
        c.zip as customer_zip,
        j.st_id as job_st_id,
        j.job_number,
        j.summary as job_summary,
        j.business_unit_id,
        bu.name as business_unit_name,
        bu.ghl_pipeline_id
      FROM ${SCHEMA.st}.st_estimates e
      LEFT JOIN ${SCHEMA.st}.st_customers c ON e.customer_id = c.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      LEFT JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE e.st_id = $1
    `, [estimateId]);
    
    const estimate = estimateResult.rows[0];
    
    if (!estimate) {
      throw new Error(`Estimate ${estimateId} not found`);
    }
    
    if (!estimate.ghl_pipeline_id) {
      logger.warn('No GHL pipeline mapped for business unit', {
        estimateId,
        businessUnit: estimate.business_unit_name
      });
      return null;
    }
    
    // Check if opportunity already exists for this estimate/job
    const existingOppResult = await client.query(`
      SELECT ghl_id, monetary_value FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE st_job_id = $1 OR (full_data->>'stEstimateId')::bigint = $2
    `, [estimate.job_st_id, estimateId]);
    
    const existingOpp = existingOppResult.rows[0];
    
    if (existingOpp) {
      // Update existing opportunity value if changed
      if (Number(existingOpp.monetary_value) !== Number(estimate.total)) {
        await updateGHLOpportunity(existingOpp.ghl_id, {
          monetaryValue: Number(estimate.total),
          name: formatOpportunityName(estimate)
        });
        
        await client.query(`
          UPDATE ${SCHEMA.ghl}.ghl_opportunities
          SET monetary_value = $2, name = $3, local_updated_at = NOW()
          WHERE ghl_id = $1
        `, [existingOpp.ghl_id, estimate.total, formatOpportunityName(estimate)]);
        
        logger.info('Updated existing GHL opportunity', {
          estimateId,
          opportunityId: existingOpp.ghl_id,
          newValue: Number(estimate.total)
        });
      }
      return existingOpp.ghl_id;
    }
    
    // Get or create GHL contact
    let ghlContactId = await getGHLContactId(client, estimate.customer_st_id);
    
    if (!ghlContactId && estimate.customer_st_id) {
      ghlContactId = await createGHLContact(client, {
        st_id: estimate.customer_st_id,
        name: estimate.customer_name,
        email: estimate.customer_email,
        phone: estimate.customer_phone,
        address_line1: estimate.customer_address,
        city: estimate.customer_city,
        state: estimate.customer_state,
        zip: estimate.customer_zip
      });
    }
    
    if (!ghlContactId) {
      logger.warn('Could not get/create GHL contact for estimate', { estimateId });
      // Continue anyway - opportunity can exist without contact
    }
    
    // Get pipeline stages to find the right one
    const stageId = await getInitialStageId(estimate.ghl_pipeline_id);
    
    // Create opportunity in GHL
    const opportunityData = {
      pipelineId: estimate.ghl_pipeline_id,
      locationId: process.env.GHL_LOCATION_ID,
      name: formatOpportunityName(estimate),
      status: 'open',
      monetaryValue: Number(estimate.total) || 0
    };
    
    if (stageId) {
      opportunityData.pipelineStageId = stageId;
    }
    
    if (ghlContactId) {
      opportunityData.contactId = ghlContactId;
    }
    
    logger.debug('Creating GHL opportunity', opportunityData);
    
    const response = await ghlClient.post('/opportunities/', opportunityData);
    const createdOpp = response.data.opportunity || response.data;
    
    // Store in local database
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
        ghl_id, st_job_id, st_customer_id, ghl_contact_id,
        ghl_pipeline_id, pipeline_name, ghl_pipeline_stage_id, stage_name,
        name, monetary_value, status, source,
        custom_fields, ghl_created_at, full_data, synced_to_st
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, true)
      ON CONFLICT (ghl_id) DO UPDATE SET
        monetary_value = EXCLUDED.monetary_value,
        name = EXCLUDED.name,
        local_updated_at = NOW()
    `, [
      createdOpp.id,
      estimate.job_st_id,
      estimate.customer_st_id,
      ghlContactId,
      estimate.ghl_pipeline_id,
      estimate.business_unit_name,
      createdOpp.pipelineStageId,
      null, // stage_name - would need to look up
      opportunityData.name,
      opportunityData.monetaryValue,
      'open',
      'servicetitan_estimate',
      JSON.stringify({
        stEstimateId: Number(estimateId),
        stJobId: Number(estimate.job_st_id),
        stCustomerId: Number(estimate.customer_st_id),
        jobNumber: estimate.job_number
      }),
      createdOpp.createdAt ? new Date(createdOpp.createdAt) : new Date(),
      JSON.stringify(createdOpp)
    ]);
    
    logger.info('Created GHL opportunity from estimate', {
      estimateId,
      opportunityId: createdOpp.id,
      value: opportunityData.monetaryValue
    });
    
    return createdOpp.id;
    
  } catch (error) {
    logger.error('Error syncing estimate to GHL', {
      estimateId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Format opportunity name from estimate
 */
function formatOpportunityName(estimate) {
  const parts = [];
  
  if (estimate.customer_name) {
    parts.push(estimate.customer_name);
  }
  
  if (estimate.name) {
    parts.push(estimate.name);
  } else if (estimate.job_summary) {
    parts.push(estimate.job_summary);
  }
  
  if (estimate.total && Number(estimate.total) > 0) {
    parts.push(`$${Number(estimate.total).toLocaleString()}`);
  }
  
  return parts.join(' - ') || `Estimate #${estimate.st_id}`;
}

/**
 * Get GHL contact ID for ST customer
 */
async function getGHLContactId(client, stCustomerId) {
  if (!stCustomerId) return null;

  const result = await client.query(
    `SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE st_customer_id = $1 LIMIT 1`,
    [stCustomerId]
  );

  return result.rows[0]?.ghl_id;
}

/**
 * Create GHL contact from ST customer
 */
async function createGHLContact(client, customer) {
  try {
    const nameParts = (customer.name || '').split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const contactData = {
      locationId: process.env.GHL_LOCATION_ID,
      firstName,
      lastName,
      name: customer.name,
      email: customer.email || undefined,
      phone: customer.phone || undefined,
      address1: customer.address_line1 || undefined,
      city: customer.city || undefined,
      state: customer.state || undefined,
      postalCode: customer.zip || undefined,
      source: 'ServiceTitan',
      customFields: [
        {
          key: 'st_customer_id',
          field_value: String(customer.st_id)
        }
      ]
    };
    
    // Remove undefined fields
    Object.keys(contactData).forEach(key => {
      if (contactData[key] === undefined) {
        delete contactData[key];
      }
    });
    
    const response = await ghlClient.post('/contacts/', contactData);
    const createdContact = response.data.contact || response.data;
    
    // Store in local database
    await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_contacts (
        ghl_id, ghl_location_id, st_customer_id,
        first_name, last_name, name, email, phone,
        address_line1, city, state, zip,
        source, synced_to_st, full_data, ghl_created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15)
      ON CONFLICT (ghl_id) DO UPDATE SET
        st_customer_id = EXCLUDED.st_customer_id,
        synced_to_st = true,
        local_synced_at = NOW()
    `, [
      createdContact.id,
      process.env.GHL_LOCATION_ID,
      customer.st_id,
      firstName,
      lastName,
      customer.name,
      customer.email,
      customer.phone,
      customer.address_line1,
      customer.city,
      customer.state,
      customer.zip,
      'servicetitan',
      JSON.stringify(createdContact),
      createdContact.dateAdded ? new Date(createdContact.dateAdded) : new Date()
    ]);
    
    logger.info('Created GHL contact from ST customer', {
      customerId: customer.st_id,
      contactId: createdContact.id
    });
    
    return createdContact.id;
    
  } catch (error) {
    logger.error('Error creating GHL contact', {
      customerId: customer.st_id,
      error: error.message,
      response: error.response?.data
    });
    return null;
  }
}

/**
 * Get initial stage ID for a pipeline
 */
async function getInitialStageId(pipelineId) {
  try {
    const response = await ghlClient.get('/opportunities/pipelines', {
      params: { locationId: process.env.GHL_LOCATION_ID }
    });
    
    const pipeline = response.data.pipelines?.find(p => p.id === pipelineId);
    if (pipeline && pipeline.stages && pipeline.stages.length > 0) {
      return pipeline.stages[0].id;
    }
    
    return null;
  } catch (error) {
    logger.warn('Could not get pipeline stages', { pipelineId, error: error.message });
    return null;
  }
}

/**
 * Update existing GHL opportunity
 */
async function updateGHLOpportunity(ghlOpportunityId, updates) {
  try {
    await ghlClient.put(`/opportunities/${ghlOpportunityId}`, updates);
    logger.debug('Updated GHL opportunity', { ghlOpportunityId, updates });
  } catch (error) {
    logger.error('Error updating GHL opportunity', {
      ghlOpportunityId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Sync customer to GHL (creates contact if not exists)
 */
export async function syncCustomerToGHL(customerId) {
  const client = await getPool().connect();

  try {
    // Check if already synced
    const existingResult = await client.query(
      `SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE st_customer_id = $1`,
      [customerId]
    );

    if (existingResult.rows[0]) {
      return existingResult.rows[0].ghl_id;
    }

    // Get customer data
    const customerResult = await client.query(
      `SELECT * FROM ${SCHEMA.st}.st_customers WHERE st_id = $1`,
      [customerId]
    );
    
    const customer = customerResult.rows[0];
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    
    return await createGHLContact(client, customer);
    
  } finally {
    client.release();
  }
}

/**
 * Move GHL opportunity to "Job Sold" stage when estimate is approved/sold
 * @param {number} estimateId - ServiceTitan estimate ID
 * @param {object} eventData - Event data from estimate_approved event
 */
export async function moveOpportunityToJobSold(estimateId, eventData = {}) {
  const client = await getPool().connect();

  // Job Sold stage ID from SALES PIPELINE
  const JOB_SOLD_STAGE_ID = '97703c8d-1dc6-46f3-a537-601678cedebd';

  try {
    logger.info('Moving opportunity to Job Sold stage', { estimateId });

    // Get estimate details
    const estimateResult = await client.query(`
      SELECT
        e.*,
        c.name as customer_name,
        j.st_id as job_st_id
      FROM ${SCHEMA.st}.st_estimates e
      LEFT JOIN ${SCHEMA.st}.st_customers c ON e.customer_id = c.st_id
      LEFT JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      WHERE e.st_id = $1
    `, [estimateId]);

    const estimate = estimateResult.rows[0];

    if (!estimate) {
      logger.warn('Estimate not found for Job Sold update', { estimateId });
      return null;
    }

    // Find the GHL opportunity for this estimate or job
    const oppResult = await client.query(`
      SELECT ghl_id, name, monetary_value, ghl_pipeline_stage_id, stage_name
      FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE st_job_id = $1
         OR st_customer_id = $2
         OR (custom_fields->>'stEstimateId')::text = $3
      ORDER BY ghl_created_at DESC
      LIMIT 1
    `, [estimate.job_st_id, estimate.customer_id, String(estimateId)]);

    const opportunity = oppResult.rows[0];

    if (!opportunity) {
      logger.warn('No GHL opportunity found for sold estimate', {
        estimateId,
        jobId: estimate.job_st_id,
        customerId: estimate.customer_id
      });
      return null;
    }

    // Skip if already in Job Sold stage
    if (opportunity.ghl_pipeline_stage_id === JOB_SOLD_STAGE_ID) {
      logger.info('Opportunity already in Job Sold stage', {
        estimateId,
        opportunityId: opportunity.ghl_id
      });
      return opportunity.ghl_id;
    }

    // Update opportunity in GHL - keep status 'open' so it stays visible in pipeline
    const updateData = {
      pipelineStageId: JOB_SOLD_STAGE_ID,
      monetaryValue: Number(estimate.total) || Number(opportunity.monetary_value) || 0
    };

    await ghlClient.put(`/opportunities/${opportunity.ghl_id}`, updateData);

    // Update local database
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_opportunities
      SET ghl_pipeline_stage_id = $2,
          stage_name = 'Job Sold',
          monetary_value = $3,
          local_updated_at = NOW()
      WHERE ghl_id = $1
    `, [opportunity.ghl_id, JOB_SOLD_STAGE_ID, updateData.monetaryValue]);

    logger.info('✅ Moved opportunity to Job Sold stage', {
      estimateId,
      opportunityId: opportunity.ghl_id,
      customerName: estimate.customer_name,
      value: updateData.monetaryValue
    });

    return opportunity.ghl_id;

  } catch (error) {
    logger.error('Error moving opportunity to Job Sold', {
      estimateId,
      error: error.message,
      response: error.response?.data
    });
    throw error;
  } finally {
    client.release();
  }
}

export default { syncEstimateToGHL, syncCustomerToGHL, moveOpportunityToJobSold };
