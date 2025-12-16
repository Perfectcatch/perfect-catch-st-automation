/**
 * Job Type Comparator
 * Compares ServiceTitan job types with local database
 */

import { db } from '../../../services/database.js';

export class JobTypeComparator {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Compare ST job types with local database
   * @param {Array} stJobTypes - Job types from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stJobTypes, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local job types
    const localResult = await db.query(
      'SELECT * FROM scheduling_job_types'
    );
    const localJobTypes = localResult.rows;

    // Create lookup maps
    const localByStId = new Map(localJobTypes.map(jt => [jt.st_id.toString(), jt]));
    const stByStId = new Map(stJobTypes.map(jt => [jt.id.toString(), jt]));

    // Compare each ST job type
    for (const stJobType of stJobTypes) {
      const stId = stJobType.id.toString();
      const localJobType = localByStId.get(stId);

      if (!localJobType) {
        // New job type
        result.new.push(stJobType);
      } else {
        // Check if modified
        const stModifiedOn = stJobType.modifiedOn ? new Date(stJobType.modifiedOn) : null;
        const localStModifiedOn = localJobType.st_modified_on;

        const isModified = this.isModified(stJobType, localJobType, stModifiedOn, localStModifiedOn);

        if (isModified) {
          result.modified.push({
            stEntity: stJobType,
            localEntity: localJobType,
            hasConflict: false,
            changedFields: this.getChangedFields(stJobType, localJobType),
          });
        } else {
          result.unchanged.push({
            stEntity: stJobType,
            localEntity: localJobType,
          });
        }
      }
    }

    // Find deleted job types (in local but not in ST)
    for (const localJobType of localJobTypes) {
      const stId = localJobType.st_id.toString();
      if (!stByStId.has(stId)) {
        result.deleted.push(localJobType);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Job type comparison complete'
    );

    return result;
  }

  /**
   * Check if job type has been modified
   * @param {Object} stJobType
   * @param {Object} localJobType
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stJobType, localJobType, stModifiedOn, localStModifiedOn) {
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    return (
      stJobType.name !== localJobType.name ||
      stJobType.active !== localJobType.active
    );
  }

  /**
   * Get list of changed fields
   * @param {Object} stJobType
   * @param {Object} localJobType
   * @returns {Array<string>}
   */
  getChangedFields(stJobType, localJobType) {
    const changedFields = [];

    if (stJobType.name !== localJobType.name) changedFields.push('name');
    if (stJobType.active !== localJobType.active) changedFields.push('active');

    return changedFields;
  }
}

export default JobTypeComparator;
