/**
 * Service Comparator
 * Compares ServiceTitan services with local database
 */

export class ServiceComparator {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} logger
   */
  constructor(prisma, logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Compare ST services with local database
   * @param {Array} stServices - Services from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stServices, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local services
    const localServices = await this.prisma.pricebookService.findMany({
      where: { deletedAt: null },
    });

    // Create lookup maps
    const localByStId = new Map(localServices.map(s => [s.stId.toString(), s]));
    const stByStId = new Map(stServices.map(s => [s.id.toString(), s]));

    // Compare each ST service
    for (const stService of stServices) {
      const stId = stService.id.toString();
      const localService = localByStId.get(stId);

      if (!localService) {
        // New service
        result.new.push(stService);
      } else {
        // Check if modified
        const stModifiedOn = stService.modifiedOn ? new Date(stService.modifiedOn) : null;
        const localStModifiedOn = localService.stModifiedOn;

        const isModified = this.isModified(stService, localService, stModifiedOn, localStModifiedOn);

        if (isModified) {
          // Check for conflict (both modified since last sync)
          const hasConflict = this.hasConflict(localService, stModifiedOn);

          result.modified.push({
            stEntity: stService,
            localEntity: localService,
            hasConflict,
            changedFields: this.getChangedFields(stService, localService),
          });
        } else {
          result.unchanged.push({
            stEntity: stService,
            localEntity: localService,
          });
        }
      }
    }

    // Find deleted services (in local but not in ST)
    for (const localService of localServices) {
      const stId = localService.stId.toString();
      if (!stByStId.has(stId) && !localService.deletedInSt) {
        result.deleted.push(localService);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Service comparison complete'
    );

    return result;
  }

  /**
   * Check if service has been modified
   * @param {Object} stService
   * @param {Object} localService
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stService, localService, stModifiedOn, localStModifiedOn) {
    // If ST has a newer modification date
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    // Compare key fields
    return (
      stService.name !== localService.name ||
      stService.code !== localService.code ||
      stService.active !== localService.active ||
      this.pricesDiffer(stService.price, localService.price)
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
   * @param {Object} localService
   * @param {Date} stModifiedOn
   * @returns {boolean}
   */
  hasConflict(localService, stModifiedOn) {
    if (!localService.lastSyncedAt) return false;

    const localModifiedAfterSync = localService.localModifiedAt > localService.lastSyncedAt;
    const stModifiedAfterSync = stModifiedOn && stModifiedOn > localService.lastSyncedAt;

    return localModifiedAfterSync && stModifiedAfterSync;
  }

  /**
   * Get list of changed fields
   * @param {Object} stService
   * @param {Object} localService
   * @returns {Array<string>}
   */
  getChangedFields(stService, localService) {
    const changedFields = [];

    if (stService.name !== localService.name) changedFields.push('name');
    if (stService.code !== localService.code) changedFields.push('code');
    if (stService.description !== localService.description) changedFields.push('description');
    if (stService.active !== localService.active) changedFields.push('active');
    if (this.pricesDiffer(stService.price, localService.price)) changedFields.push('price');
    if (this.pricesDiffer(stService.memberPrice, localService.memberPrice)) changedFields.push('memberPrice');
    if (this.pricesDiffer(stService.durationHours, localService.durationHours)) changedFields.push('durationHours');

    return changedFields;
  }
}

export default ServiceComparator;
