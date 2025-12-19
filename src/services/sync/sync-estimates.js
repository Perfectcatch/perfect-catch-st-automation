/**
 * Estimates Sync Module
 * Syncs estimates from ServiceTitan to local database
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-estimates');

/**
 * Calculate total from items array
 */
function calculateTotal(items) {
  if (!items || !Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + (item.total || 0), 0);
}

/**
 * Sync estimates from ServiceTitan
 */
export async function syncEstimates({ full = false, since = null } = {}) {
  const startTime = Date.now();
  const syncType = full ? 'full' : 'incremental';
  const syncId = await startSyncLog('estimates', syncType);

  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const tenantId = config.serviceTitan.tenantId;
    // Use sales/estimates endpoint instead of jpm/estimates
    const baseUrl = `${config.serviceTitan.apiBaseUrl}/sales/v2/tenant/${tenantId}/estimates`;

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

      logger.debug(`Fetching estimates page ${page}...`);
      const response = await stRequest(baseUrl, { query: pageQuery });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const estimates = response.data.data || [];
      stats.fetched += estimates.length;

      for (const estimate of estimates) {
        try {
          const result = await upsertEstimate(estimate);
          if (result.created) {
            stats.created++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          logger.error('Failed to upsert estimate', {
            estimateId: estimate.id,
            error: error.message
          });
          stats.failed++;
        }
      }

      hasMore = response.data.hasMore || false;
      continuationToken = response.data.continueFrom;
      page++;

      await delay(100);

      if (page % 10 === 0) {
        logger.info(`Synced ${stats.fetched} estimates so far...`);
      }
    }

    await completeSyncLog(syncId, stats, startTime);
    logger.info('Estimates sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Estimates sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a single estimate
 */
async function upsertEstimate(estimate) {
  const client = await getPool().connect();
  try {
    const existing = await client.query(
      'SELECT st_id FROM st_estimates WHERE st_id = $1',
      [estimate.id]
    );

    const isNew = existing.rows.length === 0;

    if (isNew) {
      await client.query(`
        INSERT INTO st_estimates (
          st_id, tenant_id, job_id, customer_id, location_id,
          estimate_number, name, status,
          subtotal, total, sold_on, sold_by,
          items, custom_fields, st_created_on, st_modified_on, full_data
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16, $17
        )
      `, [
        estimate.id,
        estimate.tenantId || config.serviceTitan.tenantId,
        estimate.jobId || null,
        estimate.customerId,
        estimate.locationId || null,
        estimate.jobNumber || String(estimate.id),
        estimate.name,
        typeof estimate.status === 'object' ? estimate.status.name : estimate.status,
        estimate.subtotal || 0,
        estimate.total || calculateTotal(estimate.items),
        estimate.soldOn ? new Date(estimate.soldOn) : null,
        estimate.soldBy || null,
        JSON.stringify(estimate.items || []),
        JSON.stringify(estimate.customFields || {}),
        estimate.createdOn ? new Date(estimate.createdOn) : null,
        estimate.modifiedOn ? new Date(estimate.modifiedOn) : null,
        JSON.stringify(estimate)
      ]);
    } else {
      await client.query(`
        UPDATE st_estimates SET
          status = $2,
          name = $3,
          subtotal = $4,
          total = $5,
          sold_on = $6,
          sold_by = $7,
          items = $8,
          custom_fields = $9,
          st_modified_on = $10,
          full_data = $11,
          local_synced_at = NOW()
        WHERE st_id = $1
      `, [
        estimate.id,
        typeof estimate.status === 'object' ? estimate.status.name : estimate.status,
        estimate.name,
        estimate.subtotal || 0,
        estimate.total || calculateTotal(estimate.items),
        estimate.soldOn ? new Date(estimate.soldOn) : null,
        estimate.soldBy || null,
        JSON.stringify(estimate.items || []),
        JSON.stringify(estimate.customFields || {}),
        estimate.modifiedOn ? new Date(estimate.modifiedOn) : null,
        JSON.stringify(estimate)
      ]);
    }

    return { created: isNew };
  } finally {
    client.release();
  }
}

export default { syncEstimates };
