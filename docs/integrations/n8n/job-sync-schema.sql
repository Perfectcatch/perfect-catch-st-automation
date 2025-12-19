-- ═══════════════════════════════════════════════════════════════
-- PERFECT CATCH ST AUTOMATION - JOB SYNC SCHEMA
-- ═══════════════════════════════════════════════════════════════
-- Purpose: Replace Airtable with local PostgreSQL storage
-- Created: 2025-12-14
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════
-- SYNC STATE TRACKING
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_sync_state_key ON sync_state(key);

-- Insert initial sync state
INSERT INTO sync_state (key, value, metadata) 
VALUES ('lastJobPull', '2025-01-01T00:00:00Z', '{"workflow": "get_jobs", "version": "2.0"}')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- CUSTOMERS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan IDs
  st_customer_id BIGINT UNIQUE NOT NULL,
  st_location_id BIGINT,
  
  -- Customer Info
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  company_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Address
  street TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  county VARCHAR(100),
  
  -- GoHighLevel Integration
  ghl_contact_id VARCHAR(100),
  ghl_synced_at TIMESTAMPTZ,
  ghl_sync_status VARCHAR(50) DEFAULT 'pending', -- pending, synced, failed
  ghl_sync_error TEXT,
  
  -- Raw ServiceTitan data
  st_raw_data JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_st_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_customers_st_id ON customers(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_ghl_id ON customers(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_ghl_status ON customers(ghl_sync_status);

-- ═══════════════════════════════════════════════════════════════
-- JOBS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan IDs
  st_job_id BIGINT UNIQUE NOT NULL,
  st_job_number VARCHAR(50) NOT NULL,
  st_customer_id BIGINT NOT NULL,
  st_location_id BIGINT,
  
  -- Job Info
  business_unit_id BIGINT NOT NULL,
  job_type_id BIGINT,
  job_type_name VARCHAR(255),
  job_status VARCHAR(50),
  priority VARCHAR(50),
  
  -- Descriptions
  summary TEXT,
  description TEXT,
  
  -- Dates
  created_on TIMESTAMPTZ,
  completed_on TIMESTAMPTZ,
  modified_on TIMESTAMPTZ,
  
  -- Appointments
  first_appointment_id BIGINT,
  last_appointment_id BIGINT,
  appointment_count INTEGER DEFAULT 0,
  
  -- Financial
  total DECIMAL(10,2) DEFAULT 0,
  invoice_id BIGINT,
  estimate_ids BIGINT[],
  no_charge BOOLEAN DEFAULT FALSE,
  
  -- Campaign & Lead Source
  campaign_id BIGINT,
  lead_call_id BIGINT,
  
  -- Tags
  tag_type_ids BIGINT[],
  
  -- GoHighLevel Integration
  ghl_opportunity_id VARCHAR(100),
  ghl_pipeline VARCHAR(100),
  ghl_synced_at TIMESTAMPTZ,
  ghl_sync_status VARCHAR(50) DEFAULT 'pending', -- pending, synced, failed, skipped
  ghl_sync_error TEXT,
  
  -- Raw ServiceTitan data
  st_raw_data JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_from_st_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups and filtering
CREATE INDEX IF NOT EXISTS idx_jobs_st_id ON jobs(st_job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_st_number ON jobs(st_job_number);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON jobs(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_business_unit ON jobs(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_on ON jobs(created_on);
CREATE INDEX IF NOT EXISTS idx_jobs_ghl_status ON jobs(ghl_sync_status);
CREATE INDEX IF NOT EXISTS idx_jobs_ghl_opportunity ON jobs(ghl_opportunity_id);

-- Composite index for common sync queries
CREATE INDEX IF NOT EXISTS idx_jobs_sync_query 
  ON jobs(business_unit_id, created_on DESC, ghl_sync_status);

-- ═══════════════════════════════════════════════════════════════
-- SYNC LOGS (Audit Trail)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sync Info
  sync_type VARCHAR(50) NOT NULL, -- job_pull, customer_sync, ghl_push
  entity_type VARCHAR(50), -- job, customer
  entity_id BIGINT,
  
  -- Status
  status VARCHAR(50) NOT NULL, -- started, completed, failed, partial
  records_processed INTEGER DEFAULT 0,
  records_succeeded INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  
  -- Error Tracking
  error_message TEXT,
  error_details JSONB,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Context
  workflow_execution_id VARCHAR(100), -- n8n execution ID
  metadata JSONB DEFAULT '{}'
);

-- Indexes for sync analytics
CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON sync_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity ON sync_logs(entity_type, entity_id);

-- ═══════════════════════════════════════════════════════════════
-- BUSINESS UNITS CONFIG
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS business_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_business_unit_id BIGINT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  
  -- GoHighLevel Mapping
  ghl_pipeline_id VARCHAR(100),
  ghl_pipeline_name VARCHAR(255),
  
  -- Sync Configuration
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_to_ghl BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert your current business units
INSERT INTO business_units (st_business_unit_id, name, ghl_pipeline_name, sync_enabled) VALUES
  (1314, 'Sales & Service', 'Sales & Service', TRUE),
  (54670601, 'Install', 'Install', TRUE),
  (4622, 'Pool Service', 'Pool Service', TRUE),
  (26143, 'Plumbing', 'Plumbing', TRUE)
ON CONFLICT (st_business_unit_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Function to update sync state
CREATE OR REPLACE FUNCTION update_sync_state(
  p_key VARCHAR(100),
  p_value TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
  INSERT INTO sync_state (key, value, metadata, updated_at)
  VALUES (p_key, p_value, p_metadata, NOW())
  ON CONFLICT (key) 
  DO UPDATE SET 
    value = EXCLUDED.value,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get last job pull timestamp
CREATE OR REPLACE FUNCTION get_last_job_pull()
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN (SELECT value::TIMESTAMPTZ FROM sync_state WHERE key = 'lastJobPull');
END;
$$ LANGUAGE plpgsql;

-- Function to upsert job with customer data
CREATE OR REPLACE FUNCTION upsert_job_from_st(
  p_job_data JSONB,
  p_customer_data JSONB
)
RETURNS UUID AS $$
DECLARE
  v_job_uuid UUID;
  v_customer_uuid UUID;
BEGIN
  -- First, upsert customer
  INSERT INTO customers (
    st_customer_id,
    st_location_id,
    first_name,
    last_name,
    email,
    phone,
    street,
    city,
    state,
    postal_code,
    county,
    st_raw_data,
    synced_from_st_at
  ) VALUES (
    (p_customer_data->>'customerId')::BIGINT,
    (p_customer_data->>'locationId')::BIGINT,
    p_customer_data->>'firstName',
    p_customer_data->>'lastName',
    p_customer_data->>'email',
    p_customer_data->>'phone',
    p_customer_data->'address'->>'street',
    p_customer_data->'address'->>'city',
    p_customer_data->'address'->>'state',
    p_customer_data->'address'->>'zip',
    p_customer_data->'address'->>'county',
    p_customer_data,
    NOW()
  )
  ON CONFLICT (st_customer_id) 
  DO UPDATE SET
    st_location_id = EXCLUDED.st_location_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    street = EXCLUDED.street,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    postal_code = EXCLUDED.postal_code,
    county = EXCLUDED.county,
    st_raw_data = EXCLUDED.st_raw_data,
    synced_from_st_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_customer_uuid;
  
  -- Then, upsert job
  INSERT INTO jobs (
    st_job_id,
    st_job_number,
    st_customer_id,
    st_location_id,
    business_unit_id,
    job_type_id,
    job_type_name,
    job_status,
    priority,
    summary,
    created_on,
    completed_on,
    modified_on,
    first_appointment_id,
    last_appointment_id,
    appointment_count,
    total,
    invoice_id,
    estimate_ids,
    no_charge,
    campaign_id,
    lead_call_id,
    tag_type_ids,
    st_raw_data,
    synced_from_st_at
  ) VALUES (
    (p_job_data->>'id')::BIGINT,
    p_job_data->>'jobNumber',
    (p_job_data->>'customerId')::BIGINT,
    (p_job_data->>'locationId')::BIGINT,
    (p_job_data->>'businessUnitId')::BIGINT,
    (p_job_data->>'jobTypeId')::BIGINT,
    p_job_data->>'jobTypeName',
    p_job_data->>'jobStatus',
    p_job_data->>'priority',
    p_job_data->>'summary',
    (p_job_data->>'createdOn')::TIMESTAMPTZ,
    (p_job_data->>'completedOn')::TIMESTAMPTZ,
    (p_job_data->>'modifiedOn')::TIMESTAMPTZ,
    (p_job_data->>'firstAppointmentId')::BIGINT,
    (p_job_data->>'lastAppointmentId')::BIGINT,
    (p_job_data->>'appointmentCount')::INTEGER,
    (p_job_data->>'total')::DECIMAL,
    (p_job_data->>'invoiceId')::BIGINT,
    ARRAY(SELECT jsonb_array_elements_text(p_job_data->'estimateIds'))::BIGINT[],
    (p_job_data->>'noCharge')::BOOLEAN,
    (p_job_data->>'campaignId')::BIGINT,
    (p_job_data->>'leadCallId')::BIGINT,
    ARRAY(SELECT jsonb_array_elements_text(p_job_data->'tagTypeIds'))::BIGINT[],
    p_job_data,
    NOW()
  )
  ON CONFLICT (st_job_id)
  DO UPDATE SET
    job_status = EXCLUDED.job_status,
    completed_on = EXCLUDED.completed_on,
    modified_on = EXCLUDED.modified_on,
    last_appointment_id = EXCLUDED.last_appointment_id,
    appointment_count = EXCLUDED.appointment_count,
    total = EXCLUDED.total,
    invoice_id = EXCLUDED.invoice_id,
    estimate_ids = EXCLUDED.estimate_ids,
    tag_type_ids = EXCLUDED.tag_type_ids,
    st_raw_data = EXCLUDED.st_raw_data,
    synced_from_st_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_job_uuid;
  
  RETURN v_job_uuid;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_state_updated_at BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- VIEWS FOR COMMON QUERIES
-- ═══════════════════════════════════════════════════════════════

-- Jobs pending GoHighLevel sync
CREATE OR REPLACE VIEW jobs_pending_ghl_sync AS
SELECT 
  j.*,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.street,
  c.city,
  c.state,
  c.postal_code,
  c.county,
  bu.ghl_pipeline_name
FROM jobs j
LEFT JOIN customers c ON j.st_customer_id = c.st_customer_id
LEFT JOIN business_units bu ON j.business_unit_id = bu.st_business_unit_id
WHERE j.ghl_sync_status = 'pending'
  AND bu.sync_to_ghl = TRUE
ORDER BY j.created_on DESC;

-- Sync statistics
CREATE OR REPLACE VIEW sync_statistics AS
SELECT 
  sync_type,
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms,
  MAX(started_at) as last_sync_at
FROM sync_logs
GROUP BY sync_type, status
ORDER BY sync_type, status;

COMMENT ON TABLE customers IS 'ServiceTitan customer records synced from ST API';
COMMENT ON TABLE jobs IS 'ServiceTitan job records synced from ST API';
COMMENT ON TABLE sync_state IS 'Key-value store for sync state (timestamps, cursors, etc)';
COMMENT ON TABLE sync_logs IS 'Audit trail for all sync operations';
COMMENT ON TABLE business_units IS 'Business unit configuration and GHL pipeline mapping';
