/**
 * ST Jobs Sync Worker
 * Pulls jobs from ServiceTitan and syncs to local database
 *
 * Schedule: Every 10 minutes
 */

import { BaseWorker } from '../base.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';

const SCHEMA = 'servicetitan';

class STJobsSyncWorker extends BaseWorker {
  constructor() {
    super('st-jobs-sync', {
      schedule: '*/10 * * * *', // Every 10 minutes
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
        WHERE entity_type = 'st_jobs'
      `);

      const lastSyncTime = lastSyncResult.rows[0]?.last_sync_at ||
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours

      await this.log('info', 'Fetching jobs from ST', { since: lastSyncTime });

      // Fetch from ServiceTitan
      let page = 1;
      let hasMore = true;
      const pageSize = 200;

      while (hasMore) {
        const response = await stRequest(stEndpoints.jpm.jobs, {
          modifiedOnOrAfter: lastSyncTime,
          page,
          pageSize
        });

        const jobs = response.data || [];

        if (jobs.length === 0) {
          hasMore = false;
          break;
        }

        for (const job of jobs) {
          try {
            // Upsert job
            const result = await client.query(`
              INSERT INTO ${SCHEMA}.st_jobs (
                st_id, job_number, customer_id, location_id, business_unit_id,
                job_type_id, summary, job_status, completed_on,
                st_created_on, st_modified_on, raw_data, synced_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
              ON CONFLICT (st_id) DO UPDATE SET
                job_number = EXCLUDED.job_number,
                customer_id = EXCLUDED.customer_id,
                location_id = EXCLUDED.location_id,
                business_unit_id = EXCLUDED.business_unit_id,
                job_type_id = EXCLUDED.job_type_id,
                summary = EXCLUDED.summary,
                job_status = EXCLUDED.job_status,
                completed_on = EXCLUDED.completed_on,
                st_modified_on = EXCLUDED.st_modified_on,
                raw_data = EXCLUDED.raw_data,
                synced_at = NOW()
              RETURNING (xmax = 0) as is_insert
            `, [
              job.id,
              job.jobNumber,
              job.customerId,
              job.locationId,
              job.businessUnitId,
              job.jobTypeId,
              job.summary,
              job.jobStatus,
              job.completedOn,
              job.createdOn,
              job.modifiedOn,
              JSON.stringify(job)
            ]);

            if (result.rows[0].is_insert) {
              created++;
            } else {
              updated++;
            }
          } catch (error) {
            failed++;
            await this.log('warn', 'Failed to sync job', {
              jobId: job.id,
              error: error.message
            });
          }
        }

        page++;
        hasMore = jobs.length === pageSize;
      }

      // Update sync state
      await client.query(`
        UPDATE public.sync_state
        SET last_sync_at = NOW(),
            records_synced = records_synced + $1
        WHERE entity_type = 'st_jobs'
      `, [created + updated]);

      return { created, updated, failed };
    } finally {
      client.release();
    }
  }
}

export default new STJobsSyncWorker();
