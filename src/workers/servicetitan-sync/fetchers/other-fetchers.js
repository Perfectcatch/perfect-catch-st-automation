/**
 * Other Module Fetchers
 *
 * Fetchers for:
 * - Dispatch: raw_st_appointment_assignments, raw_st_teams, raw_st_zones
 * - Marketing: raw_st_campaigns
 * - Equipment: raw_st_installed_equipment
 * - Sales: raw_st_estimates
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// DISPATCH MODULE
// ============================================================================

export class AppointmentAssignmentsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_appointment_assignments',
      endpoint: '/dispatch/v2/tenant/{tenant}/appointment-assignments',
    });
  }

  getColumns() {
    return [
      'tenant_id',
      'appointment_id',
      'technician_id',
      'assigned_on',
      'fetched_at',
      'full_data',
    ];
  }

  getConflictColumn() {
    return 'appointment_id, technician_id';
  }

  transformRecord(record) {
    return {
      tenant_id: this.tenantId,
      appointment_id: record.appointmentId,
      technician_id: record.technicianId,
      assigned_on: record.assignedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }

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

          const updateCols = columns.filter(c => !['appointment_id', 'technician_id', 'id'].includes(c));
          const updateSet = updateCols.map(col => `${col} = EXCLUDED.${col}`).join(', ');

          const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (appointment_id, technician_id)
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
}

export class TeamsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_teams',
      endpoint: '/dispatch/v2/tenant/{tenant}/teams',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      active: record.active ?? true,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

export class ZonesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_zones',
      endpoint: '/dispatch/v2/tenant/{tenant}/zones',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      active: record.active ?? true,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// MARKETING MODULE
// ============================================================================

export class CampaignsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_campaigns',
      endpoint: '/marketing/v2/tenant/{tenant}/campaigns',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'category_id',
      'code',
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
      name: record.name,
      active: record.active ?? true,
      category_id: record.categoryId,
      code: record.code,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// EQUIPMENT SYSTEMS MODULE
// ============================================================================

export class InstalledEquipmentFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_installed_equipment',
      endpoint: '/equipmentsystems/v2/tenant/{tenant}/installed-equipment',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'active',
      'equipment_id',
      'location_id',
      'customer_id',
      'invoice_item_id',
      'name',
      'type',
      'installed_on',
      'serial_number',
      'barcode_id',
      'memo',
      'manufacturer',
      'model',
      'cost',
      'status',
      'manufacturer_warranty_start',
      'manufacturer_warranty_end',
      'service_warranty_start',
      'service_warranty_end',
      'tags',
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
      active: record.active ?? true,
      equipment_id: record.equipmentId,
      location_id: record.locationId,
      customer_id: record.customerId,
      invoice_item_id: record.invoiceItemId,
      name: record.name,
      type: record.type,
      installed_on: record.installedOn,
      serial_number: record.serialNumber,
      barcode_id: record.barcodeId,
      memo: record.memo,
      manufacturer: record.manufacturer,
      model: record.model,
      cost: record.cost || 0,
      status: record.status,
      manufacturer_warranty_start: record.manufacturerWarrantyStart,
      manufacturer_warranty_end: record.manufacturerWarrantyEnd,
      service_warranty_start: record.serviceProviderWarrantyStart,
      service_warranty_end: record.serviceProviderWarrantyEnd,
      tags: record.tags || [],
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// SALES MODULE
// ============================================================================

export class EstimatesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_estimates',
      endpoint: '/sales/v2/tenant/{tenant}/estimates',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_id',
      'project_id',
      'location_id',
      'customer_id',
      'name',
      'job_number',
      'status',
      'review_status',
      'summary',
      'sold_on',
      'sold_by',
      'active',
      'items',
      'subtotal',
      'tax',
      'business_unit_id',
      'business_unit_name',
      'external_links',
      'is_recommended',
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
      job_id: record.jobId,
      project_id: record.projectId,
      location_id: record.locationId,
      customer_id: record.customerId,
      name: record.name,
      job_number: record.jobNumber,
      status: record.status,
      review_status: record.reviewStatus,
      summary: record.summary,
      sold_on: record.soldOn,
      sold_by: record.soldBy,
      active: record.active ?? true,
      items: record.items || [],
      subtotal: record.subtotal || 0,
      tax: record.tax || 0,
      business_unit_id: record.businessUnitId,
      business_unit_name: record.businessUnitName,
      external_links: record.externalLinks || [],
      is_recommended: record.isRecommended ?? false,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllDispatch() {
  const results = {};

  const fetchers = [
    { name: 'teams', fetcher: new TeamsFetcher() },
    { name: 'zones', fetcher: new ZonesFetcher() },
    { name: 'appointment_assignments', fetcher: new AppointmentAssignmentsFetcher() },
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

export async function syncAllOther() {
  const results = {};

  const fetchers = [
    { name: 'campaigns', fetcher: new CampaignsFetcher() },
    { name: 'installed_equipment', fetcher: new InstalledEquipmentFetcher() },
    { name: 'estimates', fetcher: new EstimatesFetcher() },
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
  AppointmentAssignmentsFetcher,
  TeamsFetcher,
  ZonesFetcher,
  CampaignsFetcher,
  InstalledEquipmentFetcher,
  EstimatesFetcher,
  syncAllDispatch,
  syncAllOther,
};
