/**
 * Jobs Sync Module
 * Syncs jobs from ServiceTitan to local database
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-jobs');

/**
 * Sync jobs from ServiceTitan
 */
export async function syncJobs({ full = false, since = null } = {}) {
  const startTime = Date.now();
  const syncType = full ? 'full' : 'incremental';
  const syncId = await startSyncLog('jobs', syncType);

  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const tenantId = config.serviceTitan.tenantId;
    const baseUrl = `${config.serviceTitan.apiBaseUrl}/jpm/v2/tenant/${tenantId}/jobs`;

    const query = {
      pageSize: 500,
      includeTotal: true
    };

    if (since && !full) {
      query.modifiedOnOrAfter = since.toISOString();
    }

    let page = 1;
    let hasMore = true;
    let continuationToken = null;

    while (hasMore) {
      const pageQuery = { ...query };
      if (continuationToken) {
        pageQuery.continueFrom = continuationToken;
      } else {
        pageQuery.page = page;
      }

      logger.debug(`Fetching jobs page ${page}...`);
      const response = await stRequest(baseUrl, { query: pageQuery });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const jobs = response.data.data || [];
      stats.fetched += jobs.length;

      for (const job of jobs) {
        try {
          const result = await upsertJob(job);
          if (result.created) {
            stats.created++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          if (stats.failed < 3) {
            logger.error('Failed to upsert job', {
              jobId: job.id,
              customerId: job.customerId,
              error: error.message,
              errorCode: error.code,
              errorDetail: error.detail
            });
          }
          stats.failed++;
        }
      }

      hasMore = response.data.hasMore || false;
      continuationToken = response.data.continueFrom;
      page++;

      await delay(100);

      if (page % 10 === 0) {
        logger.info(`Synced ${stats.fetched} jobs so far...`);
      }
    }

    await completeSyncLog(syncId, stats, startTime);
    logger.info('Jobs sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Jobs sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a single job
 */
async function upsertJob(job) {
  const client = await getPool().connect();
  try {
    const existing = await client.query(
      'SELECT st_id FROM st_jobs WHERE st_id = $1',
      [job.id]
    );

    const isNew = existing.rows.length === 0;

    if (isNew) {
      await client.query(`
        INSERT INTO st_jobs (
          st_id, tenant_id, customer_id, location_id, business_unit_id,
          job_number, job_type_id, job_status,
          campaign_id, summary, invoice_total,
          job_completion_time,
          tag_type_ids, tags, custom_fields,
          st_created_on, st_modified_on, full_data
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12,
          $13, $14, $15,
          $16, $17, $18
        )
      `, [
        job.id,
        job.tenantId || config.serviceTitan.tenantId,
        job.customerId,
        job.locationId || null,
        job.businessUnitId || null,
        job.jobNumber || String(job.id),
        job.jobTypeId,
        job.jobStatus,
        job.campaignId,
        job.summary,
        job.total || 0,
        job.completedOn ? new Date(job.completedOn) : null,
        job.tagTypeIds || [],
        JSON.stringify(job.tags || []),
        JSON.stringify(job.customFields || {}),
        job.createdOn ? new Date(job.createdOn) : null,
        job.modifiedOn ? new Date(job.modifiedOn) : null,
        JSON.stringify(job)
      ]);
    } else {
      await client.query(`
        UPDATE st_jobs SET
          job_status = $2,
          summary = $3,
          invoice_total = $4,
          job_completion_time = $5,
          tag_type_ids = $6,
          tags = $7,
          custom_fields = $8,
          st_modified_on = $9,
          full_data = $10,
          local_synced_at = NOW()
        WHERE st_id = $1
      `, [
        job.id,
        job.jobStatus,
        job.summary,
        job.total || 0,
        job.completedOn ? new Date(job.completedOn) : null,
        job.tagTypeIds || [],
        JSON.stringify(job.tags || []),
        JSON.stringify(job.customFields || {}),
        job.modifiedOn ? new Date(job.modifiedOn) : null,
        JSON.stringify(job)
      ]);
    }

    return { created: isNew };
  } finally {
    client.release();
  }
}

export default { syncJobs };
