/**
 * Backfill GHL Opportunities
 * Updates existing opportunities with:
 * - Correct name format: "Customer Name - Job Type"
 * - ServiceTitan custom fields (customer ID, job ID, address, etc.)
 */

import axios from 'axios';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';
import { GHL_CUSTOM_FIELDS, buildOpportunityCustomFields } from '../../config/ghl-pipelines.js';
import { syncJobTypes, getJobTypesMap } from './sync-job-types.js';

const logger = createLogger('ghl-backfill');

const SCHEMA = {
  ghl: 'public',  // Using public schema directly
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
  cfg.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY || process.env.GHL_ACCESS_TOKEN}`;
  return cfg;
});

/**
 * Fetch job details from ServiceTitan API
 */
async function fetchSTJobDetails(jobId) {
  try {
    const result = await stRequest(stEndpoints.jobs.get(jobId));
    if (!result.ok) {
      logger.warn({ jobId, status: result.status }, 'Failed to fetch ST job');
      return null;
    }
    return result.data;
  } catch (error) {
    logger.warn({ jobId, error: error.message }, 'Failed to fetch ST job');
    return null;
  }
}

/**
 * Fetch customer details from ServiceTitan API
 */
async function fetchSTCustomerDetails(customerId) {
  try {
    const result = await stRequest(stEndpoints.customers.get(customerId));
    if (!result.ok) {
      logger.warn({ customerId, status: result.status }, 'Failed to fetch ST customer');
      return null;
    }
    return result.data;
  } catch (error) {
    logger.warn({ customerId, error: error.message }, 'Failed to fetch ST customer');
    return null;
  }
}

/**
 * Fetch job type name from ServiceTitan API
 */
async function fetchSTJobTypeName(jobTypeId) {
  try {
    const result = await stRequest(stEndpoints.jobTypes.list());
    if (!result.ok) {
      logger.warn({ status: result.status }, 'Failed to fetch job types');
      return null;
    }
    const jobTypes = result.data?.data || [];
    const jobType = jobTypes.find(jt => jt.id === jobTypeId);
    return jobType?.name || null;
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to fetch job types');
    return null;
  }
}

/**
 * Format opportunity name as "Customer Name - Job Type"
 */
function formatOpportunityName(customerName, jobTypeName, jobSummary) {
  const parts = [];

  if (customerName) {
    parts.push(customerName);
  }

  if (jobTypeName) {
    parts.push(jobTypeName);
  } else if (jobSummary) {
    parts.push(jobSummary);
  }

  return parts.join(' - ') || 'Unknown Opportunity';
}

/**
 * Update a single opportunity in GHL with ST data
 */
async function updateOpportunityWithSTData(opportunity, stJob, stCustomer, jobTypeName) {
  const client = await getPool().connect();

  try {
    // Build the new name
    const customerName = stCustomer?.name || opportunity.name?.split(' - ')[1] || 'Unknown';
    const newName = formatOpportunityName(customerName, jobTypeName, stJob?.summary);

    // Build custom fields
    const customFields = buildOpportunityCustomFields({
      stCustomerId: stJob?.customerId || stCustomer?.id,
      stJobId: stJob?.id,
      stEstimateId: opportunity.st_estimate_id,
      streetAddress: stCustomer?.address?.street || stJob?.location?.address?.street,
      city: stCustomer?.address?.city || stJob?.location?.address?.city,
      state: stCustomer?.address?.state || stJob?.location?.address?.state,
      postalCode: stCustomer?.address?.zip || stJob?.location?.address?.zip
    });

    // Update in GHL
    const updateData = {
      name: newName,
      customFields: customFields
    };

    logger.info(`Updating opportunity ${opportunity.ghl_id}`, {
      oldName: opportunity.name,
      newName: newName,
      customFieldCount: customFields.length
    });

    await ghlClient.put(`/opportunities/${opportunity.ghl_id}`, updateData);

    // Update local database
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_opportunities
      SET name = $2,
          updated_at = NOW()
      WHERE ghl_id = $1
    `, [opportunity.ghl_id, newName]);

    return { success: true, ghlId: opportunity.ghl_id, newName };

  } catch (error) {
    logger.error(`Failed to update opportunity ${opportunity.ghl_id}:`, error.message);
    return { success: false, ghlId: opportunity.ghl_id, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Backfill all opportunities with ST data
 * Uses GHL contact info as primary source for customer name
 */
export async function backfillAllOpportunities(options = {}) {
  const client = await getPool().connect();
  const { limit = 100, dryRun = false } = options;

  const stats = {
    total: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  try {
    logger.info('Starting opportunity backfill...', { limit, dryRun });

    // First, sync job types from ST if needed
    logger.info('Syncing job types from ServiceTitan...');
    try {
      await syncJobTypes();
    } catch (e) {
      logger.warn('Job types sync failed, continuing with existing data:', e.message);
    }

    // Load job types map from local database
    const jobTypesMap = await getJobTypesMap();
    logger.info(`Loaded ${Object.keys(jobTypesMap).length} job types from database`);

    // Get all opportunities with full_data (contains GHL contact info)
    const result = await client.query(`
      SELECT
        ghl_id,
        name,
        st_job_id,
        st_estimate_id,
        contact_id,
        monetary_value,
        full_data
      FROM ${SCHEMA.ghl}.ghl_opportunities
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    stats.total = result.rows.length;
    logger.info(`Found ${stats.total} opportunities to process`);

    for (const opp of result.rows) {
      try {
        // Extract customer name from GHL full_data (contact info)
        let customerName = null;
        let contactId = null;

        if (opp.full_data) {
          const fullData = typeof opp.full_data === 'string' ? JSON.parse(opp.full_data) : opp.full_data;
          const oppData = fullData.opportunity || fullData;
          customerName = oppData.contact?.name;
          contactId = oppData.contactId || oppData.contact?.id;
        }

        // Fallback: extract name from current opportunity name (e.g., "Job #null - John Doe")
        if (!customerName && opp.name) {
          const match = opp.name.match(/- (.+)$/);
          if (match) {
            customerName = match[1];
          }
        }

        // Try to get job details and job type
        let jobTypeName = null;
        let stJob = null;

        if (opp.st_job_id) {
          // Try to fetch job from ST API
          stJob = await fetchSTJobDetails(opp.st_job_id);

          if (stJob && stJob.jobTypeId) {
            // Look up job type name from local database
            jobTypeName = jobTypesMap[stJob.jobTypeId];
            logger.debug(`Job ${opp.st_job_id} has jobTypeId ${stJob.jobTypeId} = ${jobTypeName}`);
          }
        }

        // Build the new name: "Customer Name - Job Type"
        const newName = formatOpportunityName(customerName || 'Unknown Customer', jobTypeName, stJob?.summary);

        // Build custom fields
        const customFieldsData = {
          stCustomerId: stJob?.customerId,
          stJobId: opp.st_job_id,
          stEstimateId: opp.st_estimate_id
        };

        // Try to get address from ST customer
        if (stJob?.customerId) {
          const stCustomer = await fetchSTCustomerDetails(stJob.customerId);
          if (stCustomer) {
            customFieldsData.streetAddress = stCustomer.address?.street;
            customFieldsData.city = stCustomer.address?.city;
            customFieldsData.state = stCustomer.address?.state;
            customFieldsData.postalCode = stCustomer.address?.zip;
          }
        }

        if (dryRun) {
          stats.details.push({
            ghlId: opp.ghl_id,
            status: 'would_update',
            oldName: opp.name,
            newName: newName,
            customerName: customerName,
            jobType: jobTypeName,
            stJobId: opp.st_job_id,
            contactId: contactId
          });
          stats.updated++;
        } else {
          // Build custom fields array
          const customFields = buildOpportunityCustomFields(customFieldsData);

          // Update in GHL
          const updateData = {
            name: newName,
            customFields: customFields
          };

          logger.info(`Updating opportunity ${opp.ghl_id}`, {
            oldName: opp.name,
            newName: newName,
            customFieldCount: customFields.length
          });

          try {
            await ghlClient.put(`/opportunities/${opp.ghl_id}`, updateData);

            // Update local database
            await client.query(`
              UPDATE ${SCHEMA.ghl}.ghl_opportunities
              SET name = $2,
                  updated_at = NOW()
              WHERE ghl_id = $1
            `, [opp.ghl_id, newName]);

            stats.updated++;
            stats.details.push({ ghlId: opp.ghl_id, status: 'updated', newName: newName });
          } catch (updateError) {
            stats.failed++;
            stats.details.push({ ghlId: opp.ghl_id, status: 'failed', error: updateError.message });
          }
        }

        // Rate limiting - wait 300ms between API calls
        await new Promise(r => setTimeout(r, 300));

      } catch (error) {
        stats.failed++;
        stats.details.push({ ghlId: opp.ghl_id, status: 'error', error: error.message });
        logger.error(`Error processing opportunity ${opp.ghl_id}:`, error.message);
      }
    }

    logger.info('Backfill completed', stats);
    return stats;

  } finally {
    client.release();
  }
}

/**
 * Backfill a single opportunity by GHL ID
 */
export async function backfillOpportunity(ghlOpportunityId) {
  const client = await getPool().connect();

  try {
    const result = await client.query(`
      SELECT
        ghl_id,
        name,
        st_job_id,
        st_estimate_id,
        contact_id,
        monetary_value
      FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE ghl_id = $1
    `, [ghlOpportunityId]);

    if (result.rows.length === 0) {
      return { success: false, error: 'Opportunity not found' };
    }

    const opp = result.rows[0];

    if (!opp.st_job_id) {
      return { success: false, error: 'No ST job ID linked to opportunity' };
    }

    // Fetch ST data
    const stJob = await fetchSTJobDetails(opp.st_job_id);
    if (!stJob) {
      return { success: false, error: 'ST job not found' };
    }

    let stCustomer = null;
    if (stJob.customerId) {
      stCustomer = await fetchSTCustomerDetails(stJob.customerId);
    }

    // Get job type name
    let jobTypeName = null;
    if (stJob.jobTypeId) {
      jobTypeName = await fetchSTJobTypeName(stJob.jobTypeId);
    }

    return await updateOpportunityWithSTData(opp, stJob, stCustomer, jobTypeName);

  } finally {
    client.release();
  }
}

export default {
  backfillAllOpportunities,
  backfillOpportunity
};
