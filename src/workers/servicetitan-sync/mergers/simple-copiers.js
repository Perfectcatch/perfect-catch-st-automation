/**
 * Simple Copiers
 *
 * These are simple merge workers that copy data from raw tables
 * to main tables with minimal transformation. Used for reference
 * data tables that don't need complex merging.
 *
 * Tables:
 * - st_business_units (from raw_st_business_units)
 * - st_campaigns (from raw_st_campaigns)
 * - st_job_types (from raw_st_job_types)
 * - st_tag_types (from raw_st_tag_types)
 * - st_estimates (from raw_st_estimates)
 * - st_appointments (from raw_st_appointments)
 * - st_payments (from raw_st_payments)
 * - st_installed_equipment (from raw_st_installed_equipment)
 */

import { BaseMerger } from './base-merger.js';

// ============================================================================
// BUSINESS UNITS COPIER
// ============================================================================

export class BusinessUnitsCopier extends BaseMerger {
  constructor() {
    super({
      name: 'BusinessUnitsCopier',
      targetTable: 'st_business_units',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        name,
        official_name,
        COALESCE(active, true) as active,
        st_created_on,
        st_modified_on,
        full_data
      FROM raw_st_business_units
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'official_name',
      'active',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// CAMPAIGNS COPIER
// ============================================================================

export class CampaignsCopier extends BaseMerger {
  constructor() {
    super({
      name: 'CampaignsCopier',
      targetTable: 'st_campaigns',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        name,
        category_id,
        COALESCE(active, true) as active,
        st_created_on,
        st_modified_on,
        full_data
      FROM raw_st_campaigns
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'category_id',
      'active',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// JOB TYPES COPIER
// ============================================================================

export class JobTypesCopier extends BaseMerger {
  constructor() {
    super({
      name: 'JobTypesCopier',
      targetTable: 'st_job_types',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        name,
        COALESCE(active, true) as active,
        full_data
      FROM raw_st_job_types
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// TAG TYPES COPIER
// ============================================================================

export class TagTypesCopier extends BaseMerger {
  constructor() {
    super({
      name: 'TagTypesCopier',
      targetTable: 'st_tag_types',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        name,
        COALESCE(active, true) as active,
        full_data
      FROM raw_st_tag_types
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// ESTIMATES COPIER
// ============================================================================

export class EstimatesCopier extends BaseMerger {
  constructor() {
    super({
      name: 'EstimatesCopier',
      targetTable: 'st_estimates',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        job_id,
        customer_id,
        location_id,
        job_number as estimate_number,
        name,
        status,
        sold_by,
        sold_on,
        subtotal,
        (subtotal + COALESCE(tax, 0)) as total,
        items,
        st_created_on,
        st_modified_on,
        full_data
      FROM raw_st_estimates
      WHERE job_id IS NOT NULL
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_id',
      'customer_id',
      'location_id',
      'estimate_number',
      'name',
      'status',
      'sold_by',
      'sold_on',
      'subtotal',
      'total',
      'items',
      'custom_fields',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['items', 'custom_fields', 'full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      items: row.items || [],
      custom_fields: {}, // raw_st_estimates doesn't have custom_fields
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// APPOINTMENTS COPIER
// ============================================================================

export class AppointmentsCopier extends BaseMerger {
  constructor() {
    super({
      name: 'AppointmentsCopier',
      targetTable: 'st_appointments',
    });
  }

  getMergeQuery() {
    return `
      WITH tech_assignments AS (
        SELECT
          appointment_id,
          array_agg(technician_id) as technician_ids
        FROM raw_st_appointment_assignments
        GROUP BY appointment_id
      )
      SELECT
        a.st_id,
        a.tenant_id,
        a.job_id,
        a.status,
        a.start_time as start_on,
        a.end_time as end_on,
        a.arrival_window_start,
        a.arrival_window_end,
        COALESCE(ta.technician_ids, ARRAY[]::bigint[]) as technician_ids,
        a.st_created_on,
        a.st_modified_on,
        a.full_data
      FROM raw_st_appointments a
      LEFT JOIN tech_assignments ta ON ta.appointment_id = a.st_id
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_id',
      'status',
      'start_on',
      'end_on',
      'arrival_window_start',
      'arrival_window_end',
      'technician_ids',
      'custom_fields',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['custom_fields', 'full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      technician_ids: row.technician_ids || [],
      custom_fields: {}, // raw_st_appointments doesn't have custom_fields
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// PAYMENTS COPIER
// ============================================================================

export class PaymentsCopier extends BaseMerger {
  constructor() {
    super({
      name: 'PaymentsCopier',
      targetTable: 'st_payments',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        (customer->>'id')::bigint as customer_id,
        (SELECT (elem->>'invoiceId')::bigint
         FROM jsonb_array_elements(applied_to) as elem
         LIMIT 1) as invoice_id,
        reference_number as payment_number,
        payment_type,
        type_id as payment_method,
        sync_status as status,
        total as amount,
        unapplied_amount,
        payment_date::date as payment_date,
        st_created_on,
        st_modified_on,
        full_data
      FROM raw_st_payments
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'customer_id',
      'invoice_id',
      'payment_number',
      'payment_type',
      'payment_method',
      'status',
      'amount',
      'unapplied_amount',
      'payment_date',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// INSTALLED EQUIPMENT COPIER
// ============================================================================

export class InstalledEquipmentCopier extends BaseMerger {
  constructor() {
    super({
      name: 'InstalledEquipmentCopier',
      targetTable: 'st_installed_equipment',
    });
  }

  getMergeQuery() {
    return `
      SELECT
        st_id,
        tenant_id,
        location_id,
        equipment_id as equipment_type_id,
        name,
        manufacturer,
        model,
        serial_number,
        installed_on as install_date,
        st_created_on,
        st_modified_on,
        full_data
      FROM raw_st_installed_equipment
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'location_id',
      'equipment_type_id',
      'name',
      'manufacturer',
      'model',
      'serial_number',
      'install_date',
      'st_created_on',
      'st_modified_on',
      'full_data',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['full_data'];
  }

  transformRow(row) {
    return {
      ...row,
      local_synced_at: new Date(),
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function runBusinessUnitsCopy() {
  const copier = new BusinessUnitsCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runCampaignsCopy() {
  const copier = new CampaignsCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runJobTypesCopy() {
  const copier = new JobTypesCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runTagTypesCopy() {
  const copier = new TagTypesCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runEstimatesCopy() {
  const copier = new EstimatesCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runAppointmentsCopy() {
  const copier = new AppointmentsCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runPaymentsCopy() {
  const copier = new PaymentsCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

export async function runInstalledEquipmentCopy() {
  const copier = new InstalledEquipmentCopier();
  try {
    return await copier.fullMerge();
  } finally {
    await copier.close();
  }
}

/**
 * Run all reference data copies
 */
export async function runAllReferenceCopies() {
  const results = {};

  results.business_units = await runBusinessUnitsCopy();
  results.campaigns = await runCampaignsCopy();
  results.job_types = await runJobTypesCopy();
  results.tag_types = await runTagTypesCopy();

  return results;
}

export default {
  BusinessUnitsCopier,
  CampaignsCopier,
  JobTypesCopier,
  TagTypesCopier,
  EstimatesCopier,
  AppointmentsCopier,
  PaymentsCopier,
  InstalledEquipmentCopier,
  runAllReferenceCopies,
};
