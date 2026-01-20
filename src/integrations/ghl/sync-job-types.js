/**
 * Sync Job Types from ServiceTitan
 * Fetches job types from ST API and stores them locally
 */

import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';
import config from '../../config/index.js';

const logger = createLogger('sync-job-types');

/**
 * Sync all job types from ServiceTitan to local database
 */
export async function syncJobTypes() {
  const client = await getPool().connect();

  const stats = {
    fetched: 0,
    created: 0,
    updated: 0,
    failed: 0
  };

  try {
    logger.info('Fetching job types from ServiceTitan...');

    // Fetch job types from ST API
    // stRequest returns { status, data, ok } where data is the API response body
    const apiResult = await stRequest(stEndpoints.jobTypes.list());

    // ServiceTitan /jpm/v2/job-types returns { data: [...], page, pageSize, totalCount, hasMore }
    // So the actual array is at apiResult.data.data
    let jobTypes = [];
    const responseBody = apiResult?.data;

    logger.debug({ responseKeys: Object.keys(responseBody || {}) }, 'Job types API response structure');

    if (Array.isArray(responseBody)) {
      // Direct array response
      jobTypes = responseBody;
    } else if (responseBody?.data && Array.isArray(responseBody.data)) {
      // Standard ServiceTitan paginated response: { data: [...], page, pageSize, totalCount }
      jobTypes = responseBody.data;
      logger.debug({ totalCount: responseBody.totalCount, page: responseBody.page }, 'Paginated response');
    } else if (responseBody?.jobTypes && Array.isArray(responseBody.jobTypes)) {
      // Alternative format
      jobTypes = responseBody.jobTypes;
    } else {
      logger.warn({ responseType: typeof responseBody, sample: JSON.stringify(responseBody).substring(0, 500) }, 'Unexpected job types response format');
      jobTypes = [];
    }

    stats.fetched = jobTypes.length;
    logger.info(`Fetched ${stats.fetched} job types from ST`);

    const tenantId = config.serviceTitan.tenantId;

    for (const jt of jobTypes) {
      try {
        // Upsert job type
        const result = await client.query(`
          INSERT INTO public.st_job_types (
            st_id, tenant_id, name, code, active, business_unit_id, full_data, local_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            active = EXCLUDED.active,
            business_unit_id = EXCLUDED.business_unit_id,
            full_data = EXCLUDED.full_data,
            local_synced_at = NOW()
          RETURNING (xmax = 0) as is_insert
        `, [
          jt.id,
          tenantId,
          jt.name,
          jt.code || null,
          jt.active !== false,
          jt.businessUnitId || null,
          JSON.stringify(jt)
        ]);

        if (result.rows[0]?.is_insert) {
          stats.created++;
        } else {
          stats.updated++;
        }
      } catch (error) {
        stats.failed++;
        logger.warn(`Failed to upsert job type ${jt.id}:`, error.message);
      }
    }

    logger.info('Job types sync completed', stats);
    return stats;

  } catch (error) {
    logger.error('Error syncing job types:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get job type name by ID from local database
 */
export async function getJobTypeName(jobTypeId) {
  if (!jobTypeId) return null;

  const client = await getPool().connect();

  try {
    const result = await client.query(
      'SELECT name FROM public.st_job_types WHERE st_id = $1',
      [jobTypeId]
    );
    return result.rows[0]?.name || null;
  } finally {
    client.release();
  }
}

/**
 * Get all job types as a map { id: name }
 */
export async function getJobTypesMap() {
  const client = await getPool().connect();

  try {
    const result = await client.query('SELECT st_id, name FROM public.st_job_types');
    const map = {};
    for (const row of result.rows) {
      map[row.st_id] = row.name;
    }
    return map;
  } finally {
    client.release();
  }
}

export default {
  syncJobTypes,
  getJobTypeName,
  getJobTypesMap
};
