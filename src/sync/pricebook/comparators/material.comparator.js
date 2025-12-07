/**
 * Material Comparator
 * Compares ServiceTitan materials with local database
 */

export class MaterialComparator {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Compare ST materials with local database
   * @param {Array} stMaterials - Materials from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stMaterials, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local materials
    const localMaterials = await this.prisma.pricebookMaterial.findMany({
      where: { deletedAt: null },
    });

    // Create lookup maps
    const localByStId = new Map(localMaterials.map(m => [m.stId.toString(), m]));
    const stByStId = new Map(stMaterials.map(m => [m.id.toString(), m]));

    // Compare each ST material
    for (const stMaterial of stMaterials) {
      const stId = stMaterial.id.toString();
      const localMaterial = localByStId.get(stId);

      if (!localMaterial) {
        // New material
        result.new.push(stMaterial);
      } else {
        // Check if modified
        const stModifiedOn = stMaterial.modifiedOn ? new Date(stMaterial.modifiedOn) : null;
        const localStModifiedOn = localMaterial.stModifiedOn;

        const isModified = this.isModified(stMaterial, localMaterial, stModifiedOn, localStModifiedOn);

        if (isModified) {
          // Check for conflict (both modified since last sync)
          const hasConflict = this.hasConflict(localMaterial, stModifiedOn);

          result.modified.push({
            stEntity: stMaterial,
            localEntity: localMaterial,
            hasConflict,
            changedFields: this.getChangedFields(stMaterial, localMaterial),
          });
        } else {
          result.unchanged.push({
            stEntity: stMaterial,
            localEntity: localMaterial,
          });
        }
      }
    }

    // Find deleted materials (in local but not in ST)
    for (const localMaterial of localMaterials) {
      const stId = localMaterial.stId.toString();
      if (!stByStId.has(stId) && !localMaterial.deletedInSt) {
        result.deleted.push(localMaterial);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Material comparison complete'
    );

    return result;
  }

  /**
   * Check if material has been modified
   * @param {Object} stMaterial
   * @param {Object} localMaterial
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stMaterial, localMaterial, stModifiedOn, localStModifiedOn) {
    // If ST has a newer modification date
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    // Compare key fields
    return (
      stMaterial.name !== localMaterial.name ||
      stMaterial.code !== localMaterial.code ||
      stMaterial.active !== localMaterial.active ||
      this.pricesDiffer(stMaterial.price, localMaterial.price) ||
      this.pricesDiffer(stMaterial.cost, localMaterial.cost)
    );
  }

  /**
   * Compare prices accounting for decimal precision
   * @param {number} price1
   * @param {number} price2
   * @returns {boolean}
   */
  pricesDiffer(price1, price2) {
    if (price1 === null && price2 === null) return false;
    if (price1 === null || price2 === null) return true;
    return Math.abs(Number(price1) - Number(price2)) > 0.0001;
  }

  /**
   * Check if there's a conflict (both ST and local modified since last sync)
   * @param {Object} localMaterial
   * @param {Date} stModifiedOn
   * @returns {boolean}
   */
  hasConflict(localMaterial, stModifiedOn) {
    if (!localMaterial.lastSyncedAt) return false;

    const localModifiedAfterSync = localMaterial.localModifiedAt > localMaterial.lastSyncedAt;
    const stModifiedAfterSync = stModifiedOn && stModifiedOn > localMaterial.lastSyncedAt;

    return localModifiedAfterSync && stModifiedAfterSync;
  }

  /**
   * Get list of changed fields
   * @param {Object} stMaterial
   * @param {Object} localMaterial
   * @returns {Array<string>}
   */
  getChangedFields(stMaterial, localMaterial) {
    const changedFields = [];

    if (stMaterial.name !== localMaterial.name) changedFields.push('name');
    if (stMaterial.code !== localMaterial.code) changedFields.push('code');
    if (stMaterial.description !== localMaterial.description) changedFields.push('description');
    if (stMaterial.active !== localMaterial.active) changedFields.push('active');
    if (this.pricesDiffer(stMaterial.price, localMaterial.price)) changedFields.push('price');
    if (this.pricesDiffer(stMaterial.cost, localMaterial.cost)) changedFields.push('cost');
    if (this.pricesDiffer(stMaterial.memberPrice, localMaterial.memberPrice)) changedFields.push('memberPrice');
    if (stMaterial.unitOfMeasure !== localMaterial.unitOfMeasure) changedFields.push('unitOfMeasure');
    if (stMaterial.manufacturer !== localMaterial.manufacturer) changedFields.push('manufacturer');
    if (stMaterial.sku !== localMaterial.sku) changedFields.push('sku');

    return changedFields;
  }
}

export default MaterialComparator;
