/**
 * Invoices Sync Module
 * Syncs invoices from ServiceTitan to local database
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-invoices');

/**
 * Sync invoices from ServiceTitan
 */
export async function syncInvoices({ full = false, since = null } = {}) {
  const startTime = Date.now();
  const syncType = full ? 'full' : 'incremental';
  const syncId = await startSyncLog('invoices', syncType);

  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const tenantId = config.serviceTitan.tenantId;
    const baseUrl = `${config.serviceTitan.apiBaseUrl}/accounting/v2/tenant/${tenantId}/invoices`;

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

      logger.debug(`Fetching invoices page ${page}...`);
      const response = await stRequest(baseUrl, { query: pageQuery });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const invoices = response.data.data || [];
      stats.fetched += invoices.length;

      for (const invoice of invoices) {
        try {
          const result = await upsertInvoice(invoice);
          if (result.created) {
            stats.created++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          logger.error('Failed to upsert invoice', {
            invoiceId: invoice.id,
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
        logger.info(`Synced ${stats.fetched} invoices so far...`);
      }
    }

    await completeSyncLog(syncId, stats, startTime);
    logger.info('Invoices sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Invoices sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a single invoice
 */
async function upsertInvoice(invoice) {
  const client = await getPool().connect();
  try {
    const existing = await client.query(
      'SELECT st_id FROM st_invoices WHERE st_id = $1',
      [invoice.id]
    );

    const isNew = existing.rows.length === 0;

    if (isNew) {
      await client.query(`
        INSERT INTO st_invoices (
          st_id, tenant_id, job_id, customer_id, location_id, business_unit_id,
          invoice_number, status, invoice_date, due_date,
          subtotal, total, balance,
          items, custom_fields, st_created_on, st_modified_on, full_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17, $18
        )
      `, [
        invoice.id,
        invoice.tenantId || config.serviceTitan.tenantId,
        invoice.job?.id || invoice.jobId || null,
        invoice.customer?.id || invoice.customerId,
        invoice.location?.id || invoice.locationId || null,
        invoice.businessUnit?.id || invoice.businessUnitId || null,
        invoice.referenceNumber || String(invoice.id),
        invoice.syncStatus || 'Unknown',
        invoice.invoiceDate ? new Date(invoice.invoiceDate) : null,
        invoice.dueDate ? new Date(invoice.dueDate) : null,
        parseFloat(invoice.subTotal) || 0,
        parseFloat(invoice.total) || 0,
        parseFloat(invoice.balance) || 0,
        JSON.stringify(invoice.items || []),
        JSON.stringify(invoice.customFields || {}),
        invoice.createdOn ? new Date(invoice.createdOn) : null,
        invoice.modifiedOn ? new Date(invoice.modifiedOn) : null,
        JSON.stringify(invoice)
      ]);
    } else {
      await client.query(`
        UPDATE st_invoices SET
          status = $2,
          subtotal = $3,
          total = $4,
          balance = $5,
          due_date = $6,
          items = $7,
          custom_fields = $8,
          st_modified_on = $9,
          full_data = $10,
          local_synced_at = NOW()
        WHERE st_id = $1
      `, [
        invoice.id,
        invoice.syncStatus || 'Unknown',
        parseFloat(invoice.subTotal) || 0,
        parseFloat(invoice.total) || 0,
        parseFloat(invoice.balance) || 0,
        invoice.dueDate ? new Date(invoice.dueDate) : null,
        JSON.stringify(invoice.items || []),
        JSON.stringify(invoice.customFields || {}),
        invoice.modifiedOn ? new Date(invoice.modifiedOn) : null,
        JSON.stringify(invoice)
      ]);
    }

    return { created: isNew };
  } finally {
    client.release();
  }
}

export default { syncInvoices };
