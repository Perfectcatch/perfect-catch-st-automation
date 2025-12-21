/**
 * Base Merger Class
 *
 * Common functionality for all merge workers that combine
 * raw tables into dashboard-ready main tables.
 */

import pg from 'pg';
import { createLogger } from '../../../lib/logger.js';
import config from '../../../config/index.js';

const { Pool } = pg;

export class BaseMerger {
  constructor(options = {}) {
    this.name = options.name || 'BaseMerger';
    this.targetTable = options.targetTable;
    this.batchSize = options.batchSize || 500;

    this.logger = createLogger(`merger:${this.name}`);

    // Database connection
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 5,
    });
  }

  /**
   * Get the SQL query that selects merged data from raw tables
   * Must be implemented by subclasses
   * @returns {string} SQL SELECT query
   */
  getMergeQuery() {
    throw new Error('getMergeQuery() must be implemented by subclass');
  }

  /**
   * Get the columns to insert/update in the target table
   * Must be implemented by subclasses
   * @returns {string[]} Array of column names
   */
  getTargetColumns() {
    throw new Error('getTargetColumns() must be implemented by subclass');
  }

  /**
   * Get the conflict column(s) for upsert
   * @returns {string} Column name(s) for ON CONFLICT
   */
  getConflictColumn() {
    return 'st_id';
  }

  /**
   * Get JSONB columns that need to be stringified before insert
   * Override in subclasses that have JSONB columns
   * @returns {string[]} Array of JSONB column names
   */
  getJsonbColumns() {
    return [];
  }

  /**
   * Transform a row from the merge query to target table format
   * Can be overridden for custom transformations
   * @param {Object} row - Row from merge query
   * @returns {Object} Transformed row for target table
   */
  transformRow(row) {
    return row;
  }

  /**
   * Run the merge operation
   * @param {Object} options - Merge options
   * @returns {Object} Results with counts
   */
  async merge(options = {}) {
    const { modifiedSince } = options;
    const startTime = Date.now();

    this.logger.info(`Starting merge for ${this.targetTable}...`, { modifiedSince });

    const client = await this.pool.connect();
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    try {
      // Get the merge query
      let mergeQuery = this.getMergeQuery();
      const queryParams = [];

      // Add modified since filter if provided
      if (modifiedSince) {
        const hasWhere = mergeQuery.toLowerCase().includes('where');
        const connector = hasWhere ? 'AND' : 'WHERE';
        mergeQuery += ` ${connector} (
          raw_customers.st_modified_on > $1
          OR raw_contacts.st_modified_on > $1
        )`;
        queryParams.push(modifiedSince);
      }

      // Execute merge query
      this.logger.debug('Executing merge query...');
      const result = await client.query(mergeQuery, queryParams);
      const rows = result.rows;

      this.logger.info(`Found ${rows.length} records to merge`);

      if (rows.length === 0) {
        return {
          success: true,
          inserted: 0,
          updated: 0,
          errors: 0,
          duration: Date.now() - startTime,
        };
      }

      // Process in batches
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i += this.batchSize) {
        const batch = rows.slice(i, i + this.batchSize);

        for (const row of batch) {
          try {
            const transformed = this.transformRow(row);
            const columns = this.getTargetColumns();
            const jsonbColumns = this.getJsonbColumns();

            // Map values, stringifying JSONB columns
            const values = columns.map(col => {
              const val = transformed[col];
              // Stringify JSONB columns (objects/arrays that aren't null)
              if (jsonbColumns.includes(col) && val !== null && typeof val === 'object') {
                return JSON.stringify(val);
              }
              return val;
            });
            const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');

            // Build update set (exclude conflict column, id, and local timestamps)
            const conflictCol = this.getConflictColumn();
            const updateCols = columns.filter(c =>
              c !== conflictCol && c !== 'id' && c !== 'local_created_at' && c !== 'local_synced_at'
            );
            const updateSet = updateCols
              .map(col => `${col} = EXCLUDED.${col}`)
              .join(', ');

            const query = `
              INSERT INTO ${this.targetTable} (${columns.join(', ')})
              VALUES (${placeholders})
              ON CONFLICT (${conflictCol})
              DO UPDATE SET ${updateSet}, local_synced_at = NOW()
              RETURNING (xmax = 0) AS inserted
            `;

            const upsertResult = await client.query(query, values);
            if (upsertResult.rows[0]?.inserted) {
              inserted++;
            } else {
              updated++;
            }
          } catch (error) {
            errors++;
            this.logger.error(`Error merging record:`, {
              st_id: row.st_id,
              error: error.message
            });
          }
        }

        this.logger.debug(`Processed ${Math.min(i + this.batchSize, rows.length)}/${rows.length}`);
      }

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      this.logger.info(`Merge completed`, { inserted, updated, errors, duration: `${duration}ms` });

      return {
        success: true,
        inserted,
        updated,
        errors,
        total: rows.length,
        duration,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Merge failed:`, { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run a full merge (all records)
   */
  async fullMerge() {
    return this.merge();
  }

  /**
   * Run an incremental merge (only recently modified)
   * @param {Date} since - Only merge records modified after this date
   */
  async incrementalMerge(since) {
    const modifiedSince = since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours
    return this.merge({ modifiedSince });
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default BaseMerger;
