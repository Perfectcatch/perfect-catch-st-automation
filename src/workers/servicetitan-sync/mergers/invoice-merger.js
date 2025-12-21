/**
 * Invoice Merge Worker
 *
 * Combines data from:
 * - raw_st_invoices (base invoice data)
 * - raw_st_payments (payment info)
 *
 * Into: st_invoices
 */

import { BaseMerger } from './base-merger.js';

export class InvoiceMerger extends BaseMerger {
  constructor() {
    super({
      name: 'InvoiceMerger',
      targetTable: 'st_invoices',
    });
  }

  getMergeQuery() {
    return `
      WITH invoice_payments AS (
        SELECT
          (elem->>'appliedTo')::bigint as invoice_id,
          SUM((elem->>'appliedAmount')::numeric) as paid_amount,
          COUNT(*) as payment_count,
          MAX(p.payment_date) as last_payment_date
        FROM raw_st_payments p,
          jsonb_array_elements(p.applied_to) as elem
        WHERE p.sync_status IS NULL OR p.sync_status != 'Voided'
        GROUP BY (elem->>'appliedTo')::bigint
      )
      SELECT
        i.st_id,
        i.tenant_id,
        (i.job->>'id')::bigint as job_id,
        (i.customer->>'id')::bigint as customer_id,
        (i.location->>'id')::bigint as location_id,
        (i.business_unit->>'id')::bigint as business_unit_id,
        i.reference_number as invoice_number,
        i.sync_status as status,
        i.invoice_date,
        i.due_date,
        i.subtotal,
        i.total,
        i.balance,
        i.items,
        i.custom_fields,
        COALESCE(ip.paid_amount, 0) as paid_amount,
        COALESCE(ip.payment_count, 0) as payment_count,
        ip.last_payment_date,
        i.st_created_on,
        i.st_modified_on,
        i.full_data
      FROM raw_st_invoices i
      LEFT JOIN invoice_payments ip ON ip.invoice_id = i.st_id
      WHERE (i.job->>'id') IS NOT NULL
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_id',
      'customer_id',
      'location_id',
      'business_unit_id',
      'invoice_number',
      'status',
      'invoice_date',
      'due_date',
      'subtotal',
      'total',
      'balance',
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
    // custom_fields from API is an array, but target table expects object
    let customFields = {};
    if (Array.isArray(row.custom_fields)) {
      for (const field of row.custom_fields) {
        if (field && field.name) {
          customFields[field.name] = field.value;
        }
      }
    } else if (row.custom_fields && typeof row.custom_fields === 'object') {
      customFields = row.custom_fields;
    }

    return {
      st_id: row.st_id,
      tenant_id: row.tenant_id,
      job_id: row.job_id,
      customer_id: row.customer_id,
      location_id: row.location_id,
      business_unit_id: row.business_unit_id,
      invoice_number: row.invoice_number,
      status: row.status,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      subtotal: row.subtotal || 0,
      total: row.total || 0,
      balance: row.balance || 0,
      items: row.items || [],
      custom_fields: customFields,
      full_data: {
        ...row.full_data,
        // Add payment summary to full_data for reference
        _merged: {
          paid_amount: row.paid_amount,
          payment_count: row.payment_count,
          last_payment_date: row.last_payment_date,
        }
      },
      st_created_on: row.st_created_on,
      st_modified_on: row.st_modified_on,
      local_synced_at: new Date(),
    };
  }
}

/**
 * Convenience function to run invoice merge
 */
export async function runInvoiceMerge(options = {}) {
  const merger = new InvoiceMerger();
  try {
    if (options.incremental) {
      return await merger.incrementalMerge(options.since);
    }
    return await merger.fullMerge();
  } finally {
    await merger.close();
  }
}

export default InvoiceMerger;
