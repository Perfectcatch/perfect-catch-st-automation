/**
 * Team Comparator
 * Compares ServiceTitan teams with local database
 */

import { db } from '../../../services/database.js';

export class TeamComparator {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Compare ST teams with local database
   * @param {Array} stTeams - Teams from ServiceTitan
   * @param {boolean} fullSync - Whether this is a full sync
   * @returns {Promise<Object>} Comparison result
   */
  async compare(stTeams, fullSync = false) {
    const result = {
      new: [],
      modified: [],
      unchanged: [],
      deleted: [],
    };

    // Get all local teams
    const localResult = await db.query(
      'SELECT * FROM raw_st_teams'
    );
    const localTeams = localResult.rows;

    // Create lookup maps
    const localByStId = new Map(localTeams.map(t => [t.st_id.toString(), t]));
    const stByStId = new Map(stTeams.map(t => [t.id.toString(), t]));

    // Compare each ST team
    for (const stTeam of stTeams) {
      const stId = stTeam.id.toString();
      const localTeam = localByStId.get(stId);

      if (!localTeam) {
        // New team
        result.new.push(stTeam);
      } else {
        // Check if modified
        const stModifiedOn = stTeam.modifiedOn ? new Date(stTeam.modifiedOn) : null;
        const localStModifiedOn = localTeam.st_modified_on;

        const isModified = this.isModified(stTeam, localTeam, stModifiedOn, localStModifiedOn);

        if (isModified) {
          result.modified.push({
            stEntity: stTeam,
            localEntity: localTeam,
            hasConflict: false,
            changedFields: this.getChangedFields(stTeam, localTeam),
          });
        } else {
          result.unchanged.push({
            stEntity: stTeam,
            localEntity: localTeam,
          });
        }
      }
    }

    // Find deleted teams (in local but not in ST)
    for (const localTeam of localTeams) {
      const stId = localTeam.st_id.toString();
      if (!stByStId.has(stId)) {
        result.deleted.push(localTeam);
      }
    }

    this.logger.info(
      {
        new: result.new.length,
        modified: result.modified.length,
        unchanged: result.unchanged.length,
        deleted: result.deleted.length,
      },
      'Team comparison complete'
    );

    return result;
  }

  /**
   * Check if team has been modified
   * @param {Object} stTeam
   * @param {Object} localTeam
   * @param {Date} stModifiedOn
   * @param {Date} localStModifiedOn
   * @returns {boolean}
   */
  isModified(stTeam, localTeam, stModifiedOn, localStModifiedOn) {
    if (stModifiedOn && localStModifiedOn) {
      return stModifiedOn > localStModifiedOn;
    }

    return (
      stTeam.name !== localTeam.name ||
      stTeam.active !== localTeam.active
    );
  }

  /**
   * Get list of changed fields
   * @param {Object} stTeam
   * @param {Object} localTeam
   * @returns {Array<string>}
   */
  getChangedFields(stTeam, localTeam) {
    const changedFields = [];

    if (stTeam.name !== localTeam.name) changedFields.push('name');
    if (stTeam.active !== localTeam.active) changedFields.push('active');

    return changedFields;
  }
}

export default TeamComparator;
