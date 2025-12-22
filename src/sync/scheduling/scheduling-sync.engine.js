/**
 * Scheduling Sync Engine
 * Main orchestrator for syncing scheduling reference data from ServiceTitan
 *
 * This is a ONE-WAY sync (from ST to local) for reference data used in
 * intelligent scheduling. Unlike pricebook, we don't sync jobs/appointments
 * as they change too frequently - those are always fetched real-time.
 */

import { createLogger } from '../../lib/logger.js';
import { db } from '../../services/database.js';

// Fetchers
import { STTechniciansFetcher } from './fetchers/st-technicians.fetcher.js';
import { STTeamsFetcher } from './fetchers/st-teams.fetcher.js';
import { STZonesFetcher } from './fetchers/st-zones.fetcher.js';
import { STBusinessHoursFetcher } from './fetchers/st-business-hours.fetcher.js';
import { STArrivalWindowsFetcher } from './fetchers/st-arrival-windows.fetcher.js';
import { STJobTypesFetcher } from './fetchers/st-job-types.fetcher.js';

// Comparators
import { TechnicianComparator } from './comparators/technician.comparator.js';
import { TeamComparator } from './comparators/team.comparator.js';
import { ZoneComparator } from './comparators/zone.comparator.js';
import { JobTypeComparator } from './comparators/job-type.comparator.js';

// Appliers
import { TechnicianApplier } from './appliers/technician.applier.js';
import { TeamApplier } from './appliers/team.applier.js';
import { ZoneApplier } from './appliers/zone.applier.js';
import { JobTypeApplier } from './appliers/job-type.applier.js';

const logger = createLogger('scheduling-sync');

// Entity type mapping for DB
const ENTITY_TYPE_TO_SINGULAR = {
  technicians: 'technician',
  teams: 'team',
  zones: 'zone',
  businessHours: 'business_hours',
  arrivalWindows: 'arrival_window',
  jobTypes: 'job_type',
};

/**
 * @typedef {Object} SyncOptions
 * @property {('technicians' | 'teams' | 'zones' | 'businessHours' | 'arrivalWindows' | 'jobTypes')[]} [entityTypes]
 * @property {boolean} [fullSync] - Full sync vs incremental
 * @property {boolean} [dryRun] - Preview changes without applying
 * @property {string} [triggeredBy] - Who triggered the sync
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} syncLogId - ID of the sync log entry
 * @property {'completed' | 'failed' | 'partial'} status - Sync status
 * @property {number} duration - Duration in milliseconds
 * @property {Object} stats - Sync statistics
 * @property {Array} errors - Errors encountered
 */

export class SchedulingSyncEngine {
  /**
   * @param {Object} stClient - ServiceTitan API client
   */
  constructor(stClient) {
    this.stClient = stClient;
    this.logger = logger;

    // Initialize fetchers
    this.fetchers = {
      technicians: new STTechniciansFetcher(stClient, logger),
      teams: new STTeamsFetcher(stClient, logger),
      zones: new STZonesFetcher(stClient, logger),
      businessHours: new STBusinessHoursFetcher(stClient, logger),
      arrivalWindows: new STArrivalWindowsFetcher(stClient, logger),
      jobTypes: new STJobTypesFetcher(stClient, logger),
    };

    // Initialize comparators
    this.comparators = {
      technicians: new TechnicianComparator(logger),
      teams: new TeamComparator(logger),
      zones: new ZoneComparator(logger),
      jobTypes: new JobTypeComparator(logger),
    };

    // Initialize appliers
    this.appliers = {
      technicians: new TechnicianApplier(logger),
      teams: new TeamApplier(logger),
      zones: new ZoneApplier(logger),
      jobTypes: new JobTypeApplier(logger),
    };
  }

  /**
   * Execute sync operation
   * @param {SyncOptions} options
   * @returns {Promise<SyncResult>}
   */
  async sync(options = {}) {
    const startTime = Date.now();
    const {
      entityTypes = ['teams', 'zones', 'technicians', 'jobTypes'],
      fullSync = false,
      dryRun = false,
      triggeredBy = 'api',
    } = options;

    this.logger.info({ entityTypes, fullSync, dryRun }, 'Starting scheduling sync');

    // Create sync log entry
    const entityTypesForDb = entityTypes.map(t => ENTITY_TYPE_TO_SINGULAR[t] || t);
    const syncLogResult = await db.query(
      `INSERT INTO scheduling_sync_log (
        sync_type, direction, entity_types, status, triggered_by, results
      ) VALUES (
        $1, 'from_st', $2::scheduling_entity_type[], 'running', $3, '{}'
      ) RETURNING id`,
      [
        fullSync ? 'full' : 'incremental',
        entityTypesForDb,
        triggeredBy,
      ]
    );
    const syncLogId = syncLogResult.rows[0].id;

    const result = {
      syncLogId,
      status: 'completed',
      duration: 0,
      stats: {
        fetched: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
    };

    try {
      // Sync in dependency order: teams/zones first, then technicians (refs teams)
      // Note: We sync teams and zones first because technicians reference them

      if (entityTypes.includes('teams')) {
        const teamResult = await this.syncEntity('teams', {
          fullSync,
          dryRun,
          syncLogId,
        });
        this.mergeResults(result, teamResult);
      }

      if (entityTypes.includes('zones')) {
        const zoneResult = await this.syncEntity('zones', {
          fullSync,
          dryRun,
          syncLogId,
        });
        this.mergeResults(result, zoneResult);
      }

      if (entityTypes.includes('technicians')) {
        const techResult = await this.syncEntity('technicians', {
          fullSync,
          dryRun,
          syncLogId,
        });
        this.mergeResults(result, techResult);
      }

      if (entityTypes.includes('jobTypes')) {
        const jobTypeResult = await this.syncEntity('jobTypes', {
          fullSync,
          dryRun,
          syncLogId,
        });
        this.mergeResults(result, jobTypeResult);
      }

      // Business hours and arrival windows are simpler - just fetch and upsert
      if (entityTypes.includes('businessHours')) {
        const bhResult = await this.syncBusinessHours(syncLogId, dryRun);
        this.mergeResults(result, bhResult);
      }

      if (entityTypes.includes('arrivalWindows')) {
        const awResult = await this.syncArrivalWindows(syncLogId, dryRun);
        this.mergeResults(result, awResult);
      }

      result.status = result.errors.length > 0 ? 'partial' : 'completed';
    } catch (error) {
      this.logger.error({ error: error.message, stack: error.stack }, 'Sync failed');
      result.status = 'failed';
      result.errors.push({
        entity: 'sync',
        message: error.message,
        stack: error.stack,
      });
    } finally {
      result.duration = Date.now() - startTime;

      // Update sync log
      await db.query(
        `UPDATE scheduling_sync_log SET
          status = $1,
          completed_at = NOW(),
          duration_seconds = $2,
          records_fetched = $3,
          records_created = $4,
          records_updated = $5,
          records_deleted = $6,
          records_skipped = $7,
          errors_encountered = $8,
          results = $9
        WHERE id = $10`,
        [
          result.status,
          Math.floor(result.duration / 1000),
          result.stats.fetched,
          result.stats.created,
          result.stats.updated,
          result.stats.deleted,
          result.stats.skipped,
          result.stats.errors,
          JSON.stringify(result),
          syncLogId,
        ]
      );

      this.logger.info(
        {
          syncLogId,
          status: result.status,
          duration: result.duration,
          stats: result.stats,
        },
        'Scheduling sync completed'
      );
    }

    return result;
  }

  /**
   * Sync a single entity type
   * @param {'technicians' | 'teams' | 'zones' | 'jobTypes'} entityType
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async syncEntity(entityType, options) {
    const { fullSync, dryRun, syncLogId } = options;

    this.logger.info({ entityType }, `Syncing ${entityType}`);

    const result = {
      stats: {
        fetched: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
      },
      errors: [],
    };

    try {
      // Step 1: Fetch from ServiceTitan
      const fetcher = this.fetchers[entityType];
      const stEntities = await fetcher.fetchAll();
      result.stats.fetched = stEntities.length;

      this.logger.info({ entityType, count: stEntities.length }, `Fetched ${entityType} from ST`);

      // Step 2: Compare with local database
      const comparator = this.comparators[entityType];
      const comparison = await comparator.compare(stEntities, fullSync);

      this.logger.info(
        {
          entityType,
          new: comparison.new.length,
          modified: comparison.modified.length,
          unchanged: comparison.unchanged.length,
          deleted: comparison.deleted.length,
        },
        `Comparison results for ${entityType}`
      );

      // Step 3: Apply changes (unless dry run)
      if (!dryRun) {
        const applier = this.appliers[entityType];

        // Create new records
        for (const entity of comparison.new) {
          try {
            await applier.create(entity, syncLogId);
            result.stats.created++;
          } catch (error) {
            this.logger.error({ entityType, stId: entity.id, error: error.message }, 'Failed to create');
            result.errors.push({ entityType, stId: entity.id, action: 'create', message: error.message });
            result.stats.errors++;
          }
        }

        // Update modified records
        for (const { stEntity, localEntity } of comparison.modified) {
          try {
            await applier.update(localEntity.id, stEntity, syncLogId);
            result.stats.updated++;
          } catch (error) {
            this.logger.error({ entityType, stId: stEntity.id, error: error.message }, 'Failed to update');
            result.errors.push({ entityType, stId: stEntity.id, action: 'update', message: error.message });
            result.stats.errors++;
          }
        }

        // Soft delete removed records
        for (const localEntity of comparison.deleted) {
          try {
            await applier.delete(localEntity.id, syncLogId);
            result.stats.deleted++;
          } catch (error) {
            this.logger.error({ entityType, id: localEntity.id, error: error.message }, 'Failed to delete');
            result.errors.push({ entityType, id: localEntity.id, action: 'delete', message: error.message });
            result.stats.errors++;
          }
        }

        result.stats.skipped += comparison.unchanged.length;
      } else {
        this.logger.info({ entityType }, 'Dry run - no changes applied');
        result.stats.skipped = stEntities.length;
      }
    } catch (error) {
      this.logger.error({ entityType, error: error.message }, `Failed to sync ${entityType}`);
      result.errors.push({ entityType, message: error.message, stack: error.stack });
      result.stats.errors++;
    }

    return result;
  }

  /**
   * Sync business hours (simple upsert pattern)
   * @param {string} syncLogId
   * @param {boolean} dryRun
   * @returns {Promise<Object>}
   */
  async syncBusinessHours(syncLogId, dryRun) {
    const result = {
      stats: { fetched: 0, created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 },
      errors: [],
    };

    try {
      const stBusinessHours = await this.fetchers.businessHours.fetchAll();
      result.stats.fetched = stBusinessHours.length;

      if (dryRun) {
        result.stats.skipped = stBusinessHours.length;
        return result;
      }

      for (const bh of stBusinessHours) {
        try {
          const existingResult = await db.query(
            'SELECT id FROM scheduling_business_hours WHERE st_id = $1',
            [bh.id]
          );

          if (existingResult.rows.length > 0) {
            // Update
            await db.query(
              `UPDATE scheduling_business_hours SET
                name = $1, day_of_week = $2, start_time = $3, end_time = $4,
                active = $5, last_synced_at = NOW(), sync_status = 'synced'
              WHERE st_id = $6`,
              [bh.name, bh.dayOfWeek, bh.startTime, bh.endTime, bh.active ?? true, bh.id]
            );
            result.stats.updated++;
          } else {
            // Insert
            await db.query(
              `INSERT INTO scheduling_business_hours (
                st_id, tenant_id, name, day_of_week, start_time, end_time,
                active, last_synced_at, sync_status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'synced')`,
              [bh.id, bh.tenantId, bh.name, bh.dayOfWeek, bh.startTime, bh.endTime, bh.active ?? true]
            );
            result.stats.created++;
          }
        } catch (error) {
          this.logger.error({ stId: bh.id, error: error.message }, 'Failed to sync business hours');
          result.errors.push({ entityType: 'businessHours', stId: bh.id, message: error.message });
          result.stats.errors++;
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to sync business hours');
      result.errors.push({ entityType: 'businessHours', message: error.message });
      result.stats.errors++;
    }

    return result;
  }

  /**
   * Sync arrival windows (simple upsert pattern)
   * @param {string} syncLogId
   * @param {boolean} dryRun
   * @returns {Promise<Object>}
   */
  async syncArrivalWindows(syncLogId, dryRun) {
    const result = {
      stats: { fetched: 0, created: 0, updated: 0, deleted: 0, skipped: 0, errors: 0 },
      errors: [],
    };

    try {
      const stArrivalWindows = await this.fetchers.arrivalWindows.fetchAll();
      result.stats.fetched = stArrivalWindows.length;

      if (dryRun) {
        result.stats.skipped = stArrivalWindows.length;
        return result;
      }

      for (const aw of stArrivalWindows) {
        try {
          const existingResult = await db.query(
            'SELECT id FROM scheduling_arrival_windows WHERE st_id = $1',
            [aw.id]
          );

          if (existingResult.rows.length > 0) {
            // Update
            await db.query(
              `UPDATE scheduling_arrival_windows SET
                name = $1, start_time = $2, end_time = $3,
                active = $4, last_synced_at = NOW(), sync_status = 'synced'
              WHERE st_id = $5`,
              [aw.name, aw.start, aw.end, aw.active ?? true, aw.id]
            );
            result.stats.updated++;
          } else {
            // Insert
            await db.query(
              `INSERT INTO scheduling_arrival_windows (
                st_id, tenant_id, name, start_time, end_time,
                active, last_synced_at, sync_status
              ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'synced')`,
              [aw.id, aw.tenantId, aw.name, aw.start, aw.end, aw.active ?? true]
            );
            result.stats.created++;
          }
        } catch (error) {
          this.logger.error({ stId: aw.id, error: error.message }, 'Failed to sync arrival window');
          result.errors.push({ entityType: 'arrivalWindows', stId: aw.id, message: error.message });
          result.stats.errors++;
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to sync arrival windows');
      result.errors.push({ entityType: 'arrivalWindows', message: error.message });
      result.stats.errors++;
    }

    return result;
  }

  /**
   * Merge results from entity sync into main result
   * @param {SyncResult} target
   * @param {Object} source
   */
  mergeResults(target, source) {
    if (source.stats) {
      target.stats.fetched += source.stats.fetched || 0;
      target.stats.created += source.stats.created || 0;
      target.stats.updated += source.stats.updated || 0;
      target.stats.deleted += source.stats.deleted || 0;
      target.stats.skipped += source.stats.skipped || 0;
      target.stats.errors += source.stats.errors || 0;
    }
    if (source.errors) target.errors.push(...source.errors);
  }

  /**
   * Get sync status
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const lastSyncResult = await db.query(
      `SELECT * FROM scheduling_sync_log ORDER BY started_at DESC LIMIT 1`
    );
    const lastSync = lastSyncResult.rows[0] || null;

    const statsResult = await db.query(`SELECT * FROM get_scheduling_stats()`);
    const stats = statsResult.rows;

    return {
      lastSync,
      stats,
    };
  }

  /**
   * Get technicians with optional filters
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getTechnicians(filters = {}) {
    let query = `
      SELECT t.*,
        COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as skills
      FROM raw_st_technicians t
      LEFT JOIN scheduling_technician_skills s ON s.technician_id = t.id
      WHERE t.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (filters.active !== undefined) {
      query += ` AND t.active = $${paramIndex++}`;
      params.push(filters.active);
    }

    if (filters.teamId) {
      query += ` AND t.team_id = $${paramIndex++}`;
      params.push(filters.teamId);
    }

    if (filters.zoneId) {
      query += ` AND $${paramIndex++} = ANY(t.zone_ids)`;
      params.push(filters.zoneId);
    }

    query += ` GROUP BY t.id ORDER BY t.name`;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get zones
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getZones(filters = {}) {
    let query = 'SELECT * FROM raw_st_zones WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(filters.active);
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Get teams
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getTeams(filters = {}) {
    let query = 'SELECT * FROM raw_st_teams WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(filters.active);
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);
    return result.rows;
  }
}

export default SchedulingSyncEngine;
