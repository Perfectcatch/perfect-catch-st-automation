/**
 * Conflict Resolver
 * Detects and resolves sync conflicts between ServiceTitan and local database
 */

export class ConflictResolver {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Detect conflicts in modified entities
   * @param {string} entityType - Type of entity (category, material, service, equipment)
   * @param {Array} modifiedEntities - Array of modified entity comparisons
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Array>} Array of detected conflicts
   */
  async detectConflicts(entityType, modifiedEntities, syncLogId) {
    const conflicts = [];

    for (const { stEntity, localEntity, hasConflict, changedFields } of modifiedEntities) {
      if (!hasConflict) continue;

      // Calculate diff between ST and local
      const diff = this.calculateDiff(stEntity, localEntity, changedFields);

      // Create conflict record
      const conflict = await this.prisma.pricebookSyncConflict.create({
        data: {
          entityType,
          entityId: localEntity.id,
          stId: BigInt(stEntity.id),
          conflictType: 'both_modified',
          stData: JSON.parse(JSON.stringify(stEntity, this.bigIntReplacer)),
          localData: JSON.parse(JSON.stringify(localEntity, this.bigIntReplacer)),
          diff,
          status: 'unresolved',
          syncLogId,
        },
      });

      // Mark entity as having conflict
      await this.markEntityConflict(entityType, localEntity.id, {
        conflictId: conflict.id,
        stData: stEntity,
        changedFields,
      });

      conflicts.push(conflict);

      this.logger.warn(
        {
          entityType,
          entityId: localEntity.id,
          stId: stEntity.id,
          changedFields,
        },
        'Conflict detected'
      );
    }

    return conflicts;
  }

  /**
   * Resolve conflicts with a given strategy
   * @param {Array} conflicts - Array of conflict records
   * @param {'keep_st' | 'keep_local'} strategy - Resolution strategy
   * @returns {Promise<Array>} Resolved conflicts
   */
  async resolveConflicts(conflicts, strategy) {
    const resolved = [];

    for (const conflict of conflicts) {
      try {
        const resolvedConflict = await this.resolveConflictById(conflict.id, strategy, 'system');
        resolved.push(resolvedConflict);
      } catch (error) {
        this.logger.error(
          { conflictId: conflict.id, error: error.message },
          'Failed to resolve conflict'
        );
      }
    }

    return resolved;
  }

  /**
   * Resolve a specific conflict by ID
   * @param {string} conflictId - ID of the conflict
   * @param {'keep_st' | 'keep_local'} strategy - Resolution strategy
   * @param {string} resolvedBy - Who resolved the conflict
   * @returns {Promise<Object>} Resolved conflict
   */
  async resolveConflictById(conflictId, strategy, resolvedBy) {
    const conflict = await this.prisma.pricebookSyncConflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      throw new Error(`Conflict not found: ${conflictId}`);
    }

    if (conflict.status !== 'unresolved') {
      throw new Error(`Conflict already resolved: ${conflictId}`);
    }

    let resolvedData;
    let status;

    if (strategy === 'keep_st') {
      resolvedData = conflict.stData;
      status = 'resolved_keep_st';

      // Apply ST data to local entity
      await this.applyResolution(conflict.entityType, conflict.entityId, conflict.stData);
    } else if (strategy === 'keep_local') {
      resolvedData = conflict.localData;
      status = 'resolved_keep_local';

      // Keep local data, just clear the conflict flag
      await this.clearEntityConflict(conflict.entityType, conflict.entityId);
    }

    // Update conflict record
    const resolvedConflict = await this.prisma.pricebookSyncConflict.update({
      where: { id: conflictId },
      data: {
        status,
        resolutionStrategy: strategy,
        resolvedData,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });

    this.logger.info(
      {
        conflictId,
        entityType: conflict.entityType,
        strategy,
        resolvedBy,
      },
      'Conflict resolved'
    );

    return resolvedConflict;
  }

  /**
   * Calculate diff between ST and local data
   * @param {Object} stEntity
   * @param {Object} localEntity
   * @param {Array<string>} changedFields
   * @returns {Object}
   */
  calculateDiff(stEntity, localEntity, changedFields) {
    const diff = {};

    for (const field of changedFields) {
      diff[field] = {
        st: stEntity[field],
        local: localEntity[field],
      };
    }

    return diff;
  }

  /**
   * Mark an entity as having a conflict
   * @param {string} entityType
   * @param {string} entityId
   * @param {Object} conflictData
   */
  async markEntityConflict(entityType, entityId, conflictData) {
    const model = this.getModel(entityType);

    await model.update({
      where: { id: entityId },
      data: {
        hasConflict: true,
        conflictData,
        syncStatus: 'conflict',
      },
    });
  }

  /**
   * Clear conflict flag from an entity
   * @param {string} entityType
   * @param {string} entityId
   */
  async clearEntityConflict(entityType, entityId) {
    const model = this.getModel(entityType);

    await model.update({
      where: { id: entityId },
      data: {
        hasConflict: false,
        conflictData: null,
        syncStatus: 'synced',
      },
    });
  }

  /**
   * Apply resolution data to an entity
   * @param {string} entityType
   * @param {string} entityId
   * @param {Object} data
   */
  async applyResolution(entityType, entityId, data) {
    const model = this.getModel(entityType);

    // Remove fields that shouldn't be updated
    const { id, createdAt, updatedAt, ...updateData } = data;

    await model.update({
      where: { id: entityId },
      data: {
        ...this.sanitizeData(updateData),
        hasConflict: false,
        conflictData: null,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Get Prisma model for entity type
   * @param {string} entityType
   * @returns {Object}
   */
  getModel(entityType) {
    const models = {
      category: this.prisma.pricebookCategory,
      material: this.prisma.pricebookMaterial,
      service: this.prisma.pricebookService,
      equipment: this.prisma.pricebookEquipment,
    };

    return models[entityType];
  }

  /**
   * Sanitize data for database update
   * @param {Object} data
   * @returns {Object}
   */
  sanitizeData(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip internal fields
      if (['id', 'createdAt', 'updatedAt', 'localCreatedAt', 'localModifiedAt'].includes(key)) {
        continue;
      }

      // Convert string numbers to BigInt where needed
      if (key === 'stId' || key === 'tenantId' || key === 'categoryId' || key === 'parentId') {
        sanitized[key] = value ? BigInt(value) : null;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * JSON replacer for BigInt values
   */
  bigIntReplacer(key, value) {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  /**
   * Get all unresolved conflicts
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getUnresolvedConflicts(filters = {}) {
    const where = { status: 'unresolved' };

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    return this.prisma.pricebookSyncConflict.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 100,
    });
  }

  /**
   * Get conflict statistics
   * @returns {Promise<Object>}
   */
  async getConflictStats() {
    const [total, unresolved, byType] = await Promise.all([
      this.prisma.pricebookSyncConflict.count(),
      this.prisma.pricebookSyncConflict.count({ where: { status: 'unresolved' } }),
      this.prisma.pricebookSyncConflict.groupBy({
        by: ['entityType', 'status'],
        _count: true,
      }),
    ]);

    return {
      total,
      unresolved,
      byType,
    };
  }
}

export default ConflictResolver;
