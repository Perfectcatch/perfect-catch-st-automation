-- ST-Automation Initial Schema for Supabase
-- Run this in Supabase SQL Editor to set up the database

-- ============================================
-- RAW SERVICETITAN DATA TABLES
-- ============================================

-- Customers from ServiceTitan
CREATE TABLE IF NOT EXISTS raw_st_customers (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  active BOOLEAN DEFAULT true,
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_st_customers_st_id ON raw_st_customers(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_st_customers_email ON raw_st_customers(email);
CREATE INDEX IF NOT EXISTS idx_raw_st_customers_phone ON raw_st_customers(phone);

-- Jobs from ServiceTitan
CREATE TABLE IF NOT EXISTS raw_st_jobs (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  job_number TEXT,
  customer_id BIGINT,
  location_id BIGINT,
  business_unit_id BIGINT,
  job_type_id BIGINT,
  status TEXT,
  summary TEXT,
  total DECIMAL(12,2),
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  completed_on TIMESTAMPTZ,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_st_jobs_st_id ON raw_st_jobs(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_st_jobs_customer_id ON raw_st_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_raw_st_jobs_status ON raw_st_jobs(status);

-- Appointments from ServiceTitan
CREATE TABLE IF NOT EXISTS raw_st_appointments (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  job_id BIGINT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT,
  technician_ids BIGINT[],
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_st_appointments_st_id ON raw_st_appointments(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_st_appointments_job_id ON raw_st_appointments(job_id);
CREATE INDEX IF NOT EXISTS idx_raw_st_appointments_start ON raw_st_appointments(start_time);

-- Technicians from ServiceTitan
CREATE TABLE IF NOT EXISTS raw_st_technicians (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_st_technicians_st_id ON raw_st_technicians(st_id);

-- Business Units from ServiceTitan
CREATE TABLE IF NOT EXISTS raw_st_business_units (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  active BOOLEAN DEFAULT true,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_st_business_units_st_id ON raw_st_business_units(st_id);

-- ============================================
-- PRICEBOOK TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS raw_pricebook_categories (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  code TEXT,
  parent_id BIGINT,
  active BOOLEAN DEFAULT true,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_pricebook_categories_st_id ON raw_pricebook_categories(st_id);

CREATE TABLE IF NOT EXISTS raw_pricebook_materials (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  description TEXT,
  price DECIMAL(12,2),
  cost DECIMAL(12,2),
  active BOOLEAN DEFAULT true,
  category_id BIGINT,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_pricebook_materials_st_id ON raw_pricebook_materials(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_pricebook_materials_code ON raw_pricebook_materials(code);

CREATE TABLE IF NOT EXISTS raw_pricebook_services (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  description TEXT,
  price DECIMAL(12,2),
  duration_hours DECIMAL(6,2),
  active BOOLEAN DEFAULT true,
  category_id BIGINT,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_pricebook_services_st_id ON raw_pricebook_services(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_pricebook_services_code ON raw_pricebook_services(code);

CREATE TABLE IF NOT EXISTS raw_pricebook_equipment (
  id BIGSERIAL PRIMARY KEY,
  st_id BIGINT UNIQUE NOT NULL,
  code TEXT,
  name TEXT,
  description TEXT,
  price DECIMAL(12,2),
  cost DECIMAL(12,2),
  active BOOLEAN DEFAULT true,
  category_id BIGINT,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_pricebook_equipment_st_id ON raw_pricebook_equipment(st_id);
CREATE INDEX IF NOT EXISTS idx_raw_pricebook_equipment_code ON raw_pricebook_equipment(code);

-- ============================================
-- GHL INTEGRATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS ghl_contacts (
  id BIGSERIAL PRIMARY KEY,
  ghl_id TEXT UNIQUE NOT NULL,
  location_id TEXT,
  first_name TEXT,
  last_name TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  tags TEXT[],
  source TEXT,
  st_customer_id BIGINT,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_ghl_id ON ghl_contacts(ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_st_customer_id ON ghl_contacts(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_email ON ghl_contacts(email);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_phone ON ghl_contacts(phone);

CREATE TABLE IF NOT EXISTS ghl_opportunities (
  id BIGSERIAL PRIMARY KEY,
  ghl_id TEXT UNIQUE NOT NULL,
  location_id TEXT,
  contact_id TEXT,
  pipeline_id TEXT,
  pipeline_stage_id TEXT,
  name TEXT,
  status TEXT,
  monetary_value DECIMAL(12,2),
  source TEXT,
  st_job_id BIGINT,
  st_estimate_id BIGINT,
  full_data JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_ghl_id ON ghl_opportunities(ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_contact_id ON ghl_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_st_job_id ON ghl_opportunities(st_job_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_pipeline_id ON ghl_opportunities(pipeline_id);

-- ============================================
-- SYNC TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS sync_log (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_operation ON sync_log(operation);
CREATE INDEX IF NOT EXISTS idx_sync_log_created_at ON sync_log(created_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT UNIQUE NOT NULL,
  last_sync_at TIMESTAMPTZ,
  last_modified_cursor TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  metadata JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_state_entity_type ON sync_state(entity_type);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.columns 
    WHERE column_name = 'updated_at' 
      AND table_schema = 'public'
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
      CREATE TRIGGER update_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (Optional - enable if needed)
-- ============================================

-- Enable RLS on tables (uncomment if using Supabase auth)
-- ALTER TABLE raw_st_customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE raw_st_jobs ENABLE ROW LEVEL SECURITY;
-- etc.

-- ============================================
-- GRANTS (for service role)
-- ============================================

-- Service role has full access by default in Supabase
-- No additional grants needed when using SUPABASE_SERVICE_KEY
