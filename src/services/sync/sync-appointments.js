/**
 * Appointments Sync Module
 * Syncs appointments from ServiceTitan to local database
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-appointments');

/**
 * Sync appointments from ServiceTitan
 */
export async function syncAppointments({ full = false, since = null } = {}) {
  const startTime = Date.now();
  const syncType = full ? 'full' : 'incremental';
  const syncId = await startSyncLog('appointments', syncType);

  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const tenantId = config.serviceTitan.tenantId;
    const baseUrl = `${config.serviceTitan.apiBaseUrl}/jpm/v2/tenant/${tenantId}/appointments`;

    const query = {
      pageSize: 500,
      includeTotal: true
    };

    if (since && !full) {
      query.modifiedOnOrAfter = since.toISOString();
    }

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

      logger.debug(`Fetching appointments page ${page}...`);
      const response = await stRequest(baseUrl, { query: pageQuery });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const appointments = response.data.data || [];
      stats.fetched += appointments.length;

      for (const appointment of appointments) {
        try {
          const result = await upsertAppointment(appointment);
          if (result.created) {
            stats.created++;
          } else {
            stats.updated++;
          }
        } catch (error) {
          logger.error('Failed to upsert appointment', {
            appointmentId: appointment.id,
            error: error.message || error.toString(),
            code: error.code,
            detail: error.detail
          });
          stats.failed++;
        }
      }

      hasMore = response.data.hasMore || false;
      continuationToken = response.data.continueFrom;
      page++;

      await delay(100);

      if (page % 10 === 0) {
        logger.info(`Synced ${stats.fetched} appointments so far...`);
      }
    }

    await completeSyncLog(syncId, stats, startTime);
    logger.info('Appointments sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Appointments sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a single appointment
 */
async function upsertAppointment(appointment) {
  const client = await getPool().connect();
  try {
    const existing = await client.query(
      'SELECT st_id FROM st_appointments WHERE st_id = $1',
      [appointment.id]
    );

    const isNew = existing.rows.length === 0;

    // Convert technician IDs to PostgreSQL array format
    const techIds = appointment.technicianIds || [];
    const techIdsArray = techIds.length > 0 ? `{${techIds.join(',')}}` : null;

    if (isNew) {
      await client.query(`
        INSERT INTO st_appointments (
          st_id, tenant_id, job_id,
          appointment_number, status,
          start_on, end_on,
          arrival_window_start, arrival_window_end,
          technician_ids, notes,
          st_created_on, st_modified_on, full_data
        ) VALUES (
          $1, $2, $3,
          $4, $5,
          $6, $7,
          $8, $9,
          $10, $11,
          $12, $13, $14
        )
      `, [
        appointment.id,
        appointment.tenantId || config.serviceTitan.tenantId,
        appointment.jobId,
        appointment.number,
        appointment.status,
        appointment.start ? new Date(appointment.start) : null,
        appointment.end ? new Date(appointment.end) : null,
        appointment.arrivalWindowStart ? new Date(appointment.arrivalWindowStart) : null,
        appointment.arrivalWindowEnd ? new Date(appointment.arrivalWindowEnd) : null,
        techIdsArray,
        appointment.specialInstructions || appointment.summary || null,
        appointment.createdOn ? new Date(appointment.createdOn) : null,
        appointment.modifiedOn ? new Date(appointment.modifiedOn) : null,
        JSON.stringify(appointment)
      ]);
    } else {
      await client.query(`
        UPDATE st_appointments SET
          status = $2,
          start_on = $3,
          end_on = $4,
          arrival_window_start = $5,
          arrival_window_end = $6,
          technician_ids = $7,
          notes = $8,
          st_modified_on = $9,
          full_data = $10,
          local_synced_at = NOW()
        WHERE st_id = $1
      `, [
        appointment.id,
        appointment.status,
        appointment.start ? new Date(appointment.start) : null,
        appointment.end ? new Date(appointment.end) : null,
        appointment.arrivalWindowStart ? new Date(appointment.arrivalWindowStart) : null,
        appointment.arrivalWindowEnd ? new Date(appointment.arrivalWindowEnd) : null,
        techIdsArray,
        appointment.specialInstructions || appointment.summary || null,
        appointment.modifiedOn ? new Date(appointment.modifiedOn) : null,
        JSON.stringify(appointment)
      ]);
    }

    return { created: isNew };
  } finally {
    client.release();
  }
}

export default { syncAppointments };
