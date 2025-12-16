/**
 * Zone Comparator
 * Compares ServiceTitan zones with local database
 */

import { db } from '../../../services/database.js';

export class ZoneComparator {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Compare ST zones with local database
   * @param {Array} stZones - Zones from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stZones, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local zones
    const localResult = await db.query(
      'SELECT * FROM scheduling_zones'
    );
    const localZones = localResult.rows;

    // Create lookup maps
    const localByStId = new Map(localZones.map(z => [z.st_id.toString(), z]));
    const stByStId = new Map(stZones.map(z => [z.id.toString(), z]));

    // Compare each ST zone
    for (const stZone of stZones) {
      const stId = stZone.id.toString();
      const localZone = localByStId.get(stId);

      if (!localZone) {
        // New zone
        result.new.push(stZone);
      } else {
        // Check if modified
        const stModifiedOn = stZone.modifiedOn ? new Date(stZone.modifiedOn) : null;
        const localStModifiedOn = localZone.st_modified_on;

        const isModified = this.isModified(stZone, localZone, stModifiedOn, localStModifiedOn);

        if (isModified) {
          result.modified.push({
            stEntity: stZone,
            localEntity: localZone,
            hasConflict: false,
            changedFields: this.getChangedFields(stZone, localZone),
          });
        } else {
          result.unchanged.push({
            stEntity: stZone,
            localEntity: localZone,
          });
        }
      }
    }

    // Find deleted zones (in local but not in ST)
    for (const localZone of localZones) {
      const stId = localZone.st_id.toString();
      if (!stByStId.has(stId)) {
        result.deleted.push(localZone);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Zone comparison complete'
    );

    return result;
  }

  /**
   * Check if zone has been modified
   * @param {Object} stZone
   * @param {Object} localZone
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stZone, localZone, stModifiedOn, localStModifiedOn) {
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    return (
      stZone.name !== localZone.name ||
      stZone.active !== localZone.active
    );
  }

  /**
   * Get list of changed fields
   * @param {Object} stZone
   * @param {Object} localZone
   * @returns {Array<string>}
   */
  getChangedFields(stZone, localZone) {
    const changedFields = [];

    if (stZone.name !== localZone.name) changedFields.push('name');
    if (stZone.active !== localZone.active) changedFields.push('active');

    return changedFields;
  }
}

export default ZoneComparator;
