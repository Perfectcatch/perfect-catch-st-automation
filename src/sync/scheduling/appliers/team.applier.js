/**
 * Team Applier
 * Applies team changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';
import { db } from '../../../services/database.js';

export class TeamApplier {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Create a new team from ST data
   * @param {Object} stTeam - Team from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stTeam, syncLogId) {
    const data = this.mapStToLocal(stTeam);

    const result = await db.query(
      `INSERT INTO scheduling_teams (
        st_id, tenant_id, name, active,
        st_created_on, st_modified_on, last_synced_at, sync_status, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), 'synced', $7
      ) RETURNING *`,
      [
        data.st_id,
        data.tenant_id,
        data.name,
        data.active,
        data.st_created_on,
        data.st_modified_on,
        JSON.stringify(data.metadata || {}),
      ]
    );

    const team = result.rows[0];
    this.logger.info({ stId: stTeam.id, id: team.id }, 'Created team');

    return team;
  }

  /**
   * Update an existing team with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stTeam - Team from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stTeam, syncLogId) {
    const data = this.mapStToLocal(stTeam);

    const result = await db.query(
      `UPDATE scheduling_teams SET
        name = $1,
        active = $2,
        st_modified_on = $3,
        last_synced_at = NOW(),
        sync_status = 'synced'
      WHERE id = $4
      RETURNING *`,
      [
        data.name,
        data.active,
        data.st_modified_on,
        localId,
      ]
    );

    const team = result.rows[0];
    this.logger.info({ stId: stTeam.id, id: team.id }, 'Updated team');

    return team;
  }

  /**
   * Delete a team (hard delete since teams table doesn't have soft delete)
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    // Set active to false instead of hard delete
    const result = await db.query(
      `UPDATE scheduling_teams SET
        active = false,
        sync_status = 'synced',
        last_synced_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [localId]
    );

    const team = result.rows[0];
    this.logger.info({ id: localId, stId: team?.st_id }, 'Deactivated team');

    return team;
  }

  /**
   * Map ServiceTitan team to local schema
   * @param {Object} stTeam
   * @returns {Object}
   */
  mapStToLocal(stTeam) {
    return {
      st_id: stTeam.id,
      tenant_id: this.tenantId,
      name: stTeam.name || '',
      active: stTeam.active ?? true,
      st_created_on: stTeam.createdOn ? new Date(stTeam.createdOn) : null,
      st_modified_on: stTeam.modifiedOn ? new Date(stTeam.modifiedOn) : null,
      metadata: {},
    };
  }
}

export default TeamApplier;
