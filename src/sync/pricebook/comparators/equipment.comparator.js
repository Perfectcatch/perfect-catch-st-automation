/**
 * Equipment Comparator
 * Compares ServiceTitan equipment with local database
 */

export class EquipmentComparator {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Compare ST equipment with local database
   * @param {Array} stEquipment - Equipment from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stEquipment, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local equipment
    const localEquipment = await this.prisma.pricebookEquipment.findMany({
      where: { deletedAt: null },
    });

    // Create lookup maps
    const localByStId = new Map(localEquipment.map(e => [e.stId.toString(), e]));
    const stByStId = new Map(stEquipment.map(e => [e.id.toString(), e]));

    // Compare each ST equipment
    for (const stItem of stEquipment) {
      const stId = stItem.id.toString();
      const localItem = localByStId.get(stId);

      if (!localItem) {
        // New equipment
        result.new.push(stItem);
      } else {
        // Check if modified
        const stModifiedOn = stItem.modifiedOn ? new Date(stItem.modifiedOn) : null;
        const localStModifiedOn = localItem.stModifiedOn;

        const isModified = this.isModified(stItem, localItem, stModifiedOn, localStModifiedOn);

        if (isModified) {
          // Check for conflict (both modified since last sync)
          const hasConflict = this.hasConflict(localItem, stModifiedOn);

          result.modified.push({
            stEntity: stItem,
            localEntity: localItem,
            hasConflict,
            changedFields: this.getChangedFields(stItem, localItem),
          });
        } else {
          result.unchanged.push({
            stEntity: stItem,
            localEntity: localItem,
          });
        }
      }
    }

    // Find deleted equipment (in local but not in ST)
    for (const localItem of localEquipment) {
      const stId = localItem.stId.toString();
      if (!stByStId.has(stId) && !localItem.deletedInSt) {
        result.deleted.push(localItem);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Equipment comparison complete'
    );

    return result;
  }

  /**
   * Check if equipment has been modified
   * @param {Object} stItem
   * @param {Object} localItem
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stItem, localItem, stModifiedOn, localStModifiedOn) {
    // If ST has a newer modification date
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    // Compare key fields
    return (
      stItem.name !== localItem.name ||
      stItem.code !== localItem.code ||
      stItem.active !== localItem.active ||
      this.pricesDiffer(stItem.price, localItem.price) ||
      this.pricesDiffer(stItem.cost, localItem.cost)
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
   * @param {Object} localItem
   * @param {Date} stModifiedOn
   * @returns {boolean}
   */
  hasConflict(localItem, stModifiedOn) {
    if (!localItem.lastSyncedAt) return false;

    const localModifiedAfterSync = localItem.localModifiedAt > localItem.lastSyncedAt;
    const stModifiedAfterSync = stModifiedOn && stModifiedOn > localItem.lastSyncedAt;

    return localModifiedAfterSync && stModifiedAfterSync;
  }

  /**
   * Get list of changed fields
   * @param {Object} stItem
   * @param {Object} localItem
   * @returns {Array<string>}
   */
  getChangedFields(stItem, localItem) {
    const changedFields = [];

    if (stItem.name !== localItem.name) changedFields.push('name');
    if (stItem.code !== localItem.code) changedFields.push('code');
    if (stItem.description !== localItem.description) changedFields.push('description');
    if (stItem.active !== localItem.active) changedFields.push('active');
    if (this.pricesDiffer(stItem.price, localItem.price)) changedFields.push('price');
    if (this.pricesDiffer(stItem.cost, localItem.cost)) changedFields.push('cost');
    if (this.pricesDiffer(stItem.memberPrice, localItem.memberPrice)) changedFields.push('memberPrice');
    if (stItem.manufacturer !== localItem.manufacturer) changedFields.push('manufacturer');
    if (stItem.modelNumber !== localItem.modelNumber) changedFields.push('modelNumber');

    return changedFields;
  }
}

export default EquipmentComparator;
