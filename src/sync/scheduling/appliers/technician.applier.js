/**
 * Technician Applier
 * Applies technician changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';
import { db } from '../../../services/database.js';

export class TechnicianApplier {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Create a new technician from ST data
   * @param {Object} stTechnician - Technician from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stTechnician, syncLogId) {
    const data = this.mapStToLocal(stTechnician);

    const result = await db.query(
      `INSERT INTO raw_st_technicians (
        st_id, tenant_id, name, email, phone, team_id, team_name,
        zone_ids, role, employee_type, hourly_rate, active,
        st_created_on, st_modified_on, last_synced_at, sync_status, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), 'synced', $15
      ) RETURNING *`,
      [
        data.st_id,
        data.tenant_id,
        data.name,
        data.email,
        data.phone,
        data.team_id,
        data.team_name,
        data.zone_ids,
        data.role,
        data.employee_type,
        data.hourly_rate,
        data.active,
        data.st_created_on,
        data.st_modified_on,
        JSON.stringify(data.metadata || {}),
      ]
    );

    const technician = result.rows[0];
    this.logger.info({ stId: stTechnician.id, id: technician.id }, 'Created technician');

    return technician;
  }

  /**
   * Update an existing technician with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stTechnician - Technician from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stTechnician, syncLogId) {
    const data = this.mapStToLocal(stTechnician);

    const result = await db.query(
      `UPDATE raw_st_technicians SET
        name = $1,
        email = $2,
        phone = $3,
        team_id = $4,
        team_name = $5,
        zone_ids = $6,
        role = $7,
        employee_type = $8,
        hourly_rate = $9,
        active = $10,
        st_modified_on = $11,
        last_synced_at = NOW(),
        sync_status = 'synced'
      WHERE id = $12
      RETURNING *`,
      [
        data.name,
        data.email,
        data.phone,
        data.team_id,
        data.team_name,
        data.zone_ids,
        data.role,
        data.employee_type,
        data.hourly_rate,
        data.active,
        data.st_modified_on,
        localId,
      ]
    );

    const technician = result.rows[0];
    this.logger.info({ stId: stTechnician.id, id: technician.id }, 'Updated technician');

    return technician;
  }

  /**
   * Soft delete a technician
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    const result = await db.query(
      `UPDATE raw_st_technicians SET
        deleted_at = NOW(),
        deleted_in_st = true,
        sync_status = 'synced',
        last_synced_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [localId]
    );

    const technician = result.rows[0];
    this.logger.info({ id: localId, stId: technician?.st_id }, 'Soft deleted technician');

    return technician;
  }

  /**
   * Map ServiceTitan technician to local schema
   * @param {Object} stTechnician
   * @returns {Object}
   */
  mapStToLocal(stTechnician) {
    return {
      st_id: stTechnician.id,
      tenant_id: this.tenantId,
      name: stTechnician.name || '',
      email: stTechnician.email || null,
      phone: stTechnician.phoneNumber || null,
      team_id: stTechnician.teamId || null,
      team_name: stTechnician.teamName || null,
      zone_ids: stTechnician.zoneIds || [],
      role: stTechnician.role || null,
      employee_type: stTechnician.employeeType || null,
      hourly_rate: stTechnician.hourlyRate || null,
      active: stTechnician.active ?? true,
      st_created_on: stTechnician.createdOn ? new Date(stTechnician.createdOn) : null,
      st_modified_on: stTechnician.modifiedOn ? new Date(stTechnician.modifiedOn) : null,
      metadata: {
        businessUnitId: stTechnician.businessUnitId,
        loginName: stTechnician.loginName,
      },
    };
  }
}

export default TechnicianApplier;
