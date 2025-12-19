/**
 * Reference Data Sync Module
 * Syncs business units, technicians, job types, campaigns, etc.
 * These have no dependencies and can be synced first
 */

import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool, startSyncLog, completeSyncLog, failSyncLog, delay } from './sync-base.js';

const logger = createLogger('sync-reference-data');

/**
 * Sync all reference data
 */
export async function syncReferenceData() {
  const startTime = Date.now();
  const syncId = await startSyncLog('reference_data', 'full');

  const stats = {
    businessUnits: { created: 0, updated: 0 },
    technicians: { created: 0, updated: 0 },
    employees: { created: 0, updated: 0 },
    jobTypes: { created: 0, updated: 0 },
    campaigns: { created: 0, updated: 0 },
    callReasons: { created: 0, updated: 0 },
    tagTypes: { created: 0, updated: 0 }
  };

  try {
    // Sync all reference data in parallel
    const results = await Promise.allSettled([
      syncBusinessUnits().then(s => { stats.businessUnits = s; }),
      syncTechnicians().then(s => { stats.technicians = s; }),
      syncEmployees().then(s => { stats.employees = s; }),
      syncJobTypes().then(s => { stats.jobTypes = s; }),
      syncCampaigns().then(s => { stats.campaigns = s; }),
      syncCallReasons().then(s => { stats.callReasons = s; }),
      syncTagTypes().then(s => { stats.tagTypes = s; })
    ]);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Reference data sync failed', { 
          index, 
          error: result.reason?.message 
        });
      }
    });

    const totalStats = {
      fetched: Object.values(stats).reduce((sum, s) => sum + (s.created || 0) + (s.updated || 0), 0),
      created: Object.values(stats).reduce((sum, s) => sum + (s.created || 0), 0),
      updated: Object.values(stats).reduce((sum, s) => sum + (s.updated || 0), 0),
      failed: 0
    };

    await completeSyncLog(syncId, totalStats, startTime);
    logger.info('Reference data sync completed', stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('Reference data sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Sync business units
 */
async function syncBusinessUnits() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/settings/v2/tenant/${tenantId}/business-units`;
  
  let stats = { created: 0, updated: 0 };
  
  const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
  if (!response.ok) return stats;

  const items = response.data.data || [];
  const client = await getPool().connect();
  
  try {
    for (const item of items) {
      const existing = await client.query(
        'SELECT st_id FROM st_business_units WHERE st_id = $1',
        [item.id]
      );

      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO st_business_units (st_id, tenant_id, name, active, full_data)
          VALUES ($1, $2, $3, $4, $5)
        `, [item.id, tenantId, item.name, item.active !== false, JSON.stringify(item)]);
        stats.created++;
      } else {
        await client.query(`
          UPDATE st_business_units SET name = $2, active = $3, full_data = $4, local_synced_at = NOW()
          WHERE st_id = $1
        `, [item.id, item.name, item.active !== false, JSON.stringify(item)]);
        stats.updated++;
      }
    }
  } finally {
    client.release();
  }

  logger.debug(`Business units synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync employees
 */
async function syncEmployees() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/settings/v2/tenant/${tenantId}/employees`;
  
  let stats = { created: 0, updated: 0 };
  
  try {
    const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
    if (!response.ok) return stats;

    const items = response.data.data || [];
    const client = await getPool().connect();
    
    try {
      for (const item of items) {
        const existing = await client.query(
          'SELECT st_id FROM st_employees WHERE st_id = $1',
          [item.id]
        );

        if (existing.rows.length === 0) {
          await client.query(`
            INSERT INTO st_employees (st_id, tenant_id, name, employee_id, email, phone, role, business_unit_id, active, full_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            item.id, tenantId, item.name, item.employeeId, item.email, item.phoneNumber,
            item.role || 'Employee', item.businessUnitId, item.active !== false, JSON.stringify(item)
          ]);
          stats.created++;
        } else {
          await client.query(`
            UPDATE st_employees SET 
              name = $2, email = $3, phone = $4, role = $5, business_unit_id = $6,
              active = $7, full_data = $8, local_synced_at = NOW()
            WHERE st_id = $1
          `, [item.id, item.name, item.email, item.phoneNumber, item.role || 'Employee', item.businessUnitId, item.active !== false, JSON.stringify(item)]);
          stats.updated++;
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    logger.warn('Employees sync skipped (endpoint may not be available)', { error: error.message });
  }

  logger.debug(`Employees synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync technicians
 */
async function syncTechnicians() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/dispatch/v2/tenant/${tenantId}/technicians`;
  
  let stats = { created: 0, updated: 0 };
  
  const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
  if (!response.ok) return stats;

  const items = response.data.data || [];
  const client = await getPool().connect();
  
  try {
    for (const item of items) {
      const existing = await client.query(
        'SELECT st_id FROM st_technicians WHERE st_id = $1',
        [item.id]
      );

      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO st_technicians (st_id, tenant_id, name, email, phone, business_unit_id, active, full_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          item.id, tenantId, item.name, item.email, item.phone,
          item.businessUnitId, item.active !== false, JSON.stringify(item)
        ]);
        stats.created++;
      } else {
        await client.query(`
          UPDATE st_technicians SET 
            name = $2, email = $3, phone = $4, business_unit_id = $5, 
            active = $6, full_data = $7, local_synced_at = NOW()
          WHERE st_id = $1
        `, [item.id, item.name, item.email, item.phone, item.businessUnitId, item.active !== false, JSON.stringify(item)]);
        stats.updated++;
      }
    }
  } finally {
    client.release();
  }

  logger.debug(`Technicians synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync job types
 */
async function syncJobTypes() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/jpm/v2/tenant/${tenantId}/job-types`;
  
  let stats = { created: 0, updated: 0 };
  
  const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
  if (!response.ok) return stats;

  const items = response.data.data || [];
  const client = await getPool().connect();
  
  try {
    for (const item of items) {
      const existing = await client.query(
        'SELECT st_id FROM st_job_types WHERE st_id = $1',
        [item.id]
      );

      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO st_job_types (st_id, tenant_id, name, business_unit_id, active, full_data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [item.id, tenantId, item.name, item.businessUnitId, item.active !== false, JSON.stringify(item)]);
        stats.created++;
      } else {
        await client.query(`
          UPDATE st_job_types SET name = $2, business_unit_id = $3, active = $4, full_data = $5, local_synced_at = NOW()
          WHERE st_id = $1
        `, [item.id, item.name, item.businessUnitId, item.active !== false, JSON.stringify(item)]);
        stats.updated++;
      }
    }
  } finally {
    client.release();
  }

  logger.debug(`Job types synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync campaigns
 */
async function syncCampaigns() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/marketing/v2/tenant/${tenantId}/campaigns`;
  
  let stats = { created: 0, updated: 0 };
  
  const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
  if (!response.ok) return stats;

  const items = response.data.data || [];
  const client = await getPool().connect();
  
  try {
    for (const item of items) {
      const existing = await client.query(
        'SELECT st_id FROM st_campaigns WHERE st_id = $1',
        [item.id]
      );

      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO st_campaigns (st_id, tenant_id, name, category_id, category_name, active, full_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [item.id, tenantId, item.name, item.categoryId, item.categoryName, item.active !== false, JSON.stringify(item)]);
        stats.created++;
      } else {
        await client.query(`
          UPDATE st_campaigns SET name = $2, category_id = $3, category_name = $4, active = $5, full_data = $6, local_synced_at = NOW()
          WHERE st_id = $1
        `, [item.id, item.name, item.categoryId, item.categoryName, item.active !== false, JSON.stringify(item)]);
        stats.updated++;
      }
    }
  } finally {
    client.release();
  }

  logger.debug(`Campaigns synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync call reasons
 */
async function syncCallReasons() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/telecom/v2/tenant/${tenantId}/call-reasons`;
  
  let stats = { created: 0, updated: 0 };
  
  try {
    const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
    if (!response.ok) return stats;

    const items = response.data.data || [];
    const client = await getPool().connect();
    
    try {
      for (const item of items) {
        const existing = await client.query(
          'SELECT st_id FROM st_call_reasons WHERE st_id = $1',
          [item.id]
        );

        if (existing.rows.length === 0) {
          await client.query(`
            INSERT INTO st_call_reasons (st_id, tenant_id, name, active, full_data)
            VALUES ($1, $2, $3, $4, $5)
          `, [item.id, tenantId, item.name, item.active !== false, JSON.stringify(item)]);
          stats.created++;
        } else {
          await client.query(`
            UPDATE st_call_reasons SET name = $2, active = $3, full_data = $4, local_synced_at = NOW()
            WHERE st_id = $1
          `, [item.id, item.name, item.active !== false, JSON.stringify(item)]);
          stats.updated++;
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    logger.warn('Call reasons sync skipped (endpoint may not be available)', { error: error.message });
  }

  logger.debug(`Call reasons synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

/**
 * Sync tag types
 */
async function syncTagTypes() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/settings/v2/tenant/${tenantId}/tag-types`;
  
  let stats = { created: 0, updated: 0 };
  
  try {
    const response = await stRequest(baseUrl, { query: { pageSize: 500 } });
    if (!response.ok) return stats;

    const items = response.data.data || [];
    const client = await getPool().connect();
    
    try {
      for (const item of items) {
        const existing = await client.query(
          'SELECT st_id FROM st_tag_types WHERE st_id = $1',
          [item.id]
        );

        if (existing.rows.length === 0) {
          await client.query(`
            INSERT INTO st_tag_types (st_id, tenant_id, name, color, active, full_data)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [item.id, tenantId, item.name, item.color, item.active !== false, JSON.stringify(item)]);
          stats.created++;
        } else {
          await client.query(`
            UPDATE st_tag_types SET name = $2, color = $3, active = $4, full_data = $5, local_synced_at = NOW()
            WHERE st_id = $1
          `, [item.id, item.name, item.color, item.active !== false, JSON.stringify(item)]);
          stats.updated++;
        }
      }
    } finally {
      client.release();
    }
  } catch (error) {
    logger.warn('Tag types sync skipped (endpoint may not be available)', { error: error.message });
  }

  logger.debug(`Tag types synced: ${stats.created} created, ${stats.updated} updated`);
  return stats;
}

export default { syncReferenceData };
