/**
 * Pricebook Sync Engine
 * Main orchestrator for bi-directional sync between ServiceTitan and local PostgreSQL
 */

import { createLogger } from '../../lib/logger.js';
import { STCategoriesFetcher } from './fetchers/st-categories.fetcher.js';
import { STMaterialsFetcher } from './fetchers/st-materials.fetcher.js';
import { STServicesFetcher } from './fetchers/st-services.fetcher.js';
import { STEquipmentFetcher } from './fetchers/st-equipment.fetcher.js';
import { CategoryComparator } from './comparators/category.comparator.js';
import { MaterialComparator } from './comparators/material.comparator.js';
import { ServiceComparator } from './comparators/service.comparator.js';
import { EquipmentComparator } from './comparators/equipment.comparator.js';
import { CategoryApplier } from './appliers/category.applier.js';
import { MaterialApplier } from './appliers/material.applier.js';
import { ServiceApplier } from './appliers/service.applier.js';
import { EquipmentApplier } from './appliers/equipment.applier.js';
import { ConflictResolver } from './conflict-resolver.js';

const logger = createLogger('pricebook-sync');

// Map plural entity types (used internally) to singular (stored in DB)
const ENTITY_TYPE_TO_SINGULAR = {
  categories: 'category',
  materials: 'material',
  services: 'service',
  equipment: 'equipment',
};

/**
 * @typedef {Object} SyncOptions
 * @property {'from_st' | 'to_st' | 'bidirectional'} direction - Sync direction
 * @property {('categories' | 'materials' | 'services' | 'equipment')[]} [entityTypes] - Entity types to sync (plural names)
 * @property {boolean} [fullSync] - Full sync vs incremental
 * @property {'keep_st' | 'keep_local' | 'manual'} [resolveConflicts] - Conflict resolution strategy
 * @property {boolean} [dryRun] - Preview changes without applying
 * @property {string} [triggeredBy] - Who triggered the sync
 */

/**
 * @typedef {Object} SyncResult
 * @property {string} syncLogId - ID of the sync log entry
 * @property {'completed' | 'failed' | 'partial'} status - Sync status
 * @property {number} duration - Duration in milliseconds
 * @property {Object} stats - Sync statistics
 * @property {Array} conflicts - Detected conflicts
 * @property {Array} errors - Errors encountered
 */

export class PricebookSyncEngine {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} stClient - ServiceTitan API client
   */
  constructor(prisma, stClient) {
    this.prisma = prisma;
    this.stClient = stClient;
    this.logger = logger;

    // Initialize fetchers
    this.fetchers = {
      categories: new STCategoriesFetcher(stClient, logger),
      materials: new STMaterialsFetcher(stClient, logger),
      services: new STServicesFetcher(stClient, logger),
      equipment: new STEquipmentFetcher(stClient, logger),
    };

    // Initialize comparators
    this.comparators = {
      categories: new CategoryComparator(prisma, logger),
      materials: new MaterialComparator(prisma, logger),
      services: new ServiceComparator(prisma, logger),
      equipment: new EquipmentComparator(prisma, logger),
    };

    // Initialize appliers
    this.appliers = {
      categories: new CategoryApplier(prisma, logger),
      materials: new MaterialApplier(prisma, logger),
      services: new ServiceApplier(prisma, logger),
      equipment: new EquipmentApplier(prisma, logger),
    };

    // Initialize conflict resolver
    this.conflictResolver = new ConflictResolver(prisma, logger);
  }

  /**
   * Execute sync operation
   * @param {SyncOptions} options
   * @returns {Promise<SyncResult>}
   */
  async sync(options) {
    const startTime = Date.now();
    const {
      direction = 'from_st',
      entityTypes = ['categories', 'materials', 'services', 'equipment'],
      fullSync = false,
      resolveConflicts = 'manual',
      dryRun = false,
      triggeredBy = 'api',
    } = options;

    this.logger.info({ direction, entityTypes, fullSync, dryRun }, 'Starting pricebook sync');

    // Create sync log entry (convert plural to singular for DB storage)
    const entityTypesForDb = entityTypes.map(t => ENTITY_TYPE_TO_SINGULAR[t] || t);
    const syncLog = await this.prisma.pricebookSyncLog.create({
      data: {
        syncType: fullSync ? 'full' : 'incremental',
        direction,
        entityTypes: entityTypesForDb,
        status: 'running',
        triggeredBy,
        config: options,
      },
    });

    const result = {
      syncLogId: syncLog.id,
      status: 'completed',
      duration: 0,
      stats: {
        fetched: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicts: 0,
        errors: 0,
      },
      conflicts: [],
      errors: [],
    };

    try {
      // Sync in order (categories first due to foreign keys)
      if (entityTypes.includes('categories')) {
        const categoryResult = await this.syncEntity('categories', {
          direction,
          fullSync,
          resolveConflicts,
          dryRun,
          syncLogId: syncLog.id,
        });
        this.mergeResults(result, categoryResult);
      }

      if (entityTypes.includes('materials')) {
        const materialResult = await this.syncEntity('materials', {
          direction,
          fullSync,
          resolveConflicts,
          dryRun,
          syncLogId: syncLog.id,
        });
        this.mergeResults(result, materialResult);
      }

      if (entityTypes.includes('services')) {
        const serviceResult = await this.syncEntity('services', {
          direction,
          fullSync,
          resolveConflicts,
          dryRun,
          syncLogId: syncLog.id,
        });
        this.mergeResults(result, serviceResult);
      }

      if (entityTypes.includes('equipment')) {
        const equipmentResult = await this.syncEntity('equipment', {
          direction,
          fullSync,
          resolveConflicts,
          dryRun,
          syncLogId: syncLog.id,
        });
        this.mergeResults(result, equipmentResult);
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
      await this.prisma.pricebookSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: result.status,
          completedAt: new Date(),
          durationSeconds: Math.floor(result.duration / 1000),
          recordsFetched: result.stats.fetched,
          recordsCreated: result.stats.created,
          recordsUpdated: result.stats.updated,
          recordsDeleted: result.stats.deleted,
          recordsSkipped: result.stats.skipped,
          conflictsDetected: result.stats.conflicts,
          errorsEncountered: result.stats.errors,
          results: result,
        },
      });

      this.logger.info(
        {
          syncLogId: syncLog.id,
          status: result.status,
          duration: result.duration,
          stats: result.stats,
        },
        'Sync completed'
      );
    }

    return result;
  }

  /**
   * Sync a single entity type
   * @param {'categories' | 'materials' | 'services' | 'equipment'} entityType
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async syncEntity(entityType, options) {
    const { direction, fullSync, resolveConflicts, dryRun, syncLogId } = options;

    this.logger.info({ entityType, direction }, `Syncing ${entityType}`);

    const result = {
      stats: {
        fetched: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicts: 0,
        errors: 0,
      },
      conflicts: [],
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

      // Step 3: Detect conflicts
      if (comparison.modified.length > 0) {
        const conflicts = await this.conflictResolver.detectConflicts(
          entityType,
          comparison.modified,
          syncLogId
        );
        result.conflicts.push(...conflicts);
        result.stats.conflicts = conflicts.length;

        // Handle conflicts based on strategy
        if (resolveConflicts !== 'manual' && conflicts.length > 0) {
          await this.conflictResolver.resolveConflicts(conflicts, resolveConflicts);
        }
      }

      // Step 4: Apply changes (unless dry run)
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

        // Update modified records (skip if has unresolved conflict)
        for (const { stEntity, localEntity, hasConflict } of comparison.modified) {
          if (hasConflict && resolveConflicts === 'manual') {
            result.stats.skipped++;
            continue;
          }

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
      target.stats.conflicts += source.stats.conflicts || 0;
      target.stats.errors += source.stats.errors || 0;
    }
    if (source.conflicts) target.conflicts.push(...source.conflicts);
    if (source.errors) target.errors.push(...source.errors);
  }

  /**
   * Get sync status
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const lastSync = await this.prisma.pricebookSyncLog.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    const stats = await this.prisma.$queryRaw`SELECT * FROM get_sync_stats()`;

    const unresolvedConflicts = await this.prisma.pricebookSyncConflict.count({
      where: { status: 'unresolved' },
    });

    return {
      lastSync,
      stats,
      unresolvedConflicts,
    };
  }

  /**
   * Get unresolved conflicts
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getConflicts(limit = 100) {
    return this.prisma.pricebookSyncConflict.findMany({
      where: { status: 'unresolved' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Resolve a specific conflict
   * @param {string} conflictId
   * @param {'keep_st' | 'keep_local'} strategy
   * @param {string} [resolvedBy]
   * @returns {Promise<Object>}
   */
  async resolveConflict(conflictId, strategy, resolvedBy) {
    return this.conflictResolver.resolveConflictById(conflictId, strategy, resolvedBy);
  }
}

export default PricebookSyncEngine;
