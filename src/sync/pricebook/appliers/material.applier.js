/**
 * Material Applier
 * Applies material changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';

export class MaterialApplier {
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
   * Create a new material from ST data
   * @param {Object} stMaterial - Material from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stMaterial, syncLogId) {
    const data = this.mapStToLocal(stMaterial);

    // Find the local category UUID if exists
    if (stMaterial.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stMaterial.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const material = await this.prisma.pricebookMaterial.create({
      data: {
        ...data,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncDirection: 'from_st',
      },
    });

    this.logger.info({ stId: stMaterial.id, id: material.id }, 'Created material');

    // Log the change
    await this.logChange(material.id, stMaterial.id, 'create', null, data, syncLogId);

    return material;
  }

  /**
   * Update an existing material with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stMaterial - Material from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stMaterial, syncLogId) {
    // Get current state for audit
    const oldMaterial = await this.prisma.pricebookMaterial.findUnique({
      where: { id: localId },
    });

    const data = this.mapStToLocal(stMaterial);

    // Find the local category UUID if exists
    if (stMaterial.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stMaterial.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const material = await this.prisma.pricebookMaterial.update({
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

    this.logger.info({ stId: stMaterial.id, id: material.id }, 'Updated material');

    // Log the change
    await this.logChange(material.id, stMaterial.id, 'update', oldMaterial, data, syncLogId);

    return material;
  }

  /**
   * Soft delete a material
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    // Get current state for audit
    const oldMaterial = await this.prisma.pricebookMaterial.findUnique({
      where: { id: localId },
    });

    const material = await this.prisma.pricebookMaterial.update({
      where: { id: localId },
      data: {
        deletedAt: new Date(),
        deletedInSt: true,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    this.logger.info({ id: localId, stId: oldMaterial?.stId }, 'Soft deleted material');

    // Log the change
    await this.logChange(material.id, oldMaterial?.stId, 'delete', oldMaterial, null, syncLogId);

    return material;
  }

  /**
   * Map ServiceTitan material to local schema
   * @param {Object} stMaterial
   * @returns {Object}
   */
  mapStToLocal(stMaterial) {
    return {
      stId: BigInt(stMaterial.id),
      tenantId: BigInt(this.tenantId),
      categoryId: stMaterial.categoryId ? BigInt(stMaterial.categoryId) : null,
      code: stMaterial.code || '',
      name: stMaterial.name || '',
      description: stMaterial.description || null,
      displayName: stMaterial.displayName || null,
      manufacturer: stMaterial.manufacturer || null,
      modelNumber: stMaterial.modelNumber || null,
      upc: stMaterial.upc || null,
      sku: stMaterial.sku || null,
      partNumber: stMaterial.partNumber || null,
      cost: stMaterial.cost != null ? stMaterial.cost : null,
      price: stMaterial.price != null ? stMaterial.price : null,
      memberPrice: stMaterial.memberPrice != null ? stMaterial.memberPrice : null,
      addOnPrice: stMaterial.addOnPrice != null ? stMaterial.addOnPrice : null,
      hours: stMaterial.hours != null ? stMaterial.hours : null,
      unitOfMeasure: stMaterial.unitOfMeasure || null,
      quantityOnHand: stMaterial.quantityOnHand != null ? stMaterial.quantityOnHand : null,
      quantityOnOrder: stMaterial.quantityOnOrder != null ? stMaterial.quantityOnOrder : null,
      warrantyMonths: stMaterial.warrantyMonths || null,
      commissionBonus: stMaterial.commissionBonus != null ? stMaterial.commissionBonus : null,
      payType: stMaterial.payType || null,
      active: stMaterial.active ?? true,
      taxable: stMaterial.taxable ?? true,
      crossSell: stMaterial.crossSell ?? false,
      account: stMaterial.account || null,
      primaryVendorId: stMaterial.primaryVendorId ? BigInt(stMaterial.primaryVendorId) : null,
      images: stMaterial.images || [],
      assets: stMaterial.assets || [],
      customFields: stMaterial.customFields || {},
      tags: stMaterial.tags || [],
      externalData: stMaterial.externalData || {},
      stCreatedOn: stMaterial.createdOn ? new Date(stMaterial.createdOn) : null,
      stModifiedOn: stMaterial.modifiedOn ? new Date(stMaterial.modifiedOn) : null,
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
          entityType: 'material',
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

export default MaterialApplier;
