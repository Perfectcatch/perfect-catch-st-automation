-- ============================================
-- ServiceTitan Complete Data Replication Schema
-- Migration: 002_servicetitan_complete.sql
-- ============================================
-- This creates a complete mirror of ServiceTitan data
-- for local querying, reporting, and automation
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: st_customers
-- Complete customer master data
-- ============================================
CREATE TABLE st_customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Basic Info
  name VARCHAR(500) NOT NULL,
  type VARCHAR(50), -- 'Residential', 'Commercial'
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Contact Details (JSONB for multiple contacts)
  phone_numbers JSONB DEFAULT '[]',
  email_addresses JSONB DEFAULT '[]',
  
  -- Address (primary)
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(500),
  city VARCHAR(255),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100),
  
  -- All addresses (JSONB)
  addresses JSONB DEFAULT '[]',
  
  -- Financial
  balance DECIMAL(18,4) DEFAULT 0,
  
  -- Status & Flags
  active BOOLEAN DEFAULT true,
  do_not_service BOOLEAN DEFAULT false,
  do_not_mail BOOLEAN DEFAULT false,
  
  -- Tags (array of tag IDs)
  tag_type_ids BIGINT[],
  tags JSONB DEFAULT '[]',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  
  -- Local Timestamps
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full API Response (for reference)
  full_data JSONB NOT NULL,
  
  -- Indexes for performance
  CONSTRAINT st_customers_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_customers_st_id ON st_customers(st_id);
CREATE INDEX idx_st_customers_name ON st_customers(name);
CREATE INDEX idx_st_customers_email ON st_customers(email);
CREATE INDEX idx_st_customers_phone ON st_customers(phone);
CREATE INDEX idx_st_customers_city ON st_customers(city);
CREATE INDEX idx_st_customers_zip ON st_customers(zip);
CREATE INDEX idx_st_customers_modified ON st_customers(st_modified_on);
CREATE INDEX idx_st_customers_balance ON st_customers(balance) WHERE balance > 0;

-- ============================================
-- TABLE: st_locations
-- Customer service locations
-- ============================================
CREATE TABLE st_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  
  -- Address
  name VARCHAR(500),
  street VARCHAR(500),
  unit VARCHAR(100),
  city VARCHAR(255),
  state VARCHAR(100),
  zip VARCHAR(20),
  country VARCHAR(100),
  
  -- Coordinates
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Contact
  phone VARCHAR(50),
  email VARCHAR(255),
  
  -- Tax Settings
  tax_zone_id BIGINT,
  
  -- Tags
  tag_type_ids BIGINT[],
  tags JSONB DEFAULT '[]',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_locations_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_location_customer FOREIGN KEY (customer_id) 
    REFERENCES st_customers(st_id) ON DELETE CASCADE
);

CREATE INDEX idx_st_locations_st_id ON st_locations(st_id);
CREATE INDEX idx_st_locations_customer ON st_locations(customer_id);
CREATE INDEX idx_st_locations_city ON st_locations(city);
CREATE INDEX idx_st_locations_zip ON st_locations(zip);
CREATE INDEX idx_st_locations_coords ON st_locations(latitude, longitude) 
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ============================================
-- TABLE: st_business_units
-- Business units (divisions like Pool, Electrical)
-- ============================================
CREATE TABLE st_business_units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Basic Info
  name VARCHAR(255) NOT NULL,
  official_name VARCHAR(255),
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- GHL Integration
  ghl_pipeline_id VARCHAR(255),
  ghl_location_id VARCHAR(255),
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_business_units_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_business_units_st_id ON st_business_units(st_id);
CREATE INDEX idx_st_business_units_name ON st_business_units(name);
CREATE INDEX idx_st_business_units_active ON st_business_units(active);

-- ============================================
-- TABLE: st_jobs
-- Jobs with GHL sync tracking
-- ============================================
CREATE TABLE st_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Job Number
  job_number VARCHAR(100) NOT NULL,
  
  -- Relations
  customer_id BIGINT NOT NULL,
  location_id BIGINT,
  business_unit_id BIGINT NOT NULL,
  job_type_id BIGINT,
  campaign_id BIGINT,
  
  -- Basic Info
  summary TEXT,
  
  -- Status
  job_status VARCHAR(50), -- 'New', 'Dispatched', 'InProgress', 'Completed', 'Canceled'
  job_completion_time TIMESTAMPTZ,
  
  -- Financial
  invoice_total DECIMAL(18,4) DEFAULT 0,
  balance DECIMAL(18,4) DEFAULT 0,
  total_cost DECIMAL(18,4) DEFAULT 0,
  
  -- Tags
  tag_type_ids BIGINT[],
  tags JSONB DEFAULT '[]',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- GHL Sync Tracking
  ghl_synced_at TIMESTAMPTZ,
  ghl_opportunity_id VARCHAR(255),
  ghl_sync_status VARCHAR(50), -- 'pending', 'synced', 'failed'
  ghl_sync_error TEXT,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_jobs_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_job_customer FOREIGN KEY (customer_id) 
    REFERENCES st_customers(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_job_location FOREIGN KEY (location_id) 
    REFERENCES st_locations(st_id) ON DELETE SET NULL,
  CONSTRAINT fk_job_business_unit FOREIGN KEY (business_unit_id) 
    REFERENCES st_business_units(st_id) ON DELETE RESTRICT
);

CREATE INDEX idx_st_jobs_st_id ON st_jobs(st_id);
CREATE INDEX idx_st_jobs_number ON st_jobs(job_number);
CREATE INDEX idx_st_jobs_customer ON st_jobs(customer_id);
CREATE INDEX idx_st_jobs_location ON st_jobs(location_id);
CREATE INDEX idx_st_jobs_business_unit ON st_jobs(business_unit_id);
CREATE INDEX idx_st_jobs_status ON st_jobs(job_status);
CREATE INDEX idx_st_jobs_modified ON st_jobs(st_modified_on);
CREATE INDEX idx_st_jobs_ghl_pending ON st_jobs(ghl_synced_at) 
  WHERE ghl_synced_at IS NULL;

-- ============================================
-- TABLE: st_estimates
-- Estimates/Quotes
-- ============================================
CREATE TABLE st_estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Relations
  job_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  location_id BIGINT,
  
  -- Estimate Info
  estimate_number VARCHAR(100) NOT NULL,
  name VARCHAR(500),
  
  -- Status
  status VARCHAR(50), -- 'Open', 'Sold', 'Dismissed'
  
  -- Sales Info
  sold_by BIGINT, -- Employee ID
  sold_on TIMESTAMPTZ,
  
  -- Financial
  subtotal DECIMAL(18,4) DEFAULT 0,
  total DECIMAL(18,4) DEFAULT 0,
  
  -- Items (line items as JSONB)
  items JSONB DEFAULT '[]',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_estimates_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_estimate_job FOREIGN KEY (job_id) 
    REFERENCES st_jobs(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_estimate_customer FOREIGN KEY (customer_id) 
    REFERENCES st_customers(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_estimate_location FOREIGN KEY (location_id) 
    REFERENCES st_locations(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_st_estimates_st_id ON st_estimates(st_id);
CREATE INDEX idx_st_estimates_number ON st_estimates(estimate_number);
CREATE INDEX idx_st_estimates_job ON st_estimates(job_id);
CREATE INDEX idx_st_estimates_customer ON st_estimates(customer_id);
CREATE INDEX idx_st_estimates_status ON st_estimates(status);
CREATE INDEX idx_st_estimates_total ON st_estimates(total);
CREATE INDEX idx_st_estimates_modified ON st_estimates(st_modified_on);

-- ============================================
-- TABLE: st_appointments
-- Scheduled appointments
-- ============================================
CREATE TABLE st_appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Relations
  job_id BIGINT NOT NULL,
  
  -- Appointment Info
  status VARCHAR(50), -- 'Scheduled', 'InProgress', 'Completed', 'Canceled'
  
  -- Timing
  start_on TIMESTAMPTZ NOT NULL,
  end_on TIMESTAMPTZ,
  arrival_window_start TIMESTAMPTZ,
  arrival_window_end TIMESTAMPTZ,
  
  -- Technicians (array of tech IDs)
  technician_ids BIGINT[],
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_appointments_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_appointment_job FOREIGN KEY (job_id) 
    REFERENCES st_jobs(st_id) ON DELETE CASCADE
);

CREATE INDEX idx_st_appointments_st_id ON st_appointments(st_id);
CREATE INDEX idx_st_appointments_job ON st_appointments(job_id);
CREATE INDEX idx_st_appointments_status ON st_appointments(status);
CREATE INDEX idx_st_appointments_start ON st_appointments(start_on);
CREATE INDEX idx_st_appointments_techs ON st_appointments USING GIN (technician_ids);

-- ============================================
-- TABLE: st_invoices
-- Invoices
-- ============================================
CREATE TABLE st_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Relations
  job_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  location_id BIGINT,
  business_unit_id BIGINT NOT NULL,
  
  -- Invoice Info
  invoice_number VARCHAR(100) NOT NULL,
  
  -- Status
  status VARCHAR(50), -- 'Draft', 'Sent', 'Paid', 'Void'
  
  -- Dates
  invoice_date DATE,
  due_date DATE,
  
  -- Financial
  subtotal DECIMAL(18,4) DEFAULT 0,
  total DECIMAL(18,4) DEFAULT 0,
  balance DECIMAL(18,4) DEFAULT 0,
  
  -- Items
  items JSONB DEFAULT '[]',
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_invoices_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_invoice_job FOREIGN KEY (job_id) 
    REFERENCES st_jobs(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) 
    REFERENCES st_customers(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_invoice_location FOREIGN KEY (location_id) 
    REFERENCES st_locations(st_id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_business_unit FOREIGN KEY (business_unit_id) 
    REFERENCES st_business_units(st_id) ON DELETE RESTRICT
);

CREATE INDEX idx_st_invoices_st_id ON st_invoices(st_id);
CREATE INDEX idx_st_invoices_number ON st_invoices(invoice_number);
CREATE INDEX idx_st_invoices_job ON st_invoices(job_id);
CREATE INDEX idx_st_invoices_customer ON st_invoices(customer_id);
CREATE INDEX idx_st_invoices_status ON st_invoices(status);
CREATE INDEX idx_st_invoices_balance ON st_invoices(balance) WHERE balance > 0;
CREATE INDEX idx_st_invoices_due_date ON st_invoices(due_date);

-- ============================================
-- TABLE: st_payments
-- Payments
-- ============================================
CREATE TABLE st_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Relations
  customer_id BIGINT NOT NULL,
  invoice_id BIGINT,
  
  -- Payment Info
  payment_number VARCHAR(100),
  payment_type VARCHAR(50), -- 'Cash', 'Check', 'CreditCard', etc.
  payment_method VARCHAR(100),
  
  -- Status
  status VARCHAR(50), -- 'Posted', 'Voided'
  
  -- Financial
  amount DECIMAL(18,4) NOT NULL,
  unapplied_amount DECIMAL(18,4) DEFAULT 0,
  
  -- Date
  payment_date DATE,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_payments_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_payment_customer FOREIGN KEY (customer_id) 
    REFERENCES st_customers(st_id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) 
    REFERENCES st_invoices(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_st_payments_st_id ON st_payments(st_id);
CREATE INDEX idx_st_payments_customer ON st_payments(customer_id);
CREATE INDEX idx_st_payments_invoice ON st_payments(invoice_id);
CREATE INDEX idx_st_payments_date ON st_payments(payment_date);
CREATE INDEX idx_st_payments_amount ON st_payments(amount);

-- ============================================
-- TABLE: st_technicians
-- Technician roster
-- ============================================
CREATE TABLE st_technicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Basic Info
  name VARCHAR(255) NOT NULL,
  employee_id VARCHAR(100),
  
  -- Contact
  email VARCHAR(255),
  phone VARCHAR(50),
  
  -- Business Unit
  business_unit_id BIGINT,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_technicians_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_tech_business_unit FOREIGN KEY (business_unit_id) 
    REFERENCES st_business_units(st_id) ON DELETE SET NULL
);

CREATE INDEX idx_st_technicians_st_id ON st_technicians(st_id);
CREATE INDEX idx_st_technicians_name ON st_technicians(name);
CREATE INDEX idx_st_technicians_active ON st_technicians(active);
CREATE INDEX idx_st_technicians_business_unit ON st_technicians(business_unit_id);

-- ============================================
-- TABLE: st_installed_equipment
-- Installed equipment at locations
-- ============================================
CREATE TABLE st_installed_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Relations
  location_id BIGINT NOT NULL,
  equipment_type_id BIGINT,
  
  -- Equipment Info
  name VARCHAR(500),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  
  -- Install Info
  install_date DATE,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_installed_equipment_st_id_unique UNIQUE (st_id),
  CONSTRAINT fk_equipment_location FOREIGN KEY (location_id) 
    REFERENCES st_locations(st_id) ON DELETE CASCADE
);

CREATE INDEX idx_st_installed_equipment_st_id ON st_installed_equipment(st_id);
CREATE INDEX idx_st_installed_equipment_location ON st_installed_equipment(location_id);
CREATE INDEX idx_st_installed_equipment_type ON st_installed_equipment(equipment_type_id);

-- ============================================
-- TABLE: st_campaigns
-- Marketing campaigns
-- ============================================
CREATE TABLE st_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Campaign Info
  name VARCHAR(255) NOT NULL,
  category_id BIGINT,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_campaigns_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_campaigns_st_id ON st_campaigns(st_id);
CREATE INDEX idx_st_campaigns_name ON st_campaigns(name);
CREATE INDEX idx_st_campaigns_active ON st_campaigns(active);

-- ============================================
-- TABLE: st_call_reasons
-- Call/booking reasons
-- ============================================
CREATE TABLE st_call_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Reason Info
  name VARCHAR(255) NOT NULL,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_call_reasons_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_call_reasons_st_id ON st_call_reasons(st_id);
CREATE INDEX idx_st_call_reasons_name ON st_call_reasons(name);

-- ============================================
-- TABLE: st_job_types
-- Job type definitions
-- ============================================
CREATE TABLE st_job_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Type Info
  name VARCHAR(255) NOT NULL,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_job_types_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_job_types_st_id ON st_job_types(st_id);
CREATE INDEX idx_st_job_types_name ON st_job_types(name);

-- ============================================
-- TABLE: st_tag_types
-- Tag type definitions
-- ============================================
CREATE TABLE st_tag_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Tag Info
  name VARCHAR(255) NOT NULL,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_tag_types_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_tag_types_st_id ON st_tag_types(st_id);
CREATE INDEX idx_st_tag_types_name ON st_tag_types(name);

-- ============================================
-- TABLE: st_custom_fields
-- Custom field definitions
-- ============================================
CREATE TABLE st_custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  
  -- Field Info
  name VARCHAR(255) NOT NULL,
  data_type VARCHAR(50), -- 'Text', 'Number', 'Date', 'Boolean'
  entity_type VARCHAR(50), -- 'Customer', 'Job', 'Estimate', etc.
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  local_synced_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Full Data
  full_data JSONB NOT NULL,
  
  CONSTRAINT st_custom_fields_st_id_unique UNIQUE (st_id)
);

CREATE INDEX idx_st_custom_fields_st_id ON st_custom_fields(st_id);
CREATE INDEX idx_st_custom_fields_name ON st_custom_fields(name);
CREATE INDEX idx_st_custom_fields_entity ON st_custom_fields(entity_type);

-- ============================================
-- TABLE: st_sync_log
-- Track all sync operations
-- ============================================
CREATE TABLE st_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sync Info
  module VARCHAR(100) NOT NULL, -- 'customers', 'jobs', 'estimates', etc.
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental'
  
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
  triggered_by VARCHAR(100), -- 'scheduled', 'manual', 'api'
  parameters JSONB DEFAULT '{}'
);

CREATE INDEX idx_st_sync_log_module ON st_sync_log(module);
CREATE INDEX idx_st_sync_log_status ON st_sync_log(status);
CREATE INDEX idx_st_sync_log_started ON st_sync_log(started_at DESC);

-- ============================================
-- VIEWS: Useful aggregated views
-- ============================================

-- Active jobs with customer info
CREATE VIEW v_active_jobs AS
SELECT 
  j.st_id as job_id,
  j.job_number,
  j.job_status,
  j.summary,
  c.st_id as customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  l.city,
  l.zip,
  bu.name as business_unit,
  j.invoice_total,
  j.balance,
  j.st_created_on,
  j.st_modified_on
FROM st_jobs j
JOIN st_customers c ON j.customer_id = c.st_id
LEFT JOIN st_locations l ON j.location_id = l.st_id
JOIN st_business_units bu ON j.business_unit_id = bu.st_id
WHERE j.job_status NOT IN ('Completed', 'Canceled');

-- Open estimates
CREATE VIEW v_open_estimates AS
SELECT 
  e.st_id as estimate_id,
  e.estimate_number,
  e.name as estimate_name,
  e.total,
  j.job_number,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  e.st_created_on,
  e.st_modified_on
FROM st_estimates e
JOIN st_jobs j ON e.job_id = j.st_id
JOIN st_customers c ON e.customer_id = c.st_id
WHERE e.status = 'Open';

-- Outstanding invoices
CREATE VIEW v_outstanding_invoices AS
SELECT 
  i.st_id as invoice_id,
  i.invoice_number,
  i.total,
  i.balance,
  i.due_date,
  j.job_number,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  CASE 
    WHEN i.due_date < CURRENT_DATE THEN 'Overdue'
    WHEN i.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'Due Soon'
    ELSE 'Current'
  END as payment_status
FROM st_invoices i
JOIN st_jobs j ON i.job_id = j.st_id
JOIN st_customers c ON i.customer_id = c.st_id
WHERE i.balance > 0;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Adjust these based on your user setup
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE st_customers IS 'Complete mirror of ServiceTitan customers';
COMMENT ON TABLE st_jobs IS 'Jobs with GHL sync tracking for opportunity management';
COMMENT ON TABLE st_estimates IS 'Estimates/quotes with sold tracking';
COMMENT ON TABLE st_appointments IS 'Scheduled appointments with technician assignments';
COMMENT ON TABLE st_sync_log IS 'Audit log of all sync operations from ServiceTitan';

-- ============================================
-- END OF MIGRATION
-- ============================================
