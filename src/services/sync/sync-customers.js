/**
 * Customer Sync Module
 * Syncs customers from ServiceTitan to local database
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-customers');

/**
 * Sync customers from ServiceTitan
 */
export async function syncCustomers({ full = false, since = null } = {}) {
  const startTime = Date.now();
  const syncType = full ? 'full' : 'incremental';
  const syncId = await startSyncLog('customers', syncType);

  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const tenantId = config.serviceTitan.tenantId;
    const baseUrl = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/customers`;

    // Build query parameters
    const query = {
      pageSize: 500,
      includeTotal: true
    };

    if (since && !full) {
      query.modifiedOnOrAfter = since.toISOString();
    }

    // Paginate through all customers
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

      logger.debug(`Fetching customers page ${page}...`);
      const response = await stRequest(baseUrl, { query: pageQuery });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const customers = response.data.data || [];
      stats.fetched += customers.length;

      // Upsert each customer
      for (const customer of customers) {
        try {
          const result = await upsertCustomer(customer);
          if (result.created) {
            stats.created++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          logger.error('Failed to upsert customer', {
            customerId: customer.id,
            error: error.message
          });
          stats.failed++;
        }
      }

      // Check for more pages
      hasMore = response.data.hasMore || false;
      continuationToken = response.data.continueFrom;
      page++;

      // Rate limiting
      await delay(100);

      // Progress logging
      if (page % 10 === 0) {
        logger.info(`Synced ${stats.fetched} customers so far...`);
      }
    }

    await completeSyncLog(syncId, stats, startTime);
    logger.info('Customer sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Customer sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a single customer
 */
async function upsertCustomer(customer) {
  const client = await getPool().connect();
  try {
    // Check if exists
    const existing = await client.query(
      'SELECT st_id FROM st_customers WHERE st_id = $1',
      [customer.id]
    );

    const isNew = existing.rows.length === 0;

    if (isNew) {
      await client.query(`
        INSERT INTO st_customers (
          st_id, tenant_id, name, type, email, phone,
          phone_numbers, email_addresses,
          address_line1, city, state, zip, country, addresses,
          balance, active, do_not_service, do_not_mail,
          tag_type_ids, tags, custom_fields,
          st_created_on, st_modified_on, full_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8,
          $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, $21,
          $22, $23, $24
        )
      `, [
        customer.id,
        customer.tenantId || config.serviceTitan.tenantId,
        customer.name,
        customer.type,
        customer.email,
        customer.phoneNumbers?.[0]?.number,
        JSON.stringify(customer.phoneNumbers || []),
        JSON.stringify(customer.emails || []),
        customer.address?.street,
        customer.address?.city,
        customer.address?.state,
        customer.address?.zip,
        customer.address?.country,
        JSON.stringify(customer.addresses || []),
        customer.balance || 0,
        customer.active !== false,
        customer.doNotService || false,
        customer.doNotMail || false,
        customer.tagTypeIds || [],
        JSON.stringify(customer.tags || []),
        JSON.stringify(customer.customFields || {}),
        customer.createdOn ? new Date(customer.createdOn) : null,
        customer.modifiedOn ? new Date(customer.modifiedOn) : null,
        JSON.stringify(customer)
      ]);
    } else {
      await client.query(`
        UPDATE st_customers SET
          name = $2,
          type = $3,
          email = $4,
          phone = $5,
          phone_numbers = $6,
          email_addresses = $7,
          address_line1 = $8,
          city = $9,
          state = $10,
          zip = $11,
          balance = $12,
          active = $13,
          do_not_service = $14,
          do_not_mail = $15,
          tag_type_ids = $16,
          tags = $17,
          custom_fields = $18,
          st_modified_on = $19,
          full_data = $20,
          local_synced_at = NOW()
        WHERE st_id = $1
      `, [
        customer.id,
        customer.name,
        customer.type,
        customer.email,
        customer.phoneNumbers?.[0]?.number,
        JSON.stringify(customer.phoneNumbers || []),
        JSON.stringify(customer.emails || []),
        customer.address?.street,
        customer.address?.city,
        customer.address?.state,
        customer.address?.zip,
        customer.balance || 0,
        customer.active !== false,
        customer.doNotService || false,
        customer.doNotMail || false,
        customer.tagTypeIds || [],
        JSON.stringify(customer.tags || []),
        JSON.stringify(customer.customFields || {}),
        customer.modifiedOn ? new Date(customer.modifiedOn) : null,
        JSON.stringify(customer)
      ]);
    }

    return { created: isNew };
  } finally {
    client.release();
  }
}

export default { syncCustomers };
