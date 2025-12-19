/**
 * Enhanced Reference Data Sync Module
 * Syncs business units, job types, campaigns, tag types
 */

import { getPool, fetchAllPages, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export async function syncReferenceData() {
  logger.info('Starting reference data sync...');
  
  const results = {
    businessUnits: 0,
    jobTypes: 0,
    campaigns: 0,
    tagTypes: 0
  };
  
  const client = await getPool().connect();
  
  try {
    // 1. Business Units
    try {
      logger.info('[reference] Syncing business units...');
      const units = await fetchAllPages('/settings/v2/tenant/{tenant}/business-units');
      
      for (const unit of units) {
        await client.query(`
          INSERT INTO st_business_units (st_id, tenant_id, name, code, email, phone, address, active, full_data, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = $3, code = $4, email = $5, phone = $6, address = $7, active = $8, full_data = $9, last_synced_at = NOW()
        `, [
          unit.id,
          config.serviceTitan.tenantId,
          unit.name,
          unit.code || null,
          unit.email || null,
          unit.phone || null,
          unit.address || null,
          unit.active !== false,
          JSON.stringify(unit)
        ]);
        results.businessUnits++;
      }
      logger.info(`[reference] Synced ${results.businessUnits} business units`);
    } catch (e) {
      logger.error('[reference] Business units sync failed:', e.message);
    }
    
    // 2. Job Types
    try {
      logger.info('[reference] Syncing job types...');
      const types = await fetchAllPages('/settings/v2/tenant/{tenant}/job-types');
      
      for (const type of types) {
        await client.query(`
          INSERT INTO st_job_types (st_id, tenant_id, name, code, business_unit_id, active, full_data, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = $3, code = $4, business_unit_id = $5, active = $6, full_data = $7, last_synced_at = NOW()
        `, [
          type.id,
          config.serviceTitan.tenantId,
          type.name,
          type.code || null,
          type.businessUnitId || null,
          type.active !== false,
          JSON.stringify(type)
        ]);
        results.jobTypes++;
      }
      logger.info(`[reference] Synced ${results.jobTypes} job types`);
    } catch (e) {
      logger.error('[reference] Job types sync failed:', e.message);
    }
    
    // 3. Campaigns
    try {
      logger.info('[reference] Syncing campaigns...');
      const campaigns = await fetchAllPages('/marketing/v2/tenant/{tenant}/campaigns');
      
      for (const campaign of campaigns) {
        await client.query(`
          INSERT INTO st_campaigns (st_id, tenant_id, name, code, category, active, full_data, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = $3, code = $4, category = $5, active = $6, full_data = $7, last_synced_at = NOW()
        `, [
          campaign.id,
          config.serviceTitan.tenantId,
          campaign.name,
          campaign.code || null,
          campaign.category || null,
          campaign.active !== false,
          JSON.stringify(campaign)
        ]);
        results.campaigns++;
      }
      logger.info(`[reference] Synced ${results.campaigns} campaigns`);
    } catch (e) {
      logger.error('[reference] Campaigns sync failed:', e.message);
    }
    
    // 4. Tag Types
    try {
      logger.info('[reference] Syncing tag types...');
      const tags = await fetchAllPages('/settings/v2/tenant/{tenant}/tag-types');
      
      for (const tag of tags) {
        await client.query(`
          INSERT INTO st_tag_types (st_id, tenant_id, name, code, color, entity_type, active, full_data, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = $3, code = $4, color = $5, entity_type = $6, active = $7, full_data = $8, last_synced_at = NOW()
        `, [
          tag.id,
          config.serviceTitan.tenantId,
          tag.name,
          tag.code || null,
          tag.color || null,
          tag.entityType || null,
          tag.active !== false,
          JSON.stringify(tag)
        ]);
        results.tagTypes++;
      }
      logger.info(`[reference] Synced ${results.tagTypes} tag types`);
    } catch (e) {
      logger.error('[reference] Tag types sync failed:', e.message);
    }
    
    logger.info('[reference] Reference data sync complete:', results);
    return results;
    
  } finally {
    client.release();
  }
}

export default { syncReferenceData };
