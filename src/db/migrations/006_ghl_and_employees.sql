-- ============================================
-- GHL Opportunities & Employee Data
-- Migration: 006_ghl_and_employees.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: st_employees
-- All employees (techs, CSRs, dispatchers, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS st_employees (
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
  
  CONSTRAINT st_employees_st_id_unique UNIQUE (st_id)
);

CREATE INDEX IF NOT EXISTS idx_st_employees_st_id ON st_employees(st_id);
CREATE INDEX IF NOT EXISTS idx_st_employees_name ON st_employees(name);
CREATE INDEX IF NOT EXISTS idx_st_employees_active ON st_employees(active);
CREATE INDEX IF NOT EXISTS idx_st_employees_business_unit ON st_employees(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_st_employees_role ON st_employees(role);

COMMENT ON TABLE st_employees IS 'All ServiceTitan employees (technicians, CSRs, dispatchers, office staff)';

-- ============================================
-- TABLE: ghl_opportunities
-- Complete GoHighLevel opportunity storage
-- ============================================
CREATE TABLE IF NOT EXISTS ghl_opportunities (
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
  local_updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_ghl_id ON ghl_opportunities(ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_st_job ON ghl_opportunities(st_job_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_st_customer ON ghl_opportunities(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_contact ON ghl_opportunities(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_pipeline ON ghl_opportunities(ghl_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_stage ON ghl_opportunities(ghl_pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_status ON ghl_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_updated ON ghl_opportunities(ghl_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_pending_st_sync ON ghl_opportunities(synced_to_st) 
  WHERE synced_to_st = false AND st_job_id IS NULL;

COMMENT ON TABLE ghl_opportunities IS 'Complete GoHighLevel opportunity storage with bi-directional sync';

-- ============================================
-- TABLE: ghl_contacts
-- GHL contacts (for customer import)
-- ============================================
CREATE TABLE IF NOT EXISTS ghl_contacts (
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
  local_synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_ghl_id ON ghl_contacts(ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_st_customer ON ghl_contacts(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_email ON ghl_contacts(email);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_phone ON ghl_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_pending_sync ON ghl_contacts(synced_to_st) 
  WHERE synced_to_st = false;

COMMENT ON TABLE ghl_contacts IS 'GHL contacts for customer import to ServiceTitan';

-- ============================================
-- TABLE: ghl_sync_log
-- Track GHL sync operations
-- ============================================
CREATE TABLE IF NOT EXISTS ghl_sync_log (
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

CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_type ON ghl_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_status ON ghl_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_started ON ghl_sync_log(started_at DESC);

-- ============================================
-- VIEWS: GHL Insights
-- ============================================

-- Opportunity pipeline summary
CREATE OR REPLACE VIEW v_ghl_pipeline_summary AS
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
CREATE OR REPLACE VIEW v_ghl_st_linkage AS
SELECT 
  o.ghl_id,
  o.name as opportunity_name,
  o.monetary_value,
  o.stage_name,
  o.status,
  o.st_job_id,
  o.st_customer_id,
  o.ghl_created_at,
  o.closed_at,
  o.synced_to_st
FROM ghl_opportunities o
ORDER BY o.ghl_created_at DESC;

-- GHL contacts needing ST sync
CREATE OR REPLACE VIEW v_ghl_contacts_pending_sync AS
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
CREATE OR REPLACE VIEW v_ghl_opportunities_pending_sync AS
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

DROP TRIGGER IF EXISTS update_ghl_opportunities_updated_at ON ghl_opportunities;
CREATE TRIGGER update_ghl_opportunities_updated_at
  BEFORE UPDATE ON ghl_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_ghl_updated_at();

-- ============================================
-- END OF MIGRATION 006
-- ============================================
