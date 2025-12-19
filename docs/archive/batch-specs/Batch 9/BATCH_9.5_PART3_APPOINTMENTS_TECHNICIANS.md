# BATCH 9.5 - PART 3: APPOINTMENTS, TECHNICIANS, REFERENCE DATA

## File 7: Complete Appointments Sync

**File:** `src/services/sync/sync-appointments.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class AppointmentSync extends SyncBase {
  constructor() {
    super('appointments');
  }
  
  async fetchList() {
    // Try multiple endpoint patterns (ServiceTitan API varies)
    const endpoints = [
      '/dispatch/v2/tenant/{tenant}/appointments',
      '/jpm/v2/tenant/{tenant}/appointments',
      '/scheduling/v2/tenant/{tenant}/appointments'
    ];
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysForward = new Date();
    sixtyDaysForward.setDate(sixtyDaysForward.getDate() + 60);
    
    for (const endpoint of endpoints) {
      try {
        logger.info(`[appointments] Trying endpoint: ${endpoint}`);
        
        const result = await stClient.fetchAllPages(endpoint, {
          startsOnOrAfter: thirtyDaysAgo.toISOString(),
          startsOnOrBefore: sixtyDaysForward.toISOString()
        });
        
        logger.info(`[appointments] Found ${result.length} appointments`);
        return result;
        
      } catch (error) {
        logger.warn(`[appointments] Endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }
    
    // If all endpoints fail, try fetching through jobs
    logger.info('[appointments] Trying to fetch appointments via jobs...');
    return this.fetchAppointmentsViaJobs();
  }
  
  async fetchAppointmentsViaJobs() {
    // Alternative: Get appointments from job details
    const jobs = await prisma.st_jobs.findMany({
      where: {
        job_status: { in: ['Scheduled', 'Dispatched', 'InProgress'] }
      },
      select: { st_id: true, full_data: true }
    });
    
    const appointments = [];
    
    for (const job of jobs) {
      const jobData = job.full_data || {};
      if (jobData.appointments && jobData.appointments.length > 0) {
        appointments.push(...jobData.appointments.map(apt => ({
          ...apt,
          jobId: Number(job.st_id)
        })));
      }
    }
    
    return appointments;
  }
  
  async enrichOne(appointment) {
    // Try to get full appointment details
    try {
      const details = await stClient.get(`/dispatch/v2/tenant/{tenant}/appointments/${appointment.id}`);
      return {
        ...details,
        _enrichedAt: new Date()
      };
    } catch (e) {
      // Return what we have
      return {
        ...appointment,
        _enrichedAt: new Date()
      };
    }
  }
  
  async transformOne(appointment) {
    return {
      st_id: BigInt(appointment.id),
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
      // References
      job_id: appointment.jobId ? BigInt(appointment.jobId) : null,
      customer_id: appointment.customerId ? BigInt(appointment.customerId) : null,
      location_id: appointment.locationId ? BigInt(appointment.locationId) : null,
      technician_id: appointment.technicianId ? BigInt(appointment.technicianId) : null,
      
      // Appointment info
      appointment_number: appointment.number || `APT${appointment.id}`,
      status: appointment.status || 'Scheduled',
      type: appointment.type || appointment.appointmentType || null,
      
      // Scheduling
      start_time: appointment.start ? new Date(appointment.start) : 
                  appointment.scheduledStart ? new Date(appointment.scheduledStart) : null,
      end_time: appointment.end ? new Date(appointment.end) :
                appointment.scheduledEnd ? new Date(appointment.scheduledEnd) : null,
      duration_minutes: appointment.duration || 60,
      
      // Arrival
      arrival_window_start: appointment.arrivalWindowStart ? new Date(appointment.arrivalWindowStart) : null,
      arrival_window_end: appointment.arrivalWindowEnd ? new Date(appointment.arrivalWindowEnd) : null,
      actual_arrival: appointment.actualArrival ? new Date(appointment.actualArrival) : null,
      actual_departure: appointment.actualDeparture ? new Date(appointment.actualDeparture) : null,
      
      // Technician info (denormalized for convenience)
      technician_name: appointment.technicianName || null,
      
      // Notes
      notes: appointment.notes || appointment.specialInstructions || null,
      
      // Timestamps
      st_created_on: appointment.createdOn ? new Date(appointment.createdOn) : new Date(),
      st_modified_on: appointment.modifiedOn ? new Date(appointment.modifiedOn) : new Date(),
      
      // Raw data
      full_data: appointment,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(appointment) {
    const existing = await prisma.st_appointments.findUnique({
      where: { st_id: appointment.st_id }
    });
    
    await prisma.st_appointments.upsert({
      where: { st_id: appointment.st_id },
      create: appointment,
      update: appointment
    });
    
    return { created: !existing };
  }
}

export const appointmentSync = new AppointmentSync();

export async function syncAppointments() {
  return appointmentSync.run();
}
```

---

## File 8: Complete Technicians/Employees Sync

**File:** `src/services/sync/sync-technicians.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class TechnicianSync extends SyncBase {
  constructor() {
    super('technicians');
  }
  
  async fetchList() {
    // ServiceTitan has separate endpoints for technicians and employees
    // Try both and combine
    
    let technicians = [];
    let employees = [];
    
    // Try technicians endpoint
    try {
      logger.info('[technicians] Fetching from /settings/v2/technicians...');
      technicians = await stClient.fetchAllPages('/settings/v2/tenant/{tenant}/technicians');
      logger.info(`[technicians] Found ${technicians.length} technicians`);
    } catch (e) {
      logger.warn('[technicians] Technicians endpoint failed:', e.message);
    }
    
    // Try employees endpoint
    try {
      logger.info('[technicians] Fetching from /settings/v2/employees...');
      employees = await stClient.fetchAllPages('/settings/v2/tenant/{tenant}/employees');
      logger.info(`[technicians] Found ${employees.length} employees`);
    } catch (e) {
      logger.warn('[technicians] Employees endpoint failed:', e.message);
    }
    
    // Combine and deduplicate
    const combined = [...technicians];
    for (const emp of employees) {
      if (!combined.find(t => t.id === emp.id)) {
        combined.push({ ...emp, _source: 'employees' });
      }
    }
    
    logger.info(`[technicians] Combined total: ${combined.length}`);
    return combined;
  }
  
  async enrichOne(tech) {
    // Get full details
    try {
      const endpoint = tech._source === 'employees' 
        ? `/settings/v2/tenant/{tenant}/employees/${tech.id}`
        : `/settings/v2/tenant/{tenant}/technicians/${tech.id}`;
        
      const details = await stClient.get(endpoint);
      return {
        ...details,
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
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
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
      
      // Skills (if available)
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
    const existing = await prisma.st_technicians.findUnique({
      where: { st_id: tech.st_id }
    });
    
    await prisma.st_technicians.upsert({
      where: { st_id: tech.st_id },
      create: tech,
      update: tech
    });
    
    // Also update st_employees table for cross-reference
    try {
      await prisma.st_employees.upsert({
        where: { st_id: tech.st_id },
        create: {
          st_id: tech.st_id,
          name: tech.name,
          email: tech.email,
          role: tech.role,
          business_unit_id: tech.business_unit_id,
          active: tech.active,
          full_data: tech.full_data,
          last_synced_at: new Date()
        },
        update: {
          name: tech.name,
          email: tech.email,
          role: tech.role,
          business_unit_id: tech.business_unit_id,
          active: tech.active,
          full_data: tech.full_data,
          last_synced_at: new Date()
        }
      });
    } catch (e) {
      // st_employees table might not exist yet
    }
    
    return { created: !existing };
  }
  
  async postProcess() {
    // Calculate technician performance metrics
    logger.info('[technicians] Calculating performance metrics...');
    
    await prisma.$executeRaw`
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
    `;
  }
}

export const technicianSync = new TechnicianSync();

export async function syncTechnicians() {
  return technicianSync.run();
}
```

---

## File 9: Complete Reference Data Sync

**File:** `src/services/sync/sync-reference-data.js`

```javascript
import { prisma, stClient, logger } from './sync-base.js';

export async function syncReferenceData() {
  logger.info('Starting reference data sync...');
  
  const results = {
    businessUnits: 0,
    jobTypes: 0,
    campaigns: 0,
    tagTypes: 0,
    callReasons: 0
  };
  
  // 1. Business Units
  try {
    logger.info('[reference] Syncing business units...');
    const units = await stClient.fetchAllPages('/settings/v2/tenant/{tenant}/business-units');
    
    for (const unit of units) {
      await prisma.st_business_units.upsert({
        where: { st_id: BigInt(unit.id) },
        create: {
          st_id: BigInt(unit.id),
          name: unit.name,
          code: unit.code || null,
          email: unit.email || null,
          phone: unit.phone || null,
          address: unit.address || null,
          active: unit.active !== false,
          full_data: unit,
          last_synced_at: new Date()
        },
        update: {
          name: unit.name,
          code: unit.code || null,
          email: unit.email || null,
          phone: unit.phone || null,
          address: unit.address || null,
          active: unit.active !== false,
          full_data: unit,
          last_synced_at: new Date()
        }
      });
      results.businessUnits++;
    }
    logger.info(`[reference] Synced ${results.businessUnits} business units`);
  } catch (e) {
    logger.error('[reference] Business units sync failed:', e.message);
  }
  
  // 2. Job Types
  try {
    logger.info('[reference] Syncing job types...');
    const types = await stClient.fetchAllPages('/settings/v2/tenant/{tenant}/job-types');
    
    for (const type of types) {
      await prisma.st_job_types.upsert({
        where: { st_id: BigInt(type.id) },
        create: {
          st_id: BigInt(type.id),
          name: type.name,
          code: type.code || null,
          business_unit_id: type.businessUnitId ? BigInt(type.businessUnitId) : null,
          active: type.active !== false,
          full_data: type,
          last_synced_at: new Date()
        },
        update: {
          name: type.name,
          code: type.code || null,
          business_unit_id: type.businessUnitId ? BigInt(type.businessUnitId) : null,
          active: type.active !== false,
          full_data: type,
          last_synced_at: new Date()
        }
      });
      results.jobTypes++;
    }
    logger.info(`[reference] Synced ${results.jobTypes} job types`);
  } catch (e) {
    logger.error('[reference] Job types sync failed:', e.message);
  }
  
  // 3. Campaigns
  try {
    logger.info('[reference] Syncing campaigns...');
    const campaigns = await stClient.fetchAllPages('/marketing/v2/tenant/{tenant}/campaigns');
    
    for (const campaign of campaigns) {
      await prisma.st_campaigns.upsert({
        where: { st_id: BigInt(campaign.id) },
        create: {
          st_id: BigInt(campaign.id),
          name: campaign.name,
          code: campaign.code || null,
          category: campaign.category || null,
          active: campaign.active !== false,
          full_data: campaign,
          last_synced_at: new Date()
        },
        update: {
          name: campaign.name,
          code: campaign.code || null,
          category: campaign.category || null,
          active: campaign.active !== false,
          full_data: campaign,
          last_synced_at: new Date()
        }
      });
      results.campaigns++;
    }
    logger.info(`[reference] Synced ${results.campaigns} campaigns`);
  } catch (e) {
    logger.error('[reference] Campaigns sync failed:', e.message);
  }
  
  // 4. Tag Types
  try {
    logger.info('[reference] Syncing tag types...');
    const tags = await stClient.fetchAllPages('/settings/v2/tenant/{tenant}/tag-types');
    
    for (const tag of tags) {
      await prisma.st_tag_types.upsert({
        where: { st_id: BigInt(tag.id) },
        create: {
          st_id: BigInt(tag.id),
          name: tag.name,
          code: tag.code || null,
          color: tag.color || null,
          entity_type: tag.entityType || null,
          active: tag.active !== false,
          full_data: tag,
          last_synced_at: new Date()
        },
        update: {
          name: tag.name,
          code: tag.code || null,
          color: tag.color || null,
          entity_type: tag.entityType || null,
          active: tag.active !== false,
          full_data: tag,
          last_synced_at: new Date()
        }
      });
      results.tagTypes++;
    }
    logger.info(`[reference] Synced ${results.tagTypes} tag types`);
  } catch (e) {
    logger.error('[reference] Tag types sync failed:', e.message);
  }
  
  logger.info('[reference] Reference data sync complete:', results);
  return results;
}
```

---

## File 10: Database Migration

**File:** `src/db/migrations/007_sync_enrichment.sql`

```sql
-- ============================================
-- MIGRATION 007: Sync Enrichment Schema
-- Adds columns for enriched data and aggregates
-- ============================================

-- CUSTOMERS: Add aggregate columns
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS total_jobs INTEGER DEFAULT 0;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS completed_jobs INTEGER DEFAULT 0;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS last_job_date TIMESTAMP;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS first_job_date TIMESTAMP;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS aggregates_updated_at TIMESTAMP;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- CUSTOMERS: Add contact fields if missing
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS do_not_mail BOOLEAN DEFAULT FALSE;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS do_not_service BOOLEAN DEFAULT FALSE;

-- JOBS: Add enrichment columns
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS technician_name VARCHAR(200);
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal';
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- ESTIMATES: Add enrichment columns
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS sold_on TIMESTAMP;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS sold_by_id BIGINT;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- INVOICES: Add payment tracking
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS paid_on TIMESTAMP;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- APPOINTMENTS: Add tracking fields
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS technician_name VARCHAR(200);
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- TECHNICIANS: Add performance fields
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS total_jobs INTEGER DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS completed_jobs INTEGER DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;

-- LOCATIONS: Create if not exists
CREATE TABLE IF NOT EXISTS st_locations (
  st_id BIGINT PRIMARY KEY,
  customer_id BIGINT REFERENCES st_customers(st_id),
  name VARCHAR(200),
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(200),
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  full_data JSONB,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- PAYMENTS: Create if not exists
CREATE TABLE IF NOT EXISTS st_payments (
  st_id BIGINT PRIMARY KEY,
  invoice_id BIGINT REFERENCES st_invoices(st_id),
  customer_id BIGINT REFERENCES st_customers(st_id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(100),
  payment_date TIMESTAMP,
  reference VARCHAR(200),
  full_data JSONB,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_aggregates ON st_customers(lifetime_value DESC, total_jobs DESC);
CREATE INDEX IF NOT EXISTS idx_customers_last_job ON st_customers(last_job_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON st_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_technician ON st_jobs(technician_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON st_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_estimates_customer ON st_estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON st_estimates(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON st_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON st_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_balance ON st_invoices(balance) WHERE balance > 0;
CREATE INDEX IF NOT EXISTS idx_appointments_technician ON st_appointments(technician_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON st_appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_locations_customer ON st_locations(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON st_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON st_payments(customer_id);

-- Create view for complete customer data
CREATE OR REPLACE VIEW v_customers_complete AS
SELECT 
  c.*,
  l.address_line1 as location_address,
  l.city as location_city,
  l.state as location_state,
  l.postal_code as location_zip,
  l.latitude,
  l.longitude,
  (
    SELECT COUNT(*) FROM st_jobs j WHERE j.customer_id = c.st_id
  ) as job_count,
  (
    SELECT COUNT(*) FROM st_estimates e WHERE e.customer_id = c.st_id AND e.status = 'Open'
  ) as open_estimates,
  (
    SELECT COALESCE(SUM(i.balance), 0) FROM st_invoices i WHERE i.customer_id = c.st_id AND i.balance > 0
  ) as outstanding_balance
FROM st_customers c
LEFT JOIN st_locations l ON l.customer_id = c.st_id;

-- Create view for sync status
CREATE OR REPLACE VIEW v_sync_status AS
SELECT 
  'customers' as entity,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day') as synced_24h,
  MAX(last_synced_at) as last_sync
FROM st_customers
UNION ALL
SELECT 'jobs', COUNT(*), COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day'), MAX(last_synced_at) FROM st_jobs
UNION ALL
SELECT 'estimates', COUNT(*), COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day'), MAX(last_synced_at) FROM st_estimates
UNION ALL
SELECT 'invoices', COUNT(*), COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day'), MAX(last_synced_at) FROM st_invoices
UNION ALL
SELECT 'appointments', COUNT(*), COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day'), MAX(last_synced_at) FROM st_appointments
UNION ALL
SELECT 'technicians', COUNT(*), COUNT(*) FILTER (WHERE last_synced_at > NOW() - INTERVAL '1 day'), MAX(last_synced_at) FROM st_technicians;

-- Function to refresh all aggregates
CREATE OR REPLACE FUNCTION refresh_all_aggregates()
RETURNS void AS $$
BEGIN
  -- Update customer aggregates
  UPDATE st_customers c
  SET 
    total_jobs = COALESCE(stats.job_count, 0),
    completed_jobs = COALESCE(stats.completed, 0),
    lifetime_value = COALESCE(stats.revenue, 0),
    last_job_date = stats.last_job,
    first_job_date = stats.first_job,
    aggregates_updated_at = NOW()
  FROM (
    SELECT 
      j.customer_id,
      COUNT(*) as job_count,
      COUNT(*) FILTER (WHERE j.job_status = 'Completed') as completed,
      COALESCE(SUM(i.total) FILTER (WHERE i.status = 'Paid'), 0) as revenue,
      MAX(j.st_created_on) as last_job,
      MIN(j.st_created_on) as first_job
    FROM st_jobs j
    LEFT JOIN st_invoices i ON i.job_id = j.st_id
    GROUP BY j.customer_id
  ) stats
  WHERE c.st_id = stats.customer_id;
  
  -- Update technician aggregates
  UPDATE st_technicians t
  SET 
    total_jobs = COALESCE(stats.job_count, 0),
    completed_jobs = COALESCE(stats.completed, 0),
    total_revenue = COALESCE(stats.revenue, 0)
  FROM (
    SELECT 
      technician_id,
      COUNT(*) as job_count,
      COUNT(*) FILTER (WHERE job_status = 'Completed') as completed,
      COALESCE(SUM(i.total), 0) as revenue
    FROM st_jobs j
    LEFT JOIN st_invoices i ON i.job_id = j.st_id
    WHERE technician_id IS NOT NULL
    GROUP BY technician_id
  ) stats
  WHERE t.st_id = stats.technician_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT ON v_customers_complete TO PUBLIC;
GRANT SELECT ON v_sync_status TO PUBLIC;
```

---

## File 11: Updated Sync Orchestrator

**File:** `src/services/sync/sync-orchestrator.js`

```javascript
import { syncReferenceData } from './sync-reference-data.js';
import { CustomerSync } from './sync-customers.js';
import { JobSync } from './sync-jobs.js';
import { EstimateSync } from './sync-estimates.js';
import { InvoiceSync } from './sync-invoices.js';
import { AppointmentSync } from './sync-appointments.js';
import { TechnicianSync } from './sync-technicians.js';
import { prisma, logger } from './sync-base.js';

export class SyncOrchestrator {
  constructor() {
    this.syncers = {
      customers: new CustomerSync(),
      jobs: new JobSync(),
      estimates: new EstimateSync(),
      invoices: new InvoiceSync(),
      appointments: new AppointmentSync(),
      technicians: new TechnicianSync()
    };
  }
  
  async runFullSync() {
    logger.info('='.repeat(60));
    logger.info('STARTING FULL SYNC WITH ENRICHMENT');
    logger.info('='.repeat(60));
    
    const startTime = Date.now();
    const results = {};
    
    try {
      // Phase 0: Reference data (required for foreign keys)
      logger.info('\n--- PHASE 0: Reference Data ---');
      results.reference = await syncReferenceData();
      
      // Phase 1: Core entities
      logger.info('\n--- PHASE 1: Customers ---');
      results.customers = await this.syncers.customers.run();
      
      // Phase 2: Jobs (depends on customers)
      logger.info('\n--- PHASE 2: Jobs ---');
      results.jobs = await this.syncers.jobs.run();
      
      // Phase 3: Related entities (parallel)
      logger.info('\n--- PHASE 3: Estimates, Invoices, Appointments ---');
      const [estimates, invoices, appointments] = await Promise.all([
        this.syncers.estimates.run(),
        this.syncers.invoices.run(),
        this.syncers.appointments.run()
      ]);
      results.estimates = estimates;
      results.invoices = invoices;
      results.appointments = appointments;
      
      // Phase 4: Technicians
      logger.info('\n--- PHASE 4: Technicians ---');
      results.technicians = await this.syncers.technicians.run();
      
      // Phase 5: Refresh aggregates
      logger.info('\n--- PHASE 5: Refreshing Aggregates ---');
      await prisma.$executeRaw`SELECT refresh_all_aggregates()`;
      
      const duration = Date.now() - startTime;
      
      logger.info('\n' + '='.repeat(60));
      logger.info('FULL SYNC COMPLETE');
      logger.info('='.repeat(60));
      logger.info(`Duration: ${(duration / 1000).toFixed(1)} seconds`);
      logger.info('Results:', JSON.stringify(results, null, 2));
      
      return {
        success: true,
        duration,
        results
      };
      
    } catch (error) {
      logger.error('FULL SYNC FAILED', { error: error.message });
      throw error;
    }
  }
  
  async runIncrementalSync() {
    logger.info('Starting incremental sync...');
    
    // For incremental, we run a lighter version
    // focusing on recently modified records
    
    const results = {};
    
    // Only sync customers and jobs that changed
    results.customers = await this.syncers.customers.run();
    results.jobs = await this.syncers.jobs.run();
    results.estimates = await this.syncers.estimates.run();
    results.invoices = await this.syncers.invoices.run();
    
    return results;
  }
  
  async runSingleSync(entity) {
    if (!this.syncers[entity]) {
      throw new Error(`Unknown entity: ${entity}`);
    }
    
    return this.syncers[entity].run();
  }
}

export const syncOrchestrator = new SyncOrchestrator();

// Export convenience functions
export async function runFullSync() {
  return syncOrchestrator.runFullSync();
}

export async function runIncrementalSync() {
  return syncOrchestrator.runIncrementalSync();
}

export async function runSingleSync(entity) {
  return syncOrchestrator.runSingleSync(entity);
}
```

---

## Continue to Part 4?

Part 4 contains:
- NPM script updates
- Complete Windsurf deployment prompt
- Testing and verification procedures
- Troubleshooting guide

**Continue?**
