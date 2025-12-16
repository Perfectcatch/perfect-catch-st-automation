/**
 * Job Type Applier
 * Applies job type changes to the local PostgreSQL database
 */

import config from '../../../config/index.js';
import { db } from '../../../services/database.js';

export class JobTypeApplier {
  /**
   * @param {Object} logger
   */
  constructor(logger) {
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Create a new job type from ST data
   * @param {Object} stJobType - Job type from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async create(stJobType, syncLogId) {
    const data = this.mapStToLocal(stJobType);

    const result = await db.query(
      `INSERT INTO scheduling_job_types (
        st_id, tenant_id, name, category, active,
        last_synced_at, sync_status
      ) VALUES (
        $1, $2, $3, $4, $5, NOW(), 'synced'
      ) RETURNING *`,
      [
        data.st_id,
        data.tenant_id,
        data.name,
        data.category,
        data.active,
      ]
    );

    const jobType = result.rows[0];
    this.logger.info({ stId: stJobType.id, id: jobType.id }, 'Created job type');

    return jobType;
  }

  /**
   * Update an existing job type with ST data
   * @param {string} localId - Local UUID
   * @param {Object} stJobType - Job type from ServiceTitan
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async update(localId, stJobType, syncLogId) {
    const data = this.mapStToLocal(stJobType);

    const result = await db.query(
      `UPDATE scheduling_job_types SET
        name = $1,
        category = $2,
        active = $3,
        last_synced_at = NOW(),
        sync_status = 'synced'
      WHERE id = $4
      RETURNING *`,
      [
        data.name,
        data.category,
        data.active,
        localId,
      ]
    );

    const jobType = result.rows[0];
    this.logger.info({ stId: stJobType.id, id: jobType.id }, 'Updated job type');

    return jobType;
  }

  /**
   * Delete a job type (deactivate)
   * @param {string} localId - Local UUID
   * @param {string} syncLogId - ID of the sync log
   * @returns {Promise<Object>}
   */
  async delete(localId, syncLogId) {
    const result = await db.query(
      `UPDATE scheduling_job_types SET
        active = false,
        sync_status = 'synced',
        last_synced_at = NOW()
      WHERE id = $1
      RETURNING *`,
      [localId]
    );

    const jobType = result.rows[0];
    this.logger.info({ id: localId, stId: jobType?.st_id }, 'Deactivated job type');

    return jobType;
  }

  /**
   * Map ServiceTitan job type to local schema
   * @param {Object} stJobType
   * @returns {Object}
   */
  mapStToLocal(stJobType) {
    return {
      st_id: stJobType.id,
      tenant_id: this.tenantId,
      name: stJobType.name || '',
      category: stJobType.category || null,
      active: stJobType.active ?? true,
    };
  }
}

export default JobTypeApplier;
