/**
 * Service Applier
 * Applies service changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';

export class ServiceApplier {
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
   * Create a new service from ST data
   * @param {Object} stService - Service from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stService, syncLogId) {
    const data = this.mapStToLocal(stService);

    // Find the local category UUID if exists
    if (stService.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stService.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const service = await this.prisma.pricebookService.create({
      data: {
        ...data,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncDirection: 'from_st',
      },
    });

    this.logger.info({ stId: stService.id, id: service.id }, 'Created service');

    // Log the change
    await this.logChange(service.id, stService.id, 'create', null, data, syncLogId);

    return service;
  }

  /**
   * Update an existing service with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stService - Service from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stService, syncLogId) {
    // Get current state for audit
    const oldService = await this.prisma.pricebookService.findUnique({
      where: { id: localId },
    });

    const data = this.mapStToLocal(stService);

    // Find the local category UUID if exists
    if (stService.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stService.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const service = await this.prisma.pricebookService.update({
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

    this.logger.info({ stId: stService.id, id: service.id }, 'Updated service');

    // Log the change
    await this.logChange(service.id, stService.id, 'update', oldService, data, syncLogId);

    return service;
  }

  /**
   * Soft delete a service
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    // Get current state for audit
    const oldService = await this.prisma.pricebookService.findUnique({
      where: { id: localId },
    });

    const service = await this.prisma.pricebookService.update({
      where: { id: localId },
      data: {
        deletedAt: new Date(),
        deletedInSt: true,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    this.logger.info({ id: localId, stId: oldService?.stId }, 'Soft deleted service');

    // Log the change
    await this.logChange(service.id, oldService?.stId, 'delete', oldService, null, syncLogId);

    return service;
  }

  /**
   * Map ServiceTitan service to local schema
   * @param {Object} stService
   * @returns {Object}
   */
  mapStToLocal(stService) {
    return {
      stId: BigInt(stService.id),
      tenantId: BigInt(this.tenantId),
      categoryId: stService.categoryId ? BigInt(stService.categoryId) : null,
      code: stService.code || '',
      name: stService.name || '',
      description: stService.description || null,
      displayName: stService.displayName || null,
      price: stService.price != null ? stService.price : null,
      memberPrice: stService.memberPrice != null ? stService.memberPrice : null,
      addOnPrice: stService.addOnPrice != null ? stService.addOnPrice : null,
      durationHours: stService.durationHours != null ? stService.durationHours : null,
      recommendedHours: stService.recommendedHours != null ? stService.recommendedHours : null,
      laborRate: stService.laborRate != null ? stService.laborRate : null,
      materialsIncluded: stService.materialsIncluded || [],
      equipmentIncluded: stService.equipmentIncluded || [],
      warrantyMonths: stService.warrantyMonths || null,
      commissionBonus: stService.commissionBonus != null ? stService.commissionBonus : null,
      payType: stService.payType || null,
      active: stService.active ?? true,
      taxable: stService.taxable ?? true,
      account: stService.account || null,
      images: stService.images || [],
      assets: stService.assets || [],
      customFields: stService.customFields || {},
      tags: stService.tags || [],
      externalData: stService.externalData || {},
      stCreatedOn: stService.createdOn ? new Date(stService.createdOn) : null,
      stModifiedOn: stService.modifiedOn ? new Date(stService.modifiedOn) : null,
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
          entityType: 'service',
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

export default ServiceApplier;
