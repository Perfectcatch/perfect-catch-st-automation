/**
 * Job Merge Worker
 *
 * Combines data from:
 * - raw_st_jobs (base job data)
 * - raw_st_appointments (scheduled times)
 * - raw_st_appointment_assignments (technician assignments)
 * - raw_st_technicians (technician names)
 *
 * Into: st_jobs
 */

import { BaseMerger } from './base-merger.js';

export class JobMerger extends BaseMerger {
  constructor() {
    super({
      name: 'JobMerger',
      targetTable: 'st_jobs',
    });
  }

  getMergeQuery() {
    return `
      WITH latest_appointments AS (
        SELECT DISTINCT ON (job_id)
          job_id,
          st_id as appointment_id,
          start_time,
          end_time,
          status as appointment_status
        FROM raw_st_appointments
        ORDER BY job_id, start_time DESC NULLS LAST
      ),
      appointment_techs AS (
        SELECT
          aa.appointment_id,
          array_agg(DISTINCT aa.technician_id) as technician_ids,
          (
            SELECT t.name
            FROM raw_st_technicians t
            WHERE t.st_id = (
              SELECT technician_id
              FROM raw_st_appointment_assignments
              WHERE appointment_id = aa.appointment_id
              LIMIT 1
            )
          ) as primary_technician_name,
          (
            SELECT technician_id
            FROM raw_st_appointment_assignments
            WHERE appointment_id = aa.appointment_id
            LIMIT 1
          ) as primary_technician_id
        FROM raw_st_appointment_assignments aa
        GROUP BY aa.appointment_id
      ),
      job_invoices AS (
        SELECT
          (job->>'id')::bigint as job_id,
          SUM(total) as invoice_total,
          SUM(balance) as balance
        FROM raw_st_invoices
        GROUP BY (job->>'id')::bigint
      )
      SELECT
        j.st_id,
        j.tenant_id,
        j.job_number,
        j.customer_id,
        j.location_id,
        j.business_unit_id,
        j.job_type_id,
        j.campaign_id,
        j.summary,
        j.job_status,
        j.completed_on as job_completion_time,
        COALESCE(ji.invoice_total, 0) as invoice_total,
        COALESCE(ji.balance, 0) as balance,
        j.tag_type_ids,
        j.custom_fields,
        la.start_time as scheduled_start,
        la.end_time as scheduled_end,
        COALESCE(at.technician_ids, ARRAY[]::bigint[]) as technician_ids,
        at.primary_technician_id,
        at.primary_technician_name,
        j.st_created_on,
        j.st_modified_on,
        j.full_data
      FROM raw_st_jobs j
      LEFT JOIN latest_appointments la ON la.job_id = j.st_id
      LEFT JOIN appointment_techs at ON at.appointment_id = la.appointment_id
      LEFT JOIN job_invoices ji ON ji.job_id = j.st_id
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_number',
      'customer_id',
      'location_id',
      'business_unit_id',
      'job_type_id',
      'campaign_id',
      'summary',
      'job_status',
      'job_completion_time',
      'invoice_total',
      'balance',
      'tag_type_ids',
      'custom_fields',
      'full_data',
      'st_created_on',
      'st_modified_on',
      'local_synced_at',
    ];
  }

  getJsonbColumns() {
    return ['custom_fields', 'full_data'];
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

    // Map the query columns to target columns
    return {
      st_id: row.st_id,
      tenant_id: row.tenant_id,
      job_number: row.job_number,
      customer_id: row.customer_id,
      location_id: row.location_id,
      business_unit_id: row.business_unit_id,
      job_type_id: row.job_type_id,
      campaign_id: row.campaign_id,
      summary: row.summary,
      job_status: row.job_status,
      job_completion_time: row.job_completion_time,
      invoice_total: row.invoice_total || 0,
      balance: row.balance || 0,
      tag_type_ids: row.tag_type_ids || [],
      custom_fields: customFields,
      full_data: {
        ...row.full_data,
        // Add merged data to full_data for reference
        _merged: {
          scheduled_start: row.scheduled_start,
          scheduled_end: row.scheduled_end,
          technician_ids: row.technician_ids,
          primary_technician_id: row.primary_technician_id,
          primary_technician_name: row.primary_technician_name,
        }
      },
      st_created_on: row.st_created_on,
      st_modified_on: row.st_modified_on,
      local_synced_at: new Date(),
    };
  }
}

/**
 * Convenience function to run job merge
 */
export async function runJobMerge(options = {}) {
  const merger = new JobMerger();
  try {
    if (options.incremental) {
      return await merger.incrementalMerge(options.since);
    }
    return await merger.fullMerge();
  } finally {
    await merger.close();
  }
}

export default JobMerger;
