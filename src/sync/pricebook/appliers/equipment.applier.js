/**
 * Equipment Applier
 * Applies equipment changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';

export class EquipmentApplier {
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
   * Create a new equipment from ST data
   * @param {Object} stEquipment - Equipment from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stEquipment, syncLogId) {
    const data = this.mapStToLocal(stEquipment);

    // Find the local category UUID if exists
    if (stEquipment.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stEquipment.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const equipment = await this.prisma.pricebookEquipment.create({
      data: {
        ...data,
        lastSyncedAt: new Date(),
        syncStatus: 'synced',
        syncDirection: 'from_st',
      },
    });

    this.logger.info({ stId: stEquipment.id, id: equipment.id }, 'Created equipment');

    // Log the change
    await this.logChange(equipment.id, stEquipment.id, 'create', null, data, syncLogId);

    return equipment;
  }

  /**
   * Update an existing equipment with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stEquipment - Equipment from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stEquipment, syncLogId) {
    // Get current state for audit
    const oldEquipment = await this.prisma.pricebookEquipment.findUnique({
      where: { id: localId },
    });

    const data = this.mapStToLocal(stEquipment);

    // Find the local category UUID if exists
    if (stEquipment.categoryId) {
      const category = await this.prisma.pricebookCategory.findFirst({
        where: { stId: BigInt(stEquipment.categoryId) },
      });
      if (category) {
        data.categoryUuid = category.id;
      }
    }

    const equipment = await this.prisma.pricebookEquipment.update({
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

    this.logger.info({ stId: stEquipment.id, id: equipment.id }, 'Updated equipment');

    // Log the change
    await this.logChange(equipment.id, stEquipment.id, 'update', oldEquipment, data, syncLogId);

    return equipment;
  }

  /**
   * Soft delete equipment
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    // Get current state for audit
    const oldEquipment = await this.prisma.pricebookEquipment.findUnique({
      where: { id: localId },
    });

    const equipment = await this.prisma.pricebookEquipment.update({
      where: { id: localId },
      data: {
        deletedAt: new Date(),
        deletedInSt: true,
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    });

    this.logger.info({ id: localId, stId: oldEquipment?.stId }, 'Soft deleted equipment');

    // Log the change
    await this.logChange(equipment.id, oldEquipment?.stId, 'delete', oldEquipment, null, syncLogId);

    return equipment;
  }

  /**
   * Map ServiceTitan equipment to local schema
   * @param {Object} stEquipment
   * @returns {Object}
   */
  mapStToLocal(stEquipment) {
    // Extract default image URL from assets
    const defaultAsset = stEquipment.assets?.find(a => a.isDefault) || stEquipment.assets?.[0];
    const defaultImageUrl = defaultAsset?.url 
      ? `https://api.servicetitan.io/${defaultAsset.url}`
      : stEquipment.defaultAssetUrl 
        ? `https://api.servicetitan.io/${stEquipment.defaultAssetUrl}`
        : null;

    // Process assets to include full URLs
    const processedAssets = (stEquipment.assets || []).map(asset => ({
      ...asset,
      fullUrl: asset.url ? `https://api.servicetitan.io/${asset.url}` : null,
    }));

    return {
      stId: BigInt(stEquipment.id),
      tenantId: BigInt(this.tenantId),
      categoryId: stEquipment.categoryId ? BigInt(stEquipment.categoryId) : null,
      code: stEquipment.code || '',
      name: stEquipment.name || stEquipment.displayName || '',
      description: stEquipment.description || null,
      displayName: stEquipment.displayName || null,
      manufacturer: stEquipment.manufacturer || null,
      modelNumber: stEquipment.modelNumber || null,
      cost: stEquipment.cost != null ? stEquipment.cost : null,
      price: stEquipment.price != null ? stEquipment.price : null,
      memberPrice: stEquipment.memberPrice != null ? stEquipment.memberPrice : null,
      addOnPrice: stEquipment.addOnPrice != null ? stEquipment.addOnPrice : null,
      recommendedHours: stEquipment.recommendedHours != null ? stEquipment.recommendedHours : null,
      warrantyYears: stEquipment.warrantyYears || null,
      warrantyMonths: stEquipment.warrantyMonths || null,
      commissionBonus: stEquipment.commissionBonus != null ? stEquipment.commissionBonus : null,
      payType: stEquipment.payType || null,
      active: stEquipment.active ?? true,
      taxable: stEquipment.taxable ?? true,
      account: stEquipment.account || null,
      primaryVendorId: stEquipment.primaryVendor?.vendorId ? BigInt(stEquipment.primaryVendor.vendorId) : null,
      // New fields (snake_case for Prisma)
      primary_vendor: stEquipment.primaryVendor || {},
      other_vendors: stEquipment.otherVendors || [],
      category_ids: stEquipment.categories || [],
      default_image_url: defaultImageUrl,
      images: processedAssets.filter(a => a.type === 'Image'),
      assets: processedAssets,
      customFields: stEquipment.customFields || {},
      tags: stEquipment.tags || [],
      externalData: stEquipment.externalData || {},
      stCreatedOn: stEquipment.createdOn ? new Date(stEquipment.createdOn) : null,
      stModifiedOn: stEquipment.modifiedOn ? new Date(stEquipment.modifiedOn) : null,
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
          entityType: 'equipment',
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

export default EquipmentApplier;
