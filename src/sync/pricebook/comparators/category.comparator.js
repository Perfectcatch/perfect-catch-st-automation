/**
 * Category Comparator
 * Compares ServiceTitan categories with local database
 */

export class CategoryComparator {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Compare ST categories with local database
   * @param {Array} stCategories - Categories from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stCategories, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local categories
    const localCategories = await this.prisma.pricebookCategory.findMany({
      where: { deletedAt: null },
    });

    // Create lookup maps
    const localByStId = new Map(localCategories.map(c => [c.stId.toString(), c]));
    const stByStId = new Map(stCategories.map(c => [c.id.toString(), c]));

    // Compare each ST category
    for (const stCategory of stCategories) {
      const stId = stCategory.id.toString();
      const localCategory = localByStId.get(stId);

      if (!localCategory) {
        // New category
        result.new.push(stCategory);
      } else {
        // Check if modified
        const stModifiedOn = stCategory.modifiedOn ? new Date(stCategory.modifiedOn) : null;
        const localStModifiedOn = localCategory.stModifiedOn;

        const isModified = this.isModified(stCategory, localCategory, stModifiedOn, localStModifiedOn);

        if (isModified) {
          // Check for conflict (both modified since last sync)
          const hasConflict = this.hasConflict(localCategory, stModifiedOn);

          result.modified.push({
            stEntity: stCategory,
            localEntity: localCategory,
            hasConflict,
            changedFields: this.getChangedFields(stCategory, localCategory),
          });
        } else {
          result.unchanged.push({
            stEntity: stCategory,
            localEntity: localCategory,
          });
        }
      }
    }

    // Find deleted categories (in local but not in ST)
    for (const localCategory of localCategories) {
      const stId = localCategory.stId.toString();
      if (!stByStId.has(stId) && !localCategory.deletedInSt) {
        result.deleted.push(localCategory);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Category comparison complete'
    );

    return result;
  }

  /**
   * Check if category has been modified
   * @param {Object} stCategory
   * @param {Object} localCategory
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stCategory, localCategory, stModifiedOn, localStModifiedOn) {
    // If ST has a newer modification date
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    // Compare key fields
    return (
      stCategory.name !== localCategory.name ||
      stCategory.code !== localCategory.code ||
      stCategory.active !== localCategory.active ||
      stCategory.parentId !== (localCategory.parentId ? Number(localCategory.parentId) : null)
    );
  }

  /**
   * Check if there's a conflict (both ST and local modified since last sync)
   * @param {Object} localCategory
   * @param {Date} stModifiedOn
   * @returns {boolean}
   */
  hasConflict(localCategory, stModifiedOn) {
    if (!localCategory.lastSyncedAt) return false;

    const localModifiedAfterSync = localCategory.localModifiedAt > localCategory.lastSyncedAt;
    const stModifiedAfterSync = stModifiedOn && stModifiedOn > localCategory.lastSyncedAt;

    return localModifiedAfterSync && stModifiedAfterSync;
  }

  /**
   * Get list of changed fields
   * @param {Object} stCategory
   * @param {Object} localCategory
   * @returns {Array<string>}
   */
  getChangedFields(stCategory, localCategory) {
    const changedFields = [];

    if (stCategory.name !== localCategory.name) changedFields.push('name');
    if (stCategory.code !== localCategory.code) changedFields.push('code');
    if (stCategory.active !== localCategory.active) changedFields.push('active');
    if (stCategory.parentId !== (localCategory.parentId ? Number(localCategory.parentId) : null)) {
      changedFields.push('parentId');
    }
    if (stCategory.displayOrder !== localCategory.displayOrder) changedFields.push('displayOrder');

    return changedFields;
  }
}

export default CategoryComparator;
