/**
 * Enhanced Technicians Sync Module
 * Syncs technicians/employees with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class TechnicianSync extends SyncBase {
  constructor() {
    super('technicians');
  }
  
  async fetchList() {
    let technicians = [];
    let employees = [];
    
    // Try technicians endpoint
    try {
      this.logger.info('[technicians] Fetching from /settings/v2/technicians...');
      technicians = await fetchAllPages('/settings/v2/tenant/{tenant}/technicians');
      this.logger.info(`[technicians] Found ${technicians.length} technicians`);
    } catch (e) {
      this.logger.warn('[technicians] Technicians endpoint failed:', e.message);
    }
    
    // Try employees endpoint
    try {
      this.logger.info('[technicians] Fetching from /settings/v2/employees...');
      employees = await fetchAllPages('/settings/v2/tenant/{tenant}/employees');
      this.logger.info(`[technicians] Found ${employees.length} employees`);
    } catch (e) {
      this.logger.warn('[technicians] Employees endpoint failed:', e.message);
    }
    
    // Combine and deduplicate
    const combined = [...technicians];
    for (const emp of employees) {
      if (!combined.find(t => t.id === emp.id)) {
        combined.push({ ...emp, _source: 'employees' });
      }
    }
    
    this.logger.info(`[technicians] Combined total: ${combined.length}`);
    return combined;
  }
  
  async enrichOne(tech) {
    try {
      const endpoint = tech._source === 'employees' 
        ? '/settings/v2/tenant/{tenant}/employees'
        : '/settings/v2/tenant/{tenant}/technicians';
        
      const details = await fetchDetails(endpoint, tech.id);
      return {
        ...(details || tech),
        _enrichedAt: new Date()
      };
    } catch (e) {
      return {
        ...tech,
        _enrichedAt: new Date()
      };
    }
  }
  
  async transformOne(tech) {
    return {
      st_id: BigInt(tech.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // Name
      name: tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim(),
      first_name: tech.firstName || null,
      last_name: tech.lastName || null,
      
      // Contact
      email: tech.email || null,
      phone: tech.phone || tech.phoneNumber || null,
      
      // Role
      role: tech.role || tech.employeeType || 'Technician',
      is_technician: tech.isTechnician !== false,
      
      // Business unit
      business_unit_id: tech.businessUnitId ? BigInt(tech.businessUnitId) : null,
      
      // Status
      active: tech.active !== false,
      
      // Skills
      skills: tech.skills || tech.certifications || [],
      
      // Timestamps
      hire_date: tech.hireDate ? new Date(tech.hireDate) : null,
      st_created_on: tech.createdOn ? new Date(tech.createdOn) : new Date(),
      st_modified_on: tech.modifiedOn ? new Date(tech.modifiedOn) : new Date(),
      
      // Raw data
      full_data: tech,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(tech) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_technicians WHERE st_id = $1',
        [tech.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_technicians (
            st_id, tenant_id, name, first_name, last_name,
            email, phone, role, is_technician,
            business_unit_id, active, skills, hire_date,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17
          )
        `, [
          tech.st_id,
          tech.tenant_id,
          tech.name,
          tech.first_name,
          tech.last_name,
          tech.email,
          tech.phone,
          tech.role,
          tech.is_technician,
          tech.business_unit_id,
          tech.active,
          JSON.stringify(tech.skills),
          tech.hire_date,
          tech.st_created_on,
          tech.st_modified_on,
          JSON.stringify(tech.full_data),
          tech.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_technicians SET
            name = $2, first_name = $3, last_name = $4,
            email = $5, phone = $6, role = $7, is_technician = $8,
            business_unit_id = $9, active = $10, skills = $11, hire_date = $12,
            st_modified_on = $13, full_data = $14, last_synced_at = $15
          WHERE st_id = $1
        `, [
          tech.st_id,
          tech.name,
          tech.first_name,
          tech.last_name,
          tech.email,
          tech.phone,
          tech.role,
          tech.is_technician,
          tech.business_unit_id,
          tech.active,
          JSON.stringify(tech.skills),
          tech.hire_date,
          tech.st_modified_on,
          JSON.stringify(tech.full_data),
          tech.last_synced_at
        ]);
      }
      
      // Also update st_employees table
      try {
        await client.query(`
          INSERT INTO st_employees (st_id, tenant_id, name, email, role, business_unit_id, active, full_data, last_synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            name = $3, email = $4, role = $5, business_unit_id = $6, active = $7, full_data = $8, last_synced_at = NOW()
        `, [
          tech.st_id,
          tech.tenant_id,
          tech.name,
          tech.email,
          tech.role,
          tech.business_unit_id,
          tech.active,
          JSON.stringify(tech.full_data)
        ]);
      } catch (e) {
        // st_employees table might not exist
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
  
  async postProcess() {
    this.logger.info('[technicians] Calculating performance metrics...');
    
    const client = await getPool().connect();
    try {
      await client.query(`
        UPDATE st_technicians t
        SET 
          total_jobs = COALESCE(stats.job_count, 0),
          completed_jobs = COALESCE(stats.completed_count, 0),
          total_revenue = COALESCE(stats.revenue, 0)
        FROM (
          SELECT 
            technician_id,
            COUNT(*) as job_count,
            COUNT(CASE WHEN job_status = 'Completed' THEN 1 END) as completed_count,
            COALESCE(SUM(inv.total), 0) as revenue
          FROM st_jobs j
          LEFT JOIN st_invoices inv ON inv.job_id = j.st_id
          WHERE technician_id IS NOT NULL
          GROUP BY technician_id
        ) stats
        WHERE t.st_id = stats.technician_id
      `);
    } finally {
      client.release();
    }
  }
}

export const technicianSync = new TechnicianSync();

export async function syncTechnicians() {
  return technicianSync.run();
}

export default { TechnicianSync, syncTechnicians };
