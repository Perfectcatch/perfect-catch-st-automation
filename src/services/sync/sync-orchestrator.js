/**
 * Sync Orchestrator
 * Coordinates all ServiceTitan sync operations
 * Handles order of execution and dependencies
 */

import { syncReferenceData } from './sync-reference-data.js';
import { syncCustomers } from './sync-customers-enhanced.js';
import { syncJobs } from './sync-jobs.js';
import { syncEstimates } from './sync-estimates.js';
import { syncAppointments } from './sync-appointments.js';
import { syncInvoices } from './sync-invoices.js';
import { createLogger } from '../../lib/logger.js';
import pg from 'pg';

const { Pool } = pg;
const logger = createLogger('sync-orchestrator');

// Database connection
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

/**
 * Run full sync - syncs ALL data from ServiceTitan
 */
export async function runFullSync() {
  const startTime = Date.now();
  logger.info('Starting full ServiceTitan sync...');

  try {
    // Phase 1: Reference data (no dependencies)
    logger.info('Phase 1: Syncing reference data...');
    const refStats = await syncReferenceData();
    logger.info('Reference data synced', refStats);

    // Phase 2: Customers (required by everything else)
    logger.info('Phase 2: Syncing customers...');
    const customerStats = await syncCustomers({ full: true });
    logger.info(`Customers synced: ${customerStats.created} created, ${customerStats.updated} updated`);

    // Phase 3: Jobs (required by estimates, appointments, invoices)
    logger.info('Phase 3: Syncing jobs...');
    const jobStats = await syncJobs({ full: true });
    logger.info(`Jobs synced: ${jobStats.created} created, ${jobStats.updated} updated`);

    // Phase 4: Related entities (parallel, with error handling)
    logger.info('Phase 4: Syncing related entities...');
    const results = await Promise.allSettled([
      syncEstimates({ full: true }),
      syncAppointments({ full: true }),
      syncInvoices({ full: true })
    ]);
    
    const estimateStats = results[0].status === 'fulfilled' ? results[0].value : { created: 0, updated: 0, failed: 0, error: results[0].reason?.message };
    const appointmentStats = results[1].status === 'fulfilled' ? results[1].value : { created: 0, updated: 0, failed: 0, error: results[1].reason?.message };
    const invoiceStats = results[2].status === 'fulfilled' ? results[2].value : { created: 0, updated: 0, failed: 0, error: results[2].reason?.message };
    
    if (results[0].status === 'rejected') logger.warn('Estimates sync failed', { error: results[0].reason?.message });
    if (results[1].status === 'rejected') logger.warn('Appointments sync failed', { error: results[1].reason?.message });
    if (results[2].status === 'rejected') logger.warn('Invoices sync failed', { error: results[2].reason?.message });

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      duration,
      durationFormatted: `${(duration / 1000).toFixed(2)}s`,
      stats: {
        reference: refStats,
        customers: customerStats,
        jobs: jobStats,
        estimates: estimateStats,
        appointments: appointmentStats,
        invoices: invoiceStats
      }
    };

    logger.info('Full sync completed', summary);
    return summary;

  } catch (error) {
    logger.error('Full sync failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Run incremental sync - syncs only changes since last sync
 */
export async function runIncrementalSync() {
  const startTime = Date.now();
  logger.info('Starting incremental sync...');

  try {
    // Get last sync time for each module
    const lastSyncTimes = await getLastSyncTimes();

    // Sync only records modified since last sync (parallel)
    const [customerStats, jobStats, estimateStats, appointmentStats, invoiceStats] = await Promise.all([
      syncCustomers({ since: lastSyncTimes.customers }),
      syncJobs({ since: lastSyncTimes.jobs }),
      syncEstimates({ since: lastSyncTimes.estimates }),
      syncAppointments({ since: lastSyncTimes.appointments }),
      syncInvoices({ since: lastSyncTimes.invoices })
    ]);

    const duration = Date.now() - startTime;
    const totalRecords = 
      (customerStats.created + customerStats.updated) +
      (jobStats.created + jobStats.updated) +
      (estimateStats.created + estimateStats.updated) +
      (appointmentStats.created + appointmentStats.updated) +
      (invoiceStats.created + invoiceStats.updated);

    const summary = {
      success: true,
      duration,
      durationFormatted: `${(duration / 1000).toFixed(2)}s`,
      totalRecords,
      stats: {
        customers: customerStats,
        jobs: jobStats,
        estimates: estimateStats,
        appointments: appointmentStats,
        invoices: invoiceStats
      }
    };

    logger.info('Incremental sync completed', summary);
    return summary;

  } catch (error) {
    logger.error('Incremental sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Get last successful sync time for each module
 */
async function getLastSyncTimes() {
  const modules = ['customers', 'jobs', 'estimates', 'appointments', 'invoices'];
  const times = {};

  const client = await getPool().connect();
  try {
    for (const module of modules) {
      const result = await client.query(`
        SELECT completed_at 
        FROM st_sync_log 
        WHERE module = $1 AND status = 'completed'
        ORDER BY completed_at DESC 
        LIMIT 1
      `, [module]);

      times[module] = result.rows[0]?.completed_at || new Date(0);
    }
  } finally {
    client.release();
  }

  return times;
}

/**
 * Get sync status summary
 */
export async function getSyncStatus() {
  const client = await getPool().connect();
  try {
    // Get latest sync for each module
    const result = await client.query(`
      SELECT DISTINCT ON (module) 
        module, 
        sync_type, 
        status, 
        records_fetched, 
        records_created, 
        records_updated,
        started_at,
        completed_at,
        error_message
      FROM st_sync_log
      ORDER BY module, started_at DESC
    `);

    // Get table counts
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM st_customers) as customers,
        (SELECT COUNT(*) FROM st_jobs) as jobs,
        (SELECT COUNT(*) FROM st_estimates) as estimates,
        (SELECT COUNT(*) FROM st_appointments) as appointments,
        (SELECT COUNT(*) FROM st_invoices) as invoices,
        (SELECT COUNT(*) FROM st_technicians) as technicians,
        (SELECT COUNT(*) FROM st_business_units) as business_units
    `);

    return {
      lastSyncs: result.rows,
      tableCounts: counts.rows[0]
    };
  } finally {
    client.release();
  }
}

export default {
  runFullSync,
  runIncrementalSync,
  getSyncStatus
};
