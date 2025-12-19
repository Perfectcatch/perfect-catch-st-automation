/**
 * Enhanced Sync Base Class
 * Provides enrichment pipeline for all sync modules
 */

import 'dotenv/config';
import pg from 'pg';
import { stRequest } from '../stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const { Pool } = pg;

export const logger = createLogger('sync');

// Shared database pool
let pool = null;

export function getPool() {
  if (!pool) {
    // When running from host (not Docker), use localhost:6432
    // The Docker internal hostname 'postgres:5432' won't work from host
    let connectionString = config.database?.url || process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    
    // Convert Docker internal URL to host-accessible URL
    if (connectionString && connectionString.includes('@postgres:5432')) {
      connectionString = connectionString.replace('@postgres:5432', '@localhost:6432');
    }
    
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    
    logger.info('[sync-base] Connecting to database...');
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

/**
 * Sleep utility
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all pages from a ServiceTitan endpoint
 */
export async function fetchAllPages(endpoint, params = {}) {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}${endpoint.replace('{tenant}', tenantId)}`;
  
  const allData = [];
  let page = 1;
  let hasMore = true;
  let continuationToken = null;
  
  while (hasMore) {
    const query = {
      ...params,
      pageSize: 100
    };
    
    if (continuationToken) {
      query.continueFrom = continuationToken;
    } else {
      query.page = page;
    }
    
    try {
      const response = await stRequest(baseUrl, { query });
      
      if (!response.ok) {
        logger.warn(`API error on ${endpoint}: ${response.status}`);
        break;
      }
      
      const data = response.data?.data || response.data || [];
      if (Array.isArray(data)) {
        allData.push(...data);
      }
      
      hasMore = response.data?.hasMore || false;
      continuationToken = response.data?.continueFrom;
      page++;
      
      // Rate limiting
      await sleep(100);
      
      logger.debug(`Fetched page ${page - 1}, total: ${allData.length}`);
      
    } catch (error) {
      logger.error(`Failed to fetch ${endpoint}:`, error.message);
      break;
    }
  }
  
  return allData;
}

/**
 * Fetch single entity details
 */
export async function fetchDetails(endpoint, id) {
  const tenantId = config.serviceTitan.tenantId;
  const url = `${config.serviceTitan.apiBaseUrl}${endpoint.replace('{tenant}', tenantId)}/${id}`;
  
  try {
    const response = await stRequest(url);
    if (response.ok) {
      return response.data;
    }
    return null;
  } catch (error) {
    logger.warn(`Failed to fetch details for ${id}:`, error.message);
    return null;
  }
}

/**
 * Base Sync Class with enrichment pipeline
 */
export class SyncBase {
  constructor(entityName) {
    this.entityName = entityName;
    this.stats = {
      fetched: 0,
      enriched: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0
    };
    this.startTime = null;
    this.logger = createLogger(`sync-${entityName}`);
  }
  
  async run() {
    this.startTime = Date.now();
    this.logger.info(`Starting ${this.entityName} sync...`);
    
    try {
      // Step 1: Fetch list
      this.logger.info(`[${this.entityName}] Step 1: Fetching list...`);
      const list = await this.fetchList();
      this.stats.fetched = list.length;
      this.logger.info(`[${this.entityName}] Fetched ${list.length} records`);
      
      if (list.length === 0) {
        this.logger.warn(`[${this.entityName}] No records to sync`);
        await this.logSyncResult('completed');
        return this.stats;
      }
      
      // Step 2: Enrich with details
      this.logger.info(`[${this.entityName}] Step 2: Enriching with details...`);
      const enriched = await this.enrichAll(list);
      this.stats.enriched = enriched.filter(r => r._enriched).length;
      this.logger.info(`[${this.entityName}] Enriched ${this.stats.enriched} records`);
      
      // Step 3: Transform data
      this.logger.info(`[${this.entityName}] Step 3: Transforming data...`);
      const transformed = await this.transformAll(enriched);
      
      // Step 4: Upsert to database
      this.logger.info(`[${this.entityName}] Step 4: Upserting to database...`);
      await this.upsertAll(transformed);
      
      // Step 5: Post-sync processing
      this.logger.info(`[${this.entityName}] Step 5: Post-processing...`);
      await this.postProcess();
      
      const duration = Date.now() - this.startTime;
      this.logger.info(`[${this.entityName}] Sync completed in ${duration}ms`, { stats: this.stats });
      
      await this.logSyncResult('completed');
      return this.stats;
      
    } catch (error) {
      this.logger.error(`[${this.entityName}] Sync failed`, { error: error.message });
      await this.logSyncResult('failed', error.message);
      throw error;
    }
  }
  
  // Override in subclasses
  async fetchList() {
    throw new Error('fetchList() must be implemented');
  }
  
  async enrichOne(item) {
    // Default: no enrichment
    return item;
  }
  
  async transformOne(item) {
    throw new Error('transformOne() must be implemented');
  }
  
  async upsertOne(item) {
    throw new Error('upsertOne() must be implemented');
  }
  
  async postProcess() {
    // Optional override
  }
  
  async enrichAll(list) {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      
      const promises = batch.map(async (item) => {
        try {
          const enriched = await this.enrichOne(item);
          return { ...enriched, _enriched: true };
        } catch (error) {
          this.logger.warn(`[${this.entityName}] Failed to enrich ${item.id}`, { error: error.message });
          return { ...item, _enriched: false, _enrichError: error.message };
        }
      });
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // Progress
      if ((i + batchSize) % 100 === 0 || i + batchSize >= list.length) {
        this.logger.info(`[${this.entityName}] Enriched ${Math.min(i + batchSize, list.length)}/${list.length}`);
      }
      
      await sleep(200);
    }
    
    return results;
  }
  
  async transformAll(list) {
    const results = [];
    for (const item of list) {
      try {
        const transformed = await this.transformOne(item);
        results.push(transformed);
      } catch (error) {
        this.logger.warn(`[${this.entityName}] Failed to transform ${item.id}`, { error: error.message });
        this.stats.failed++;
      }
    }
    return results;
  }
  
  async upsertAll(list) {
    for (const item of list) {
      try {
        const result = await this.upsertOne(item);
        if (result.created) this.stats.created++;
        else this.stats.updated++;
      } catch (error) {
        this.logger.error(`[${this.entityName}] Failed to upsert ${item.st_id}`, { error: error.message });
        this.stats.failed++;
      }
    }
  }
  
  async logSyncResult(status, errorMessage = null) {
    const duration = Date.now() - this.startTime;
    const client = await getPool().connect();
    
    try {
      await client.query(`
        INSERT INTO st_sync_log (module, sync_type, status, records_fetched, records_created, records_updated, records_failed, duration_ms, error_message, started_at, completed_at)
        VALUES ($1, 'full', $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        this.entityName,
        status,
        this.stats.fetched,
        this.stats.created,
        this.stats.updated,
        this.stats.failed,
        duration,
        errorMessage,
        new Date(this.startTime)
      ]);
    } catch (e) {
      this.logger.error('Failed to log sync result:', e.message);
    } finally {
      client.release();
    }
  }
}

export default {
  SyncBase,
  getPool,
  fetchAllPages,
  fetchDetails,
  sleep,
  logger
};
