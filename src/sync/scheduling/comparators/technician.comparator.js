/**
 * Technician Comparator
 * Compares ServiceTitan technicians with local database
 */

import { db } from '../../../services/database.js';

export class TechnicianComparator {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Compare ST technicians with local database
   * @param {Array} stTechnicians - Technicians from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stTechnicians, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local technicians
    const localResult = await db.query(
      'SELECT * FROM raw_st_technicians WHERE active = true'
    );
    const localTechnicians = localResult.rows;

    // Create lookup maps
    const localByStId = new Map(localTechnicians.map(t => [t.st_id.toString(), t]));
    const stByStId = new Map(stTechnicians.map(t => [t.id.toString(), t]));

    // Compare each ST technician
    for (const stTechnician of stTechnicians) {
      const stId = stTechnician.id.toString();
      const localTechnician = localByStId.get(stId);

      if (!localTechnician) {
        // New technician
        result.new.push(stTechnician);
      } else {
        // Check if modified
        const stModifiedOn = stTechnician.modifiedOn ? new Date(stTechnician.modifiedOn) : null;
        const localStModifiedOn = localTechnician.st_modified_on;

        const isModified = this.isModified(stTechnician, localTechnician, stModifiedOn, localStModifiedOn);

        if (isModified) {
          result.modified.push({
            stEntity: stTechnician,
            localEntity: localTechnician,
            hasConflict: false, // Scheduling data is one-way sync from ST
            changedFields: this.getChangedFields(stTechnician, localTechnician),
          });
        } else {
          result.unchanged.push({
            stEntity: stTechnician,
            localEntity: localTechnician,
          });
        }
      }
    }

    // Find deleted technicians (in local but not in ST)
    for (const localTechnician of localTechnicians) {
      const stId = localTechnician.st_id.toString();
      if (!stByStId.has(stId) && !localTechnician.deleted_in_st) {
        result.deleted.push(localTechnician);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Technician comparison complete'
    );

    return result;
  }

  /**
   * Check if technician has been modified
   * @param {Object} stTechnician
   * @param {Object} localTechnician
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stTechnician, localTechnician, stModifiedOn, localStModifiedOn) {
    // If ST has a newer modification date
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    // Compare key fields
    return (
      stTechnician.name !== localTechnician.name ||
      stTechnician.email !== localTechnician.email ||
      stTechnician.phoneNumber !== localTechnician.phone ||
      stTechnician.active !== localTechnician.active
    );
  }

  /**
   * Get list of changed fields
   * @param {Object} stTechnician
   * @param {Object} localTechnician
   * @returns {Array<string>}
   */
  getChangedFields(stTechnician, localTechnician) {
    const changedFields = [];

    if (stTechnician.name !== localTechnician.name) changedFields.push('name');
    if (stTechnician.email !== localTechnician.email) changedFields.push('email');
    if (stTechnician.phoneNumber !== localTechnician.phone) changedFields.push('phone');
    if (stTechnician.active !== localTechnician.active) changedFields.push('active');
    if (stTechnician.teamId !== (localTechnician.team_id ? Number(localTechnician.team_id) : null)) {
      changedFields.push('team_id');
    }

    return changedFields;
  }
}

export default TechnicianComparator;
