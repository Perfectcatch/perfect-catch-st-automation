/**
 * Enhanced Jobs Sync Module
 * Syncs jobs with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, sleep, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class JobSync extends SyncBase {
  constructor() {
    super('jobs');
  }
  
  async fetchList() {
    // Fetch jobs from last 2 years
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    return fetchAllPages('/jpm/v2/tenant/{tenant}/jobs', {
      createdOnOrAfter: twoYearsAgo.toISOString()
    });
  }
  
  async enrichOne(job) {
    // Get full job details
    const details = await fetchDetails('/jpm/v2/tenant/{tenant}/jobs', job.id);
    
    if (!details) {
      return job;
    }
    
    // Get job history/notes
    let history = [];
    try {
      const historyData = await fetchDetails('/jpm/v2/tenant/{tenant}/jobs', `${job.id}/history`);
      history = historyData?.data || historyData || [];
    } catch (e) {
      // History may not be available
    }
    
    return {
      ...details,
      history,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(job) {
    return {
      st_id: BigInt(job.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // References
      customer_id: job.customerId ? BigInt(job.customerId) : null,
      location_id: job.locationId ? BigInt(job.locationId) : null,
      business_unit_id: job.businessUnitId ? BigInt(job.businessUnitId) : null,
      job_type_id: job.jobTypeId ? BigInt(job.jobTypeId) : null,
      campaign_id: job.campaignId ? BigInt(job.campaignId) : null,
      
      // Job info
      job_number: job.jobNumber || job.number || `J${job.id}`,
      summary: job.summary || job.name || null,
      job_status: job.jobStatus || job.status || 'Unknown',
      
      // Technician
      technician_id: job.technicianId ? BigInt(job.technicianId) : null,
      technician_name: job.technicianName || null,
      
      // Priority
      priority: job.priority || 'Normal',
      
      // Financials
      invoice_total: job.invoiceTotal || 0,
      balance: job.balance || 0,
      total_cost: job.totalCost || 0,
      
      // Tags and custom fields
      tag_type_ids: job.tagTypeIds || [],
      tags: job.tags || [],
      custom_fields: job.customFields || {},
      
      // Timestamps
      scheduled_start: job.scheduledStart ? new Date(job.scheduledStart) : null,
      scheduled_end: job.scheduledEnd ? new Date(job.scheduledEnd) : null,
      completed_on: job.completedOn ? new Date(job.completedOn) : null,
      job_completion_time: job.completedOn ? new Date(job.completedOn) : null,
      
      // ServiceTitan timestamps
      st_created_on: job.createdOn ? new Date(job.createdOn) : new Date(),
      st_modified_on: job.modifiedOn ? new Date(job.modifiedOn) : new Date(),
      
      // Store full data
      full_data: job,
      
      // Sync metadata
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(job) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_jobs WHERE st_id = $1',
        [job.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_jobs (
            st_id, tenant_id, customer_id, location_id, business_unit_id, job_type_id, campaign_id,
            job_number, summary, job_status,
            technician_id, technician_name, priority,
            invoice_total, balance, total_cost,
            tag_type_ids, tags, custom_fields,
            scheduled_start, scheduled_end, completed_on, job_completion_time,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16,
            $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27
          )
        `, [
          job.st_id,
          job.tenant_id,
          job.customer_id,
          job.location_id,
          job.business_unit_id,
          job.job_type_id,
          job.campaign_id,
          job.job_number,
          job.summary,
          job.job_status,
          job.technician_id,
          job.technician_name,
          job.priority,
          job.invoice_total,
          job.balance,
          job.total_cost,
          job.tag_type_ids,
          JSON.stringify(job.tags),
          JSON.stringify(job.custom_fields),
          job.scheduled_start,
          job.scheduled_end,
          job.completed_on,
          job.job_completion_time,
          job.st_created_on,
          job.st_modified_on,
          JSON.stringify(job.full_data),
          job.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_jobs SET
            customer_id = $2, location_id = $3, business_unit_id = $4, job_type_id = $5, campaign_id = $6,
            job_number = $7, summary = $8, job_status = $9,
            technician_id = $10, technician_name = $11, priority = $12,
            invoice_total = $13, balance = $14, total_cost = $15,
            tag_type_ids = $16, tags = $17, custom_fields = $18,
            scheduled_start = $19, scheduled_end = $20, completed_on = $21, job_completion_time = $22,
            st_modified_on = $23, full_data = $24, last_synced_at = $25
          WHERE st_id = $1
        `, [
          job.st_id,
          job.customer_id,
          job.location_id,
          job.business_unit_id,
          job.job_type_id,
          job.campaign_id,
          job.job_number,
          job.summary,
          job.job_status,
          job.technician_id,
          job.technician_name,
          job.priority,
          job.invoice_total,
          job.balance,
          job.total_cost,
          job.tag_type_ids,
          JSON.stringify(job.tags),
          JSON.stringify(job.custom_fields),
          job.scheduled_start,
          job.scheduled_end,
          job.completed_on,
          job.job_completion_time,
          job.st_modified_on,
          JSON.stringify(job.full_data),
          job.last_synced_at
        ]);
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
  
  async postProcess() {
    this.logger.info('[jobs] Updating business unit statistics...');
    
    const client = await getPool().connect();
    try {
      await client.query(`
        UPDATE st_business_units bu
        SET 
          total_jobs = COALESCE(stats.job_count, 0),
          active_jobs = COALESCE(stats.active_count, 0)
        FROM (
          SELECT 
            business_unit_id,
            COUNT(*) as job_count,
            COUNT(CASE WHEN job_status IN ('Scheduled', 'InProgress', 'Dispatched') THEN 1 END) as active_count
          FROM st_jobs
          WHERE business_unit_id IS NOT NULL
          GROUP BY business_unit_id
        ) stats
        WHERE bu.st_id = stats.business_unit_id
      `);
    } finally {
      client.release();
    }
  }
}

export const jobSync = new JobSync();

export async function syncJobs() {
  return jobSync.run();
}

export default { JobSync, syncJobs };
