/**
 * Enhanced Estimates Sync Module
 * Syncs estimates with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class EstimateSync extends SyncBase {
  constructor() {
    super('estimates');
  }
  
  async fetchList() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    return fetchAllPages('/sales/v2/tenant/{tenant}/estimates', {
      createdOnOrAfter: oneYearAgo.toISOString()
    });
  }
  
  async enrichOne(estimate) {
    // Get full estimate details including line items
    const details = await fetchDetails('/sales/v2/tenant/{tenant}/estimates', estimate.id);
    
    if (!details) {
      return estimate;
    }
    
    // Get estimate items
    let items = [];
    try {
      const itemsData = await fetchDetails('/sales/v2/tenant/{tenant}/estimates', `${estimate.id}/items`);
      items = itemsData?.data || itemsData || [];
    } catch (e) {
      items = details.items || details.lineItems || [];
    }
    
    return {
      ...details,
      items,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(estimate) {
    const items = estimate.items || [];
    const subtotal = estimate.subtotal || items.reduce((sum, item) => sum + (item.total || item.price || 0), 0);
    const total = estimate.total || subtotal;
    
    return {
      st_id: BigInt(estimate.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // References
      customer_id: estimate.customerId ? BigInt(estimate.customerId) : null,
      job_id: estimate.jobId ? BigInt(estimate.jobId) : null,
      location_id: estimate.locationId ? BigInt(estimate.locationId) : null,
      business_unit_id: estimate.businessUnitId ? BigInt(estimate.businessUnitId) : null,
      
      // Estimate info
      estimate_number: estimate.number || estimate.estimateNumber || `E${estimate.id}`,
      name: estimate.name || estimate.summary || 'Estimate',
      status: estimate.status || 'Open',
      
      // Pricing
      subtotal: subtotal,
      tax: estimate.tax || 0,
      total: total,
      
      // Items stored as JSON
      items: JSON.stringify(items),
      item_count: items.length,
      
      // Sold info
      sold_on: estimate.soldOn ? new Date(estimate.soldOn) : null,
      sold_by_id: estimate.soldById ? BigInt(estimate.soldById) : null,
      
      // Timestamps
      st_created_on: estimate.createdOn ? new Date(estimate.createdOn) : new Date(),
      st_modified_on: estimate.modifiedOn ? new Date(estimate.modifiedOn) : new Date(),
      
      // Raw data
      full_data: estimate,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(estimate) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_estimates WHERE st_id = $1',
        [estimate.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_estimates (
            st_id, tenant_id, customer_id, job_id, location_id, business_unit_id,
            estimate_number, name, status,
            subtotal, tax, total,
            items, item_count,
            sold_on, sold_by_id,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12,
            $13, $14,
            $15, $16,
            $17, $18, $19, $20
          )
        `, [
          estimate.st_id,
          estimate.tenant_id,
          estimate.customer_id,
          estimate.job_id,
          estimate.location_id,
          estimate.business_unit_id,
          estimate.estimate_number,
          estimate.name,
          estimate.status,
          estimate.subtotal,
          estimate.tax,
          estimate.total,
          estimate.items,
          estimate.item_count,
          estimate.sold_on,
          estimate.sold_by_id,
          estimate.st_created_on,
          estimate.st_modified_on,
          JSON.stringify(estimate.full_data),
          estimate.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_estimates SET
            customer_id = $2, job_id = $3, location_id = $4, business_unit_id = $5,
            estimate_number = $6, name = $7, status = $8,
            subtotal = $9, tax = $10, total = $11,
            items = $12, item_count = $13,
            sold_on = $14, sold_by_id = $15,
            st_modified_on = $16, full_data = $17, last_synced_at = $18
          WHERE st_id = $1
        `, [
          estimate.st_id,
          estimate.customer_id,
          estimate.job_id,
          estimate.location_id,
          estimate.business_unit_id,
          estimate.estimate_number,
          estimate.name,
          estimate.status,
          estimate.subtotal,
          estimate.tax,
          estimate.total,
          estimate.items,
          estimate.item_count,
          estimate.sold_on,
          estimate.sold_by_id,
          estimate.st_modified_on,
          JSON.stringify(estimate.full_data),
          estimate.last_synced_at
        ]);
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
  
  async postProcess() {
    this.logger.info('[estimates] Calculating conversion metrics...');
    
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total_estimates,
          COUNT(CASE WHEN status = 'Sold' THEN 1 END) as sold_estimates,
          COUNT(CASE WHEN status = 'Open' THEN 1 END) as open_estimates,
          SUM(CASE WHEN status = 'Sold' THEN total ELSE 0 END) as sold_value,
          AVG(CASE WHEN status = 'Sold' THEN total END) as avg_sold_value
        FROM st_estimates
        WHERE st_created_on >= NOW() - INTERVAL '90 days'
      `);
      
      this.logger.info('[estimates] Conversion metrics:', result.rows[0]);
    } finally {
      client.release();
    }
  }
}

export const estimateSync = new EstimateSync();

export async function syncEstimates() {
  return estimateSync.run();
}

export default { EstimateSync, syncEstimates };
