/**
 * CRM Module Fetchers
 *
 * Fetchers for:
 * - raw_st_customers
 * - raw_st_customer_contacts
 * - raw_st_locations
 * - raw_st_location_contacts
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// CUSTOMERS FETCHER
// ============================================================================

export class CustomersFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_customers',
      endpoint: '/crm/v2/tenant/{tenant}/customers',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'active',
      'name',
      'type',
      'address',
      'custom_fields',
      'balance',
      'tax_exempt',
      'tag_type_ids',
      'do_not_mail',
      'do_not_service',
      'national_account',
      'created_by_id',
      'merged_to_id',
      'payment_term_id',
      'credit_limit',
      'credit_limit_balance',
      'external_data',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['tag_type_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      active: record.active ?? true,
      name: record.name,
      type: record.type,
      address: record.address || {},
      custom_fields: record.customFields || [],
      balance: record.balance || 0,
      tax_exempt: record.taxExempt ?? false,
      tag_type_ids: record.tagTypeIds || [],
      do_not_mail: record.doNotMail ?? false,
      do_not_service: record.doNotService ?? false,
      national_account: record.nationalAccount ?? false,
      created_by_id: record.createdById,
      merged_to_id: record.mergedToId,
      payment_term_id: record.paymentTermId,
      credit_limit: record.creditLimit,
      credit_limit_balance: record.creditLimitBalance,
      external_data: record.externalData,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }

  /**
   * Fetch only active customers
   */
  async fullSync() {
    return super.fullSync({ active: 'True' });
  }
}

// ============================================================================
// CUSTOMER CONTACTS FETCHER
// ============================================================================

export class CustomerContactsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_customer_contacts',
      endpoint: '/crm/v2/tenant/{tenant}/customers/contacts',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'customer_id',
      'type',
      'value',
      'memo',
      'phone_settings',
      'preferences',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getConflictColumn() {
    // Composite unique on st_id + customer_id
    return 'st_id, customer_id';
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      customer_id: record.customerId,
      type: record.type,
      value: record.value,
      memo: record.memo,
      phone_settings: record.phoneSettings,
      preferences: record.preferences,
      st_created_on: record.createdOn !== '0001-01-01T00:00:00Z' ? record.createdOn : null,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }

  /**
   * Override upsert to handle composite unique constraint
   */
  async upsertRecords(records) {
    if (records.length === 0) return { inserted: 0, updated: 0 };

    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const transformedBatch = batch.map(r => this.transformRecord(r));

        for (const record of transformedBatch) {
          const columns = this.getColumns();
          const values = columns.map(col => record[col]);
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

          const updateCols = columns.filter(c => !['st_id', 'customer_id', 'id'].includes(c));
          const updateSet = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');

          const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (st_id, customer_id)
            DO UPDATE SET ${updateSet}
            RETURNING (xmax = 0) AS inserted
          `;

          const result = await client.query(query, values);
          if (result.rows[0]?.inserted) {
            inserted++;
          } else {
            updated++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { inserted, updated };
  }

  /**
   * Fetch contacts modified in the last N years for initial sync
   */
  async fullSync() {
    // Contacts API requires modifiedOnOrAfter, use 10 years back for full sync
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    return super.fullSync({ modifiedOnOrAfter: tenYearsAgo.toISOString() });
  }
}

// ============================================================================
// LOCATIONS FETCHER
// ============================================================================

export class LocationsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_locations',
      endpoint: '/crm/v2/tenant/{tenant}/locations',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'customer_id',
      'active',
      'name',
      'address',
      'custom_fields',
      'created_by_id',
      'merged_to_id',
      'zone_id',
      'tax_zone_id',
      'tax_exempt',
      'tag_type_ids',
      'external_data',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['tag_type_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      customer_id: record.customerId,
      active: record.active ?? true,
      name: record.name,
      address: record.address || {},
      custom_fields: record.customFields || [],
      created_by_id: record.createdById,
      merged_to_id: record.mergedToId,
      zone_id: record.zoneId,
      tax_zone_id: record.taxZoneId,
      tax_exempt: record.taxExempt ?? false,
      tag_type_ids: record.tagTypeIds || [],
      external_data: record.externalData,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// LOCATION CONTACTS FETCHER
// ============================================================================

export class LocationContactsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_location_contacts',
      endpoint: '/crm/v2/tenant/{tenant}/locations/contacts',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'location_id',
      'type',
      'value',
      'memo',
      'phone_settings',
      'preferences',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      location_id: record.locationId,
      type: record.type,
      value: record.value,
      memo: record.memo,
      phone_settings: record.phoneSettings,
      preferences: record.preferences,
      st_created_on: record.createdOn !== '0001-01-01T00:00:00Z' ? record.createdOn : null,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }

  /**
   * Override upsert to handle composite unique constraint
   */
  async upsertRecords(records) {
    if (records.length === 0) return { inserted: 0, updated: 0 };

    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const transformedBatch = batch.map(r => this.transformRecord(r));

        for (const record of transformedBatch) {
          const columns = this.getColumns();
          const values = columns.map(col => record[col]);
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

          const updateCols = columns.filter(c => !['st_id', 'location_id', 'id'].includes(c));
          const updateSet = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');

          const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (st_id, location_id)
            DO UPDATE SET ${updateSet}
            RETURNING (xmax = 0) AS inserted
          `;

          const result = await client.query(query, values);
          if (result.rows[0]?.inserted) {
            inserted++;
          } else {
            updated++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { inserted, updated };
  }

  async fullSync() {
    // Use 10 years back to capture all historical contacts
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

    return super.fullSync({ modifiedOnOrAfter: tenYearsAgo.toISOString() });
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllCRM() {
  const results = {};

  const fetchers = [
    { name: 'customers', fetcher: new CustomersFetcher() },
    { name: 'customer_contacts', fetcher: new CustomerContactsFetcher() },
    { name: 'locations', fetcher: new LocationsFetcher() },
    { name: 'location_contacts', fetcher: new LocationContactsFetcher() },
  ];

  for (const { name, fetcher } of fetchers) {
    try {
      results[name] = await fetcher.fullSync();
    } catch (error) {
      results[name] = { success: false, error: error.message };
    } finally {
      await fetcher.close();
    }
  }

  return results;
}

export default {
  CustomersFetcher,
  CustomerContactsFetcher,
  LocationsFetcher,
  LocationContactsFetcher,
  syncAllCRM,
};
