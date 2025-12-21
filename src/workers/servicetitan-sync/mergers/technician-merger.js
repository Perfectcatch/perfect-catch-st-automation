/**
 * Technician Merge Worker
 *
 * Combines data from:
 * - raw_st_technicians (base technician data)
 * - raw_st_appointment_assignments + raw_st_jobs (for job counts)
 * - raw_st_invoices (for revenue stats)
 *
 * Into: st_technicians
 */

import { BaseMerger } from './base-merger.js';

export class TechnicianMerger extends BaseMerger {
  constructor() {
    super({
      name: 'TechnicianMerger',
      targetTable: 'st_technicians',
    });
  }

  getMergeQuery() {
    return `
      WITH tech_job_stats AS (
        SELECT
          aa.technician_id,
          COUNT(DISTINCT j.st_id) as total_jobs,
          COUNT(DISTINCT CASE WHEN j.job_status = 'Completed' THEN j.st_id END) as completed_jobs
        FROM raw_st_appointment_assignments aa
        JOIN raw_st_appointments a ON a.st_id = aa.appointment_id
        JOIN raw_st_jobs j ON j.st_id = a.job_id
        GROUP BY aa.technician_id
      ),
      tech_revenue AS (
        SELECT
          aa.technician_id,
          SUM(i.total) as total_revenue
        FROM raw_st_appointment_assignments aa
        JOIN raw_st_appointments a ON a.st_id = aa.appointment_id
        JOIN raw_st_invoices i ON (i.job->>'id')::bigint = a.job_id
        GROUP BY aa.technician_id
      )
      SELECT
        t.st_id,
        t.tenant_id,
        t.name,
        (t.full_data->>'userId')::text as employee_id,
        t.full_data->>'email' as email,
        t.full_data->>'phoneNumber' as phone,
        t.business_unit_id,
        COALESCE(t.active, true) as active,
        COALESCE(tjs.total_jobs, 0) as total_jobs,
        COALESCE(tjs.completed_jobs, 0) as completed_jobs,
        COALESCE(tr.total_revenue, 0) as total_revenue,
        t.st_created_on,
        t.st_modified_on,
        t.full_data
      FROM raw_st_technicians t
      LEFT JOIN tech_job_stats tjs ON tjs.technician_id = t.st_id
      LEFT JOIN tech_revenue tr ON tr.technician_id = t.st_id
    `;
  }

  getTargetColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'employee_id',
      'email',
      'phone',
      'business_unit_id',
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
      st_id: row.st_id,
      tenant_id: row.tenant_id,
      name: row.name,
      employee_id: row.employee_id,
      email: row.email,
      phone: row.phone,
      business_unit_id: row.business_unit_id,
      active: row.active,
      st_created_on: row.st_created_on,
      st_modified_on: row.st_modified_on,
      full_data: {
        ...row.full_data,
        // Add computed stats to full_data for reference
        _merged: {
          total_jobs: row.total_jobs,
          completed_jobs: row.completed_jobs,
          total_revenue: row.total_revenue,
        }
      },
      local_synced_at: new Date(),
    };
  }
}

/**
 * Convenience function to run technician merge
 */
export async function runTechnicianMerge(options = {}) {
  const merger = new TechnicianMerger();
  try {
    if (options.incremental) {
      return await merger.incrementalMerge(options.since);
    }
    return await merger.fullMerge();
  } finally {
    await merger.close();
  }
}

export default TechnicianMerger;
