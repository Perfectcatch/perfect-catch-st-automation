/**
 * Zone Applier
 * Applies zone changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';
import { db } from '../../../services/database.js';

export class ZoneApplier {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Create a new zone from ST data
   * @param {Object} stZone - Zone from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stZone, syncLogId) {
    const data = this.mapStToLocal(stZone);

    const result = await db.query(
      `INSERT INTO scheduling_zones (
        st_id, tenant_id, name, active, center_lat, center_lng,
        st_created_on, st_modified_on, last_synced_at, sync_status, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'synced', $9
      ) RETURNING *`,
      [
        data.st_id,
        data.tenant_id,
        data.name,
        data.active,
        data.center_lat,
        data.center_lng,
        data.st_created_on,
        data.st_modified_on,
        JSON.stringify(data.metadata || {}),
      ]
    );

    const zone = result.rows[0];
    this.logger.info({ stId: stZone.id, id: zone.id }, 'Created zone');

    return zone;
  }

  /**
   * Update an existing zone with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stZone - Zone from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stZone, syncLogId) {
    const data = this.mapStToLocal(stZone);

    const result = await db.query(
      `UPDATE scheduling_zones SET
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

    const zone = result.rows[0];
    this.logger.info({ stId: stZone.id, id: zone.id }, 'Updated zone');

    return zone;
  }

  /**
   * Delete a zone (deactivate)
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    const result = await db.query(
      `UPDATE scheduling_zones SET
        active = false,
        sync_status = 'synced',
        last_synced_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [localId]
    );

    const zone = result.rows[0];
    this.logger.info({ id: localId, stId: zone?.st_id }, 'Deactivated zone');

    return zone;
  }

  /**
   * Map ServiceTitan zone to local schema
   * @param {Object} stZone
   * @returns {Object}
   */
  mapStToLocal(stZone) {
    return {
      st_id: stZone.id,
      tenant_id: this.tenantId,
      name: stZone.name || '',
      active: stZone.active ?? true,
      center_lat: null, // Can be populated from geo lookup later
      center_lng: null,
      st_created_on: stZone.createdOn ? new Date(stZone.createdOn) : null,
      st_modified_on: stZone.modifiedOn ? new Date(stZone.modifiedOn) : null,
      metadata: {},
    };
  }
}

export default ZoneApplier;
