/**
 * ST Customers Sync Worker
 * Pulls customers from ServiceTitan and syncs to local database
 *
 * Schedule: Every 15 minutes
 */

import { BaseWorker } from '../base.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';

const SCHEMA = 'servicetitan';

class STCustomersSyncWorker extends BaseWorker {
  constructor() {
    super('st-customers-sync', {
      schedule: '*/15 * * * *', // Every 15 minutes
      enabled: true,
      timeout: 600000 // 10 minutes
    });
  }

  async execute() {
    const client = await getPool().connect();
    let created = 0;
    let updated = 0;
    let failed = 0;

    try {
      // Get last sync time
      const lastSyncResult = await client.query(`
        SELECT last_sync_at FROM public.sync_state
        WHERE entity_type = 'st_customers'
      `);

      const lastSyncTime = lastSyncResult.rows[0]?.last_sync_at ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours

      await this.log('info', 'Fetching customers from ST', { since: lastSyncTime });

      // Fetch from ServiceTitan
      let page = 1;
      let hasMore = true;
      const pageSize = 200;

      while (hasMore) {
        const response = await stRequest(stEndpoints.crm.customers, {
          modifiedOnOrAfter: lastSyncTime,
          page,
          pageSize
        });

        const customers = response.data || [];

        if (customers.length === 0) {
          hasMore = false;
          break;
        }

        for (const customer of customers) {
          try {
            // Upsert customer
            const result = await client.query(`
              INSERT INTO ${SCHEMA}.st_customers (
                st_id, name, first_name, last_name,
                email, phone, address_line1, city, state, zip,
                st_created_on, st_modified_on, raw_data, synced_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
              ON CONFLICT (st_id) DO UPDATE SET
                name = EXCLUDED.name,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                address_line1 = EXCLUDED.address_line1,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                zip = EXCLUDED.zip,
                st_modified_on = EXCLUDED.st_modified_on,
                raw_data = EXCLUDED.raw_data,
                synced_at = NOW()
              RETURNING (xmax = 0) as is_insert
            `, [
              customer.id,
              customer.name,
              customer.firstName,
              customer.lastName,
              customer.email,
              customer.phone,
              customer.address?.street,
              customer.address?.city,
              customer.address?.state,
              customer.address?.zip,
              customer.createdOn,
              customer.modifiedOn,
              JSON.stringify(customer)
            ]);

            if (result.rows[0].is_insert) {
              created++;
            } else {
              updated++;
            }
          } catch (error) {
            failed++;
            await this.log('warn', 'Failed to sync customer', {
              customerId: customer.id,
              error: error.message
            });
          }
        }

        page++;
        hasMore = customers.length === pageSize;
      }

      // Update sync state
      await client.query(`
        UPDATE public.sync_state
        SET last_sync_at = NOW(),
            records_synced = records_synced + $1
        WHERE entity_type = 'st_customers'
      `, [created + updated]);

      return { created, updated, failed };
    } finally {
      client.release();
    }
  }
}

export default new STCustomersSyncWorker();
