/**
 * Category Applier
 * Applies category changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';

export class CategoryApplier {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Create a new category from ST data
   * @param {Object} stCategory - Category from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stCategory, syncLogId) {
    const data = this.mapStToLocal(stCategory);

    const category = await this.prisma.pricebookCategory.create({
      data: {
        ...data,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncDirection: 'from_st',
      },
    });

    this.logger.info({ stId: stCategory.id, id: category.id }, 'Created category');

    // Log the change
    await this.logChange(category.id, stCategory.id, 'create', null, data, syncLogId);

    return category;
  }

  /**
   * Update an existing category with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stCategory - Category from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stCategory, syncLogId) {
    // Get current state for audit
    const oldCategory = await this.prisma.pricebookCategory.findUnique({
      where: { id: localId },
    });

    const data = this.mapStToLocal(stCategory);

    const category = await this.prisma.pricebookCategory.update({
      where: { id: localId },
      data: {
        ...data,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncDirection: 'from_st',
        hasConflict: false,
        conflictData: null,
      },
    });

    this.logger.info({ stId: stCategory.id, id: category.id }, 'Updated category');

    // Log the change
    await this.logChange(category.id, stCategory.id, 'update', oldCategory, data, syncLogId);

    return category;
  }

  /**
   * Soft delete a category
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    // Get current state for audit
    const oldCategory = await this.prisma.pricebookCategory.findUnique({
      where: { id: localId },
    });

    const category = await this.prisma.pricebookCategory.update({
      where: { id: localId },
      data: {
        deletedAt: new Date(),
        deletedInSt: true,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    this.logger.info({ id: localId, stId: oldCategory?.stId }, 'Soft deleted category');

    // Log the change
    await this.logChange(category.id, oldCategory?.stId, 'delete', oldCategory, null, syncLogId);

    return category;
  }

  /**
   * Map ServiceTitan category to local schema
   * @param {Object} stCategory
   * @returns {Object}
   */
  mapStToLocal(stCategory) {
    return {
      stId: BigInt(stCategory.id),
      tenantId: BigInt(this.tenantId),
      name: stCategory.name,
      code: stCategory.code || null,
      parentId: stCategory.parentId ? BigInt(stCategory.parentId) : null,
      displayOrder: stCategory.displayOrder || 0,
      active: stCategory.active ?? true,
      categoryType: stCategory.categoryType || null,
      stCreatedOn: stCategory.createdOn ? new Date(stCategory.createdOn) : null,
      stModifiedOn: stCategory.modifiedOn ? new Date(stCategory.modifiedOn) : null,
    };
  }

  /**
   * Log a change to the audit table
   * @param {string} entityId
   * @param {BigInt} stId
   * @param {string} action
   * @param {Object} oldData
   * @param {Object} newData
   * @param {string} syncLogId
   */
  async logChange(entityId, stId, action, oldData, newData, syncLogId) {
    try {
      await this.prisma.pricebookChange.create({
        data: {
          entityType: 'category',
          entityId,
          stId: stId ? BigInt(stId) : null,
          action,
          source: 'sync_from_st',
          oldValues: oldData ? JSON.parse(JSON.stringify(oldData, this.bigIntReplacer)) : null,
          newValues: newData ? JSON.parse(JSON.stringify(newData, this.bigIntReplacer)) : null,
          fullSnapshot: newData ? JSON.parse(JSON.stringify(newData, this.bigIntReplacer)) : null,
          syncLogId,
        },
      });
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to log change');
    }
  }

  /**
   * JSON replacer for BigInt values
   */
  bigIntReplacer(key, value) {
    return typeof value === 'bigint' ? value.toString() : value;
  }
}

export default CategoryApplier;
