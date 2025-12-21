/**
 * Base Fetcher Class
 *
 * Provides common functionality for all raw table fetchers:
 * - Pagination handling (page-based and continuation token)
 * - Rate limiting with automatic retry
 * - Upsert logic for raw tables
 * - Sync state management
 */

import { stRequest } from '../../../services/stClient.js';
import config from '../../../config/index.js';
import { createLogger } from '../../../lib/logger.js';
import pg from 'pg';

const { Pool } = pg;

export class BaseFetcher {
  constructor(options = {}) {
    this.tableName = options.tableName;
    this.endpoint = options.endpoint;
    this.moduleLogger = options.logger || createLogger(`fetcher-${this.tableName}`);
    this.tenantId = config.serviceTitan.tenantId;
    this.baseUrl = config.serviceTitan.apiBaseUrl;
    this.pageSize = options.pageSize || 100;
    this.batchSize = options.batchSize || 50;
    this.delayBetweenBatches = options.delayBetweenBatches || 100;

    // Database connection
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 5,
    });
  }

  /**
   * Build the full API URL
   */
  buildUrl(queryParams = {}) {
    const url = `${this.baseUrl}${this.endpoint.replace('{tenant}', this.tenantId)}`;
    const params = new URLSearchParams({
      pageSize: this.pageSize,
      ...queryParams,
    });
    return `${url}?${params.toString()}`;
  }

  /**
   * Fetch all pages from the API
   */
  async fetchAllPages(queryParams = {}) {
    const allData = [];
    let page = 1;
    let hasMore = true;
    let continuationToken = null;

    this.moduleLogger.info(`Starting fetch for ${this.tableName}...`);

    while (hasMore) {
      const params = { ...queryParams };

      if (continuationToken) {
        params.continueFrom = continuationToken;
      } else {
        params.page = page;
      }

      const url = this.buildUrl(params);
      const response = await stRequest(url);

      if (!response.ok) {
        this.moduleLogger.error(`API error: ${response.status}`, { url });
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = response.data?.data || [];
      allData.push(...data);

      // Check for more pages
      continuationToken = response.data?.continueFrom || null;
      hasMore = response.data?.hasMore || (data.length === this.pageSize && !continuationToken);

      if (!continuationToken) {
        page++;
      }

      this.moduleLogger.debug(`Fetched page ${page - 1}, got ${data.length} records, total: ${allData.length}`);

      // Small delay to avoid rate limiting
      if (hasMore) {
        await this.delay(this.delayBetweenBatches);
      }
    }

    this.moduleLogger.info(`Completed fetch for ${this.tableName}: ${allData.length} records`);
    return allData;
  }

  /**
   * Fetch records modified since a given date
   */
  async fetchModifiedSince(since, queryParams = {}) {
    const params = {
      ...queryParams,
      modifiedOnOrAfter: since.toISOString(),
    };
    return this.fetchAllPages(params);
  }

  /**
   * Transform API record to database record
   * Override in subclass for specific transformations
   */
  transformRecord(apiRecord) {
    return {
      st_id: apiRecord.id,
      tenant_id: this.tenantId,
      full_data: apiRecord,
      fetched_at: new Date(),
    };
  }

  /**
   * Get the columns for upsert
   * Override in subclass to specify columns
   */
  getColumns() {
    return ['st_id', 'tenant_id', 'full_data', 'fetched_at'];
  }

  /**
   * Get the conflict column for upsert (usually st_id)
   */
  getConflictColumn() {
    return 'st_id';
  }

  /**
   * Get columns that are PostgreSQL arrays (BIGINT[], TEXT[], etc.)
   * Override in subclass if you have array columns
   */
  getPgArrayColumns() {
    return [];
  }

  /**
   * Upsert records into the raw table
   */
  async upsertRecords(records) {
    if (records.length === 0) return { inserted: 0, updated: 0 };

    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      // Process in batches
      for (let i = 0; i < records.length; i += this.batchSize) {
        const batch = records.slice(i, i + this.batchSize);
        const transformedBatch = batch.map(r => this.transformRecord(r));

        for (const record of transformedBatch) {
          const columns = this.getColumns();
          const pgArrayColumns = this.getPgArrayColumns();

          // Serialize arrays/objects for database
          const values = columns.map(col => {
            const val = record[col];
            if (val === null || val === undefined) return null;

            // PostgreSQL array columns (BIGINT[], etc.) - pass as-is, pg will handle
            if (pgArrayColumns.includes(col)) {
              return val;
            }

            // JSONB columns - stringify objects/arrays
            if (typeof val === 'object' && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val;
          });
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          const conflictColumn = this.getConflictColumn();

          // Build UPDATE SET clause (exclude conflict column)
          const updateCols = columns.filter(c => c !== conflictColumn && c !== 'id');
          const updateSet = updateCols.map((col, idx) =>
            `${col} = EXCLUDED.${col}`
          ).join(', ');

          const query = `
            INSERT INTO ${this.tableName} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT (${conflictColumn})
            DO UPDATE SET ${updateSet}
            RETURNING (xmax = 0) AS inserted
          `;

          const result = await client.query(query, values);
          if (result.rows[0]?.inserted) {
            inserted++;
          } else {
            updated++;
          }
        }

        this.moduleLogger.debug(`Upserted batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(records.length / this.batchSize)}`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { inserted, updated };
  }

  /**
   * Update sync state
   */
  async updateSyncState(updates) {
    const setClauses = [];
    const values = [this.tableName];
    let paramIdx = 2;

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${paramIdx}`);
      values.push(value);
      paramIdx++;
    }

    setClauses.push(`updated_at = NOW()`);

    const query = `
      UPDATE raw_sync_state
      SET ${setClauses.join(', ')}
      WHERE table_name = $1
    `;

    await this.pool.query(query, values);
  }

  /**
   * Get sync state
   */
  async getSyncState() {
    const result = await this.pool.query(
      'SELECT * FROM raw_sync_state WHERE table_name = $1',
      [this.tableName]
    );
    return result.rows[0] || null;
  }

  /**
   * Run a full sync
   */
  async fullSync(queryParams = {}) {
    const startTime = Date.now();

    try {
      await this.updateSyncState({ sync_status: 'running' });

      const records = await this.fetchAllPages(queryParams);
      const { inserted, updated } = await this.upsertRecords(records);

      const duration = Date.now() - startTime;

      await this.updateSyncState({
        last_full_sync: new Date(),
        records_count: records.length,
        sync_status: 'completed',
        last_error: null,
      });

      this.moduleLogger.info(`Full sync completed`, {
        table: this.tableName,
        records: records.length,
        inserted,
        updated,
        duration: `${duration}ms`,
      });

      return { success: true, records: records.length, inserted, updated, duration };
    } catch (error) {
      await this.updateSyncState({
        sync_status: 'error',
        last_error: error.message,
      });

      this.moduleLogger.error(`Full sync failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Run an incremental sync (only modified records)
   */
  async incrementalSync(queryParams = {}) {
    const startTime = Date.now();

    try {
      const syncState = await this.getSyncState();
      const since = syncState?.last_incremental_sync || syncState?.last_full_sync;

      if (!since) {
        this.moduleLogger.info('No previous sync found, running full sync instead');
        return this.fullSync(queryParams);
      }

      await this.updateSyncState({ sync_status: 'running' });

      const records = await this.fetchModifiedSince(new Date(since), queryParams);
      const { inserted, updated } = await this.upsertRecords(records);

      const duration = Date.now() - startTime;

      await this.updateSyncState({
        last_incremental_sync: new Date(),
        sync_status: 'completed',
        last_error: null,
      });

      this.moduleLogger.info(`Incremental sync completed`, {
        table: this.tableName,
        since,
        records: records.length,
        inserted,
        updated,
        duration: `${duration}ms`,
      });

      return { success: true, records: records.length, inserted, updated, duration };
    } catch (error) {
      await this.updateSyncState({
        sync_status: 'error',
        last_error: error.message,
      });

      this.moduleLogger.error(`Incremental sync failed`, { error: error.message });
      throw error;
    }
  }

  /**
   * Utility: delay for rate limiting
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  async close() {
    await this.pool.end();
  }
}

export default BaseFetcher;
