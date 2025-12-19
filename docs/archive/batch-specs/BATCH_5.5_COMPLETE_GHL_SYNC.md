# 🔄 BATCH 5.5: COMPLETE GHL SYNC + REFERENCE DATA

## Overview

Complete the missing pieces:
1. **Add `ghl_opportunities` table** - Full GHL opportunity storage
2. **Add `st_employees` table** - User/employee data
3. **Create `sync-reference-data.js`** - Sync all reference tables
4. **Complete GHL bi-directional sync** - Full pipeline integration
5. **GHL customer import** - Create ST customers from GHL contacts

---

## PART 1: NEW DATABASE TABLES

### Migration 006: GHL & Employee Data

```sql
-- ============================================
-- GHL Opportunities & Employee Data
-- Migration: 006_ghl_and_employees.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: st_employees
-- All employees (techs, CSRs, dispatchers, etc.)
-- ============================================
CREATE TABLE st_employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Basic Info
  name VARCHAR(255) NOT NULL,
  employee_id VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Role
  role VARCHAR(100), -- 'Technician', 'CSR', 'Dispatcher', 'Manager'
  business_unit_id BIGINT,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_employees_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_employee_business_unit FOREIGN KEY (business_unit_id) 
    REFERENCES st_business_units(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_st_employees_st_id ON st_employees(st_id);
CREATE INDEX idx_st_employees_name ON st_employees(name);
CREATE INDEX idx_st_employees_active ON st_employees(active);
CREATE INDEX idx_st_employees_business_unit ON st_employees(business_unit_id);
CREATE INDEX idx_st_employees_role ON st_employees(role);

COMMENT ON TABLE st_employees IS 'All ServiceTitan employees (technicians, CSRs, dispatchers, office staff)';

-- ============================================
-- TABLE: ghl_opportunities
-- Complete GoHighLevel opportunity storage
-- ============================================
CREATE TABLE ghl_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ghl_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Relations
  st_job_id BIGINT, -- Link to ServiceTitan job
  st_customer_id BIGINT, -- Link to ServiceTitan customer
  ghl_contact_id VARCHAR(255),
  ghl_location_id VARCHAR(255),
  
  -- Pipeline Info
  ghl_pipeline_id VARCHAR(255) NOT NULL,
  pipeline_name VARCHAR(255),
  ghl_pipeline_stage_id VARCHAR(255),
  stage_name VARCHAR(255),
  
  -- Opportunity Info
  name VARCHAR(500) NOT NULL,
  monetary_value DECIMAL(18,4) DEFAULT 0,
  status VARCHAR(50), -- 'open', 'won', 'lost', 'abandoned'
  
  -- Dates
  ghl_created_at TIMESTAMPTZ,
  ghl_updated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_status_change_at TIMESTAMPTZ,
  
  -- Assignment
  assigned_to VARCHAR(255), -- GHL user ID
  
  -- Source Attribution
  source VARCHAR(255),
  lead_value DECIMAL(18,4),
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Notes & Activities (summary)
  notes_count INTEGER DEFAULT 0,
  tasks_count INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  
  -- Full API Response
  full_data JSONB NOT NULL,
  
  -- Sync Tracking
  synced_to_st BOOLEAN DEFAULT false,
  st_sync_error TEXT,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_ghl_opp_job FOREIGN KEY (st_job_id) 
    REFERENCES st_jobs(st_id) ON DELETE SET NULL,
  CONSTRAINT fk_ghl_opp_customer FOREIGN KEY (st_customer_id) 
    REFERENCES st_customers(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_ghl_opportunities_ghl_id ON ghl_opportunities(ghl_id);
CREATE INDEX idx_ghl_opportunities_st_job ON ghl_opportunities(st_job_id);
CREATE INDEX idx_ghl_opportunities_st_customer ON ghl_opportunities(st_customer_id);
CREATE INDEX idx_ghl_opportunities_contact ON ghl_opportunities(ghl_contact_id);
CREATE INDEX idx_ghl_opportunities_pipeline ON ghl_opportunities(ghl_pipeline_id);
CREATE INDEX idx_ghl_opportunities_stage ON ghl_opportunities(ghl_pipeline_stage_id);
CREATE INDEX idx_ghl_opportunities_status ON ghl_opportunities(status);
CREATE INDEX idx_ghl_opportunities_updated ON ghl_opportunities(ghl_updated_at DESC);
CREATE INDEX idx_ghl_opportunities_pending_st_sync ON ghl_opportunities(synced_to_st) 
  WHERE synced_to_st = false AND st_job_id IS NULL;

COMMENT ON TABLE ghl_opportunities IS 'Complete GoHighLevel opportunity storage with bi-directional sync';

-- ============================================
-- TABLE: ghl_contacts
-- GHL contacts (for customer import)
-- ============================================
CREATE TABLE ghl_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ghl_id VARCHAR(255) UNIQUE NOT NULL,
  ghl_location_id VARCHAR(255),
  
  -- Relations
  st_customer_id BIGINT, -- Link to ST customer if matched
  
  -- Basic Info
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  name VARCHAR(500),
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Address
  address_line1 VARCHAR(500),
  city VARCHAR(255),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100),
  
  -- Additional Contact Info
  phone_numbers JSONB DEFAULT '[]',
  email_addresses JSONB DEFAULT '[]',
  
  -- Tags & Source
  tags JSONB DEFAULT '[]',
  source VARCHAR(255),
  
  -- Status
  type VARCHAR(50), -- 'lead', 'customer', 'opportunity'
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Dates
  ghl_created_at TIMESTAMPTZ,
  ghl_updated_at TIMESTAMPTZ,
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  -- Sync Tracking
  synced_to_st BOOLEAN DEFAULT false,
  st_sync_error TEXT,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_ghl_contact_customer FOREIGN KEY (st_customer_id) 
    REFERENCES st_customers(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_ghl_contacts_ghl_id ON ghl_contacts(ghl_id);
CREATE INDEX idx_ghl_contacts_st_customer ON ghl_contacts(st_customer_id);
CREATE INDEX idx_ghl_contacts_email ON ghl_contacts(email);
CREATE INDEX idx_ghl_contacts_phone ON ghl_contacts(phone);
CREATE INDEX idx_ghl_contacts_pending_sync ON ghl_contacts(synced_to_st) 
  WHERE synced_to_st = false;

COMMENT ON TABLE ghl_contacts IS 'GHL contacts for customer import to ServiceTitan';

-- ============================================
-- TABLE: ghl_sync_log
-- Track GHL sync operations
-- ============================================
CREATE TABLE ghl_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sync Info
  sync_type VARCHAR(50) NOT NULL, -- 'import_opportunities', 'import_contacts', 'export_jobs'
  direction VARCHAR(20) NOT NULL, -- 'to_ghl', 'from_ghl'
  
  -- Status
  status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed'
  
  -- Stats
  records_fetched INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Error Details
  error_message TEXT,
  error_details JSONB,
  
  -- Metadata
  triggered_by VARCHAR(100)
);

CREATE INDEX idx_ghl_sync_log_type ON ghl_sync_log(sync_type);
CREATE INDEX idx_ghl_sync_log_status ON ghl_sync_log(status);
CREATE INDEX idx_ghl_sync_log_started ON ghl_sync_log(started_at DESC);

-- ============================================
-- VIEWS: GHL Insights
-- ============================================

-- Opportunity pipeline summary
CREATE VIEW v_ghl_pipeline_summary AS
SELECT 
  pipeline_name,
  stage_name,
  status,
  COUNT(*) as opportunity_count,
  SUM(monetary_value) as total_value,
  AVG(monetary_value) as avg_value
FROM ghl_opportunities
GROUP BY pipeline_name, stage_name, status
ORDER BY pipeline_name, stage_name;

-- Opportunities with ST job linkage
CREATE VIEW v_ghl_st_linkage AS
SELECT 
  o.ghl_id,
  o.name as opportunity_name,
  o.monetary_value,
  o.stage_name,
  j.job_number as st_job_number,
  j.job_status as st_job_status,
  c.name as customer_name,
  o.ghl_created_at,
  o.closed_at
FROM ghl_opportunities o
LEFT JOIN st_jobs j ON o.st_job_id = j.st_id
LEFT JOIN st_customers c ON o.st_customer_id = c.st_id
ORDER BY o.ghl_created_at DESC;

-- GHL contacts needing ST sync
CREATE VIEW v_ghl_contacts_pending_sync AS
SELECT 
  ghl_id,
  name,
  email,
  phone,
  type,
  ghl_created_at,
  st_sync_error
FROM ghl_contacts
WHERE synced_to_st = false
ORDER BY ghl_created_at DESC;

-- GHL opportunities needing ST job creation
CREATE VIEW v_ghl_opportunities_pending_sync AS
SELECT 
  o.ghl_id,
  o.name,
  o.monetary_value,
  o.stage_name,
  o.status,
  c.name as contact_name,
  c.phone as contact_phone,
  c.email as contact_email,
  o.ghl_created_at
FROM ghl_opportunities o
LEFT JOIN ghl_contacts c ON o.ghl_contact_id = c.ghl_id
WHERE o.synced_to_st = false 
  AND o.st_job_id IS NULL
  AND o.status IN ('open', 'won')
ORDER BY o.ghl_created_at DESC;

-- ============================================
-- FUNCTIONS: GHL Utilities
-- ============================================

-- Function to link GHL opportunity to ST job
CREATE OR REPLACE FUNCTION link_ghl_opportunity_to_job(
  p_ghl_opportunity_id VARCHAR,
  p_st_job_id BIGINT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update GHL opportunity
  UPDATE ghl_opportunities
  SET 
    st_job_id = p_st_job_id,
    synced_to_st = true,
    local_updated_at = NOW()
  WHERE ghl_id = p_ghl_opportunity_id;
  
  -- Update ST job
  UPDATE st_jobs
  SET 
    ghl_opportunity_id = p_ghl_opportunity_id,
    ghl_synced_at = NOW(),
    ghl_sync_status = 'synced'
  WHERE st_id = p_st_job_id;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to match GHL contact to ST customer
CREATE OR REPLACE FUNCTION match_ghl_contact_to_customer(
  p_ghl_contact_id VARCHAR
)
RETURNS BIGINT AS $$
DECLARE
  v_contact RECORD;
  v_customer_id BIGINT;
BEGIN
  -- Get contact details
  SELECT * INTO v_contact
  FROM ghl_contacts
  WHERE ghl_id = p_ghl_contact_id;
  
  IF v_contact IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Try email match first
  IF v_contact.email IS NOT NULL THEN
    SELECT st_id INTO v_customer_id
    FROM st_customers
    WHERE email = v_contact.email
    LIMIT 1;
    
    IF v_customer_id IS NOT NULL THEN
      UPDATE ghl_contacts
      SET st_customer_id = v_customer_id
      WHERE ghl_id = p_ghl_contact_id;
      
      RETURN v_customer_id;
    END IF;
  END IF;
  
  -- Try phone match
  IF v_contact.phone IS NOT NULL THEN
    SELECT st_id INTO v_customer_id
    FROM st_customers
    WHERE phone = v_contact.phone
    LIMIT 1;
    
    IF v_customer_id IS NOT NULL THEN
      UPDATE ghl_contacts
      SET st_customer_id = v_customer_id
      WHERE ghl_id = p_ghl_contact_id;
      
      RETURN v_customer_id;
    END IF;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_ghl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.local_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ghl_opportunities_updated_at
  BEFORE UPDATE ON ghl_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_ghl_updated_at();

-- ============================================
-- END OF MIGRATION
-- ============================================
```

---

## PART 2: REFERENCE DATA SYNC

### File: src/services/sync/sync-reference-data.js

```javascript
/**
 * Sync all reference data from ServiceTitan
 * Run this FIRST before syncing transactional data
 */

import { stClient } from '../stClient.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

export async function syncReferenceData() {
  logger.info('Starting reference data sync...');
  
  const stats = {
    businessUnits: await syncBusinessUnits(),
    employees: await syncEmployees(),
    jobTypes: await syncJobTypes(),
    tagTypes: await syncTagTypes(),
    callReasons: await syncCallReasons(),
    campaigns: await syncCampaigns()
  };
  
  logger.info('Reference data sync completed', stats);
  return stats;
}

async function syncBusinessUnits() {
  try {
    logger.info('Syncing business units...');
    
    const response = await stClient.get('/tenant/{tenant}/business-units');
    let created = 0, updated = 0;
    
    for (const bu of response.data) {
      const existing = await prisma.st_business_units.findUnique({
        where: { st_id: BigInt(bu.id) }
      });
      
      await prisma.st_business_units.upsert({
        where: { st_id: BigInt(bu.id) },
        create: {
          st_id: BigInt(bu.id),
          tenant_id: BigInt(bu.tenantId),
          name: bu.name,
          official_name: bu.officialName,
          active: bu.active !== false,
          full_data: bu,
          st_created_on: bu.createdOn ? new Date(bu.createdOn) : null,
          st_modified_on: bu.modifiedOn ? new Date(bu.modifiedOn) : null
        },
        update: {
          name: bu.name,
          official_name: bu.officialName,
          active: bu.active !== false,
          full_data: bu,
          st_modified_on: bu.modifiedOn ? new Date(bu.modifiedOn) : null,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    logger.info('Business units synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing business units', { error: error.message });
    throw error;
  }
}

async function syncEmployees() {
  try {
    logger.info('Syncing employees...');
    
    // Note: ST API endpoint might be /tenant/{tenant}/employees or /technicians
    const response = await stClient.get('/tenant/{tenant}/employees');
    let created = 0, updated = 0;
    
    for (const emp of response.data) {
      const existing = await prisma.st_employees.findUnique({
        where: { st_id: BigInt(emp.id) }
      });
      
      await prisma.st_employees.upsert({
        where: { st_id: BigInt(emp.id) },
        create: {
          st_id: BigInt(emp.id),
          tenant_id: BigInt(emp.tenantId),
          name: emp.name,
          employee_id: emp.employeeId,
          email: emp.email,
          phone: emp.phoneNumber,
          role: emp.role || 'Employee',
          business_unit_id: emp.businessUnitId ? BigInt(emp.businessUnitId) : null,
          active: emp.active !== false,
          full_data: emp,
          st_created_on: emp.createdOn ? new Date(emp.createdOn) : null,
          st_modified_on: emp.modifiedOn ? new Date(emp.modifiedOn) : null
        },
        update: {
          name: emp.name,
          email: emp.email,
          phone: emp.phoneNumber,
          active: emp.active !== false,
          full_data: emp,
          st_modified_on: emp.modifiedOn ? new Date(emp.modifiedOn) : null,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    // Also sync technicians separately (they might be in different endpoint)
    const techResponse = await stClient.get('/tenant/{tenant}/technicians');
    
    for (const tech of techResponse.data) {
      const existing = await prisma.st_technicians.findUnique({
        where: { st_id: BigInt(tech.id) }
      });
      
      await prisma.st_technicians.upsert({
        where: { st_id: BigInt(tech.id) },
        create: {
          st_id: BigInt(tech.id),
          tenant_id: BigInt(tech.tenantId),
          name: tech.name,
          employee_id: tech.employeeId,
          email: tech.email,
          phone: tech.phoneNumber,
          business_unit_id: tech.businessUnitId ? BigInt(tech.businessUnitId) : null,
          active: tech.active !== false,
          full_data: tech,
          st_created_on: tech.createdOn ? new Date(tech.createdOn) : null,
          st_modified_on: tech.modifiedOn ? new Date(tech.modifiedOn) : null
        },
        update: {
          name: tech.name,
          active: tech.active !== false,
          full_data: tech,
          local_synced_at: new Date()
        }
      });
    }
    
    logger.info('Employees synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing employees', { error: error.message });
    throw error;
  }
}

async function syncJobTypes() {
  try {
    logger.info('Syncing job types...');
    
    const response = await stClient.get('/tenant/{tenant}/job-types');
    let created = 0, updated = 0;
    
    for (const jt of response.data) {
      const existing = await prisma.st_job_types.findUnique({
        where: { st_id: BigInt(jt.id) }
      });
      
      await prisma.st_job_types.upsert({
        where: { st_id: BigInt(jt.id) },
        create: {
          st_id: BigInt(jt.id),
          tenant_id: BigInt(jt.tenantId),
          name: jt.name,
          active: jt.active !== false,
          full_data: jt
        },
        update: {
          name: jt.name,
          active: jt.active !== false,
          full_data: jt,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    logger.info('Job types synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing job types', { error: error.message });
    throw error;
  }
}

async function syncTagTypes() {
  try {
    logger.info('Syncing tag types...');
    
    const response = await stClient.get('/tenant/{tenant}/tag-types');
    let created = 0, updated = 0;
    
    for (const tag of response.data) {
      const existing = await prisma.st_tag_types.findUnique({
        where: { st_id: BigInt(tag.id) }
      });
      
      await prisma.st_tag_types.upsert({
        where: { st_id: BigInt(tag.id) },
        create: {
          st_id: BigInt(tag.id),
          tenant_id: BigInt(tag.tenantId),
          name: tag.name,
          active: tag.active !== false,
          full_data: tag
        },
        update: {
          name: tag.name,
          active: tag.active !== false,
          full_data: tag,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    logger.info('Tag types synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing tag types', { error: error.message });
    throw error;
  }
}

async function syncCallReasons() {
  try {
    logger.info('Syncing call reasons...');
    
    const response = await stClient.get('/tenant/{tenant}/call-reasons');
    let created = 0, updated = 0;
    
    for (const reason of response.data) {
      const existing = await prisma.st_call_reasons.findUnique({
        where: { st_id: BigInt(reason.id) }
      });
      
      await prisma.st_call_reasons.upsert({
        where: { st_id: BigInt(reason.id) },
        create: {
          st_id: BigInt(reason.id),
          tenant_id: BigInt(reason.tenantId),
          name: reason.name,
          active: reason.active !== false,
          full_data: reason
        },
        update: {
          name: reason.name,
          active: reason.active !== false,
          full_data: reason,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    logger.info('Call reasons synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing call reasons', { error: error.message });
    throw error;
  }
}

async function syncCampaigns() {
  try {
    logger.info('Syncing campaigns...');
    
    const response = await stClient.get('/tenant/{tenant}/campaigns');
    let created = 0, updated = 0;
    
    for (const campaign of response.data) {
      const existing = await prisma.st_campaigns.findUnique({
        where: { st_id: BigInt(campaign.id) }
      });
      
      await prisma.st_campaigns.upsert({
        where: { st_id: BigInt(campaign.id) },
        create: {
          st_id: BigInt(campaign.id),
          tenant_id: BigInt(campaign.tenantId),
          name: campaign.name,
          category_id: campaign.categoryId ? BigInt(campaign.categoryId) : null,
          active: campaign.active !== false,
          full_data: campaign,
          st_created_on: campaign.createdOn ? new Date(campaign.createdOn) : null,
          st_modified_on: campaign.modifiedOn ? new Date(campaign.modifiedOn) : null
        },
        update: {
          name: campaign.name,
          active: campaign.active !== false,
          full_data: campaign,
          st_modified_on: campaign.modifiedOn ? new Date(campaign.modifiedOn) : null,
          local_synced_at: new Date()
        }
      });
      
      existing ? updated++ : created++;
    }
    
    logger.info('Campaigns synced', { created, updated });
    return { created, updated };
    
  } catch (error) {
    logger.error('Error syncing campaigns', { error: error.message });
    throw error;
  }
}
```

---

## PART 3: COMPLETE GHL BI-DIRECTIONAL SYNC

### File: src/integrations/ghl/sync-opportunities-from-ghl.js

```javascript
/**
 * Import opportunities FROM GoHighLevel
 * Stores in ghl_opportunities table
 * Creates ST jobs for won opportunities
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

const ghlClient = axios.create({
  baseURL: 'https://rest.gohighlevel.com/v1',
  headers: {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

export async function syncOpportunitiesFromGHL() {
  const syncId = await startSyncLog('import_opportunities', 'from_ghl');
  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };
  
  try {
    logger.info('Syncing opportunities from GHL...');
    
    // Get all opportunities from GHL
    const response = await ghlClient.get('/opportunities', {
      params: {
        locationId: process.env.GHL_LOCATION_ID,
        limit: 100
      }
    });
    
    stats.fetched = response.data.opportunities?.length || 0;
    
    for (const opp of response.data.opportunities || []) {
      try {
        await upsertGHLOpportunity(opp);
        
        const existing = await prisma.ghl_opportunities.findUnique({
          where: { ghl_id: opp.id }
        });
        
        existing ? stats.updated++ : stats.created++;
        
        // If opportunity is "won" and not yet synced to ST, create job
        if (opp.status === 'won' && !existing?.st_job_id) {
          await createSTJobFromOpportunity(opp.id);
        }
        
      } catch (error) {
        logger.error('Failed to process opportunity', {
          opportunityId: opp.id,
          error: error.message
        });
        stats.failed++;
      }
    }
    
    await completeSyncLog(syncId, stats);
    return stats;
    
  } catch (error) {
    await failSyncLog(syncId, error);
    throw error;
  }
}

async function upsertGHLOpportunity(opp) {
  // Try to find linked ST customer
  let stCustomerId = null;
  
  if (opp.contactId) {
    const contact = await prisma.ghl_contacts.findUnique({
      where: { ghl_id: opp.contactId }
    });
    stCustomerId = contact?.st_customer_id;
  }
  
  return prisma.ghl_opportunities.upsert({
    where: { ghl_id: opp.id },
    create: {
      ghl_id: opp.id,
      ghl_contact_id: opp.contactId,
      ghl_location_id: opp.locationId,
      ghl_pipeline_id: opp.pipelineId,
      pipeline_name: opp.pipelineName,
      ghl_pipeline_stage_id: opp.pipelineStageId,
      stage_name: opp.pipelineStageName,
      name: opp.name,
      monetary_value: opp.monetaryValue || 0,
      status: opp.status,
      assigned_to: opp.assignedTo,
      source: opp.source,
      st_customer_id: stCustomerId ? BigInt(stCustomerId) : null,
      custom_fields: opp.customFields || {},
      ghl_created_at: opp.createdAt ? new Date(opp.createdAt) : null,
      ghl_updated_at: opp.updatedAt ? new Date(opp.updatedAt) : null,
      closed_at: opp.closedAt ? new Date(opp.closedAt) : null,
      full_data: opp
    },
    update: {
      pipeline_name: opp.pipelineName,
      ghl_pipeline_stage_id: opp.pipelineStageId,
      stage_name: opp.pipelineStageName,
      name: opp.name,
      monetary_value: opp.monetaryValue || 0,
      status: opp.status,
      assigned_to: opp.assignedTo,
      ghl_updated_at: opp.updatedAt ? new Date(opp.updatedAt) : null,
      closed_at: opp.closedAt ? new Date(opp.closedAt) : null,
      full_data: opp,
      local_synced_at: new Date()
    }
  });
}

async function createSTJobFromOpportunity(ghlOpportunityId) {
  /**
   * Create a ServiceTitan job from a won GHL opportunity
   * This is the key integration point!
   */
  try {
    const opp = await prisma.ghl_opportunities.findUnique({
      where: { ghl_id: ghlOpportunityId }
    });
    
    if (!opp || opp.st_job_id) {
      return; // Already synced
    }
    
    if (!opp.st_customer_id) {
      logger.warn('Cannot create ST job - no linked customer', {
        opportunityId: ghlOpportunityId
      });
      return;
    }
    
    // Get customer details
    const customer = await prisma.st_customers.findUnique({
      where: { st_id: opp.st_customer_id }
    });
    
    if (!customer) {
      throw new Error('Customer not found');
    }
    
    // Get business unit from pipeline mapping
    const businessUnit = await prisma.st_business_units.findFirst({
      where: { ghl_pipeline_id: opp.ghl_pipeline_id }
    });
    
    if (!businessUnit) {
      logger.warn('No business unit mapped to GHL pipeline', {
        pipelineId: opp.ghl_pipeline_id
      });
      return;
    }
    
    // Create job in ServiceTitan via API
    const { stClient } = await import('../../services/stClient.js');
    
    const jobData = {
      customerId: Number(customer.st_id),
      businessUnitId: Number(businessUnit.st_id),
      summary: opp.name,
      // Add other required fields
    };
    
    const response = await stClient.post('/jpm/v2/jobs', jobData);
    const createdJob = response.data;
    
    // Store in local database
    await prisma.st_jobs.create({
      data: {
        st_id: BigInt(createdJob.id),
        tenant_id: BigInt(createdJob.tenantId),
        job_number: createdJob.jobNumber,
        customer_id: BigInt(customer.st_id),
        business_unit_id: businessUnit.st_id,
        summary: opp.name,
        job_status: 'New',
        ghl_opportunity_id: opp.ghl_id,
        ghl_synced_at: new Date(),
        ghl_sync_status: 'synced',
        full_data: createdJob,
        st_created_on: new Date(createdJob.createdOn),
        st_modified_on: new Date(createdJob.modifiedOn)
      }
    });
    
    // Link back in GHL opportunity table
    await prisma.ghl_opportunities.update({
      where: { ghl_id: ghlOpportunityId },
      data: {
        st_job_id: BigInt(createdJob.id),
        synced_to_st: true
      }
    });
    
    logger.info('Created ST job from GHL opportunity', {
      opportunityId: ghlOpportunityId,
      jobId: createdJob.id,
      jobNumber: createdJob.jobNumber
    });
    
  } catch (error) {
    logger.error('Error creating ST job from opportunity', {
      opportunityId: ghlOpportunityId,
      error: error.message
    });
    
    await prisma.ghl_opportunities.update({
      where: { ghl_id: ghlOpportunityId },
      data: {
        st_sync_error: error.message
      }
    });
  }
}

async function startSyncLog(type, direction) {
  const log = await prisma.ghl_sync_log.create({
    data: {
      sync_type: type,
      direction,
      status: 'started',
      triggered_by: 'scheduled'
    }
  });
  return log.id;
}

async function completeSyncLog(id, stats) {
  await prisma.ghl_sync_log.update({
    where: { id },
    data: {
      status: 'completed',
      records_fetched: stats.fetched,
      records_created: stats.created,
      records_updated: stats.updated,
      records_failed: stats.failed,
      completed_at: new Date()
    }
  });
}

async function failSyncLog(id, error) {
  await prisma.ghl_sync_log.update({
    where: { id },
    data: {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date()
    }
  });
}
```

### File: src/integrations/ghl/sync-contacts-from-ghl.js

```javascript
/**
 * Import contacts FROM GoHighLevel
 * Creates ST customers from GHL contacts
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

const ghlClient = axios.create({
  baseURL: 'https://rest.gohighlevel.com/v1',
  headers: {
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

export async function syncContactsFromGHL() {
  const syncId = await startSyncLog('import_contacts', 'from_ghl');
  let stats = { fetched: 0, created: 0, matched: 0, failed: 0 };
  
  try {
    logger.info('Syncing contacts from GHL...');
    
    const response = await ghlClient.get('/contacts', {
      params: {
        locationId: process.env.GHL_LOCATION_ID,
        limit: 100
      }
    });
    
    stats.fetched = response.data.contacts?.length || 0;
    
    for (const contact of response.data.contacts || []) {
      try {
        // Store contact in ghl_contacts table
        await upsertGHLContact(contact);
        
        // Try to match to existing ST customer
        const matchedCustomerId = await matchContactToCustomer(contact.id);
        
        if (matchedCustomerId) {
          stats.matched++;
        } else {
          // Create new ST customer if contact is a customer type
          if (contact.type === 'customer' || contact.tags?.includes('customer')) {
            await createSTCustomerFromContact(contact.id);
            stats.created++;
          }
        }
        
      } catch (error) {
        logger.error('Failed to process contact', {
          contactId: contact.id,
          error: error.message
        });
        stats.failed++;
      }
    }
    
    await completeSyncLog(syncId, stats);
    return stats;
    
  } catch (error) {
    await failSyncLog(syncId, error);
    throw error;
  }
}

async function upsertGHLContact(contact) {
  return prisma.ghl_contacts.upsert({
    where: { ghl_id: contact.id },
    create: {
      ghl_id: contact.id,
      ghl_location_id: contact.locationId,
      first_name: contact.firstName,
      last_name: contact.lastName,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email,
      phone: contact.phone,
      address_line1: contact.address1,
      city: contact.city,
      state: contact.state,
      zip: contact.postalCode,
      country: contact.country,
      tags: contact.tags || [],
      source: contact.source,
      type: contact.type,
      custom_fields: contact.customFields || {},
      ghl_created_at: contact.dateAdded ? new Date(contact.dateAdded) : null,
      ghl_updated_at: contact.dateUpdated ? new Date(contact.dateUpdated) : null,
      full_data: contact
    },
    update: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email,
      phone: contact.phone,
      tags: contact.tags || [],
      ghl_updated_at: contact.dateUpdated ? new Date(contact.dateUpdated) : null,
      full_data: contact,
      local_synced_at: new Date()
    }
  });
}

async function matchContactToCustomer(ghlContactId) {
  // Use database function
  const result = await prisma.$queryRaw`
    SELECT match_ghl_contact_to_customer(${ghlContactId}) as customer_id
  `;
  
  return result[0]?.customer_id;
}

async function createSTCustomerFromContact(ghlContactId) {
  try {
    const contact = await prisma.ghl_contacts.findUnique({
      where: { ghl_id: ghlContactId }
    });
    
    if (!contact || contact.st_customer_id) {
      return; // Already synced
    }
    
    // Create customer in ServiceTitan via API
    const { stClient } = await import('../../services/stClient.js');
    
    const customerData = {
      name: contact.name,
      type: 'Residential',
      email: contact.email,
      phoneNumber: contact.phone,
      address: {
        street: contact.address_line1,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        country: contact.country || 'USA'
      }
    };
    
    const response = await stClient.post('/crm/v2/customers', customerData);
    const createdCustomer = response.data;
    
    // Store in local database
    await prisma.st_customers.create({
      data: {
        st_id: BigInt(createdCustomer.id),
        tenant_id: BigInt(createdCustomer.tenantId),
        name: createdCustomer.name,
        type: createdCustomer.type,
        email: createdCustomer.email,
        phone: createdCustomer.phoneNumbers?.[0]?.number,
        address_line1: createdCustomer.address?.street,
        city: createdCustomer.address?.city,
        state: createdCustomer.address?.state,
        zip: createdCustomer.address?.zip,
        full_data: createdCustomer,
        st_created_on: new Date(createdCustomer.createdOn),
        st_modified_on: new Date(createdCustomer.modifiedOn)
      }
    });
    
    // Link in GHL contact
    await prisma.ghl_contacts.update({
      where: { ghl_id: ghlContactId },
      data: {
        st_customer_id: BigInt(createdCustomer.id),
        synced_to_st: true
      }
    });
    
    logger.info('Created ST customer from GHL contact', {
      contactId: ghlContactId,
      customerId: createdCustomer.id
    });
    
  } catch (error) {
    logger.error('Error creating ST customer from contact', {
      contactId: ghlContactId,
      error: error.message
    });
    
    await prisma.ghl_contacts.update({
      where: { ghl_id: ghlContactId },
      data: {
        st_sync_error: error.message
      }
    });
  }
}

// Helper functions same as opportunities file...
```

---

## PART 4: NPM SCRIPTS & SCHEDULER

Add to package.json:

```json
{
  "scripts": {
    "sync:reference": "node -e 'import(\"./src/services/sync/sync-reference-data.js\").then(m => m.syncReferenceData())'",
    "ghl:sync:opportunities": "node -e 'import(\"./src/integrations/ghl/sync-opportunities-from-ghl.js\").then(m => m.syncOpportunitiesFromGHL())'",
    "ghl:sync:contacts": "node -e 'import(\"./src/integrations/ghl/sync-contacts-from-ghl.js\").then(m => m.syncContactsFromGHL())'"
  }
}
```

---

## DEPLOYMENT SUMMARY

**New Tables (4):**
1. st_employees - All employees/users
2. ghl_opportunities - Complete GHL opportunities
3. ghl_contacts - GHL contacts for import
4. ghl_sync_log - GHL sync audit trail

**New Files (3):**
1. sync-reference-data.js - Sync all reference tables
2. sync-opportunities-from-ghl.js - Import opportunities, create jobs
3. sync-contacts-from-ghl.js - Import contacts, create customers

**What This Enables:**
- ✅ Complete reference data (business units, employees, job types, tags)
- ✅ Full GHL opportunity storage
- ✅ Bi-directional sync (ST jobs → GHL opps, GHL opps → ST jobs)
- ✅ Customer import from GHL
- ✅ Pipeline visibility in local database
- ✅ Until you build your own UI, use GHL for pipeline management

Ready to deploy?
