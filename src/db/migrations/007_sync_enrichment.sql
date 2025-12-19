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
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE st_customers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

-- JOBS: Add enrichment columns
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS technician_name VARCHAR(200);
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'Normal';
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMP;
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMP;
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS completed_on TIMESTAMP;
ALTER TABLE st_jobs ADD COLUMN IF NOT EXISTS technician_id BIGINT;

-- ESTIMATES: Add enrichment columns
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS sold_on TIMESTAMP;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS sold_by_id BIGINT;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS items TEXT;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS tax DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS estimate_number VARCHAR(100);
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS name VARCHAR(500);
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE st_estimates ADD COLUMN IF NOT EXISTS business_unit_id BIGINT;

-- INVOICES: Add payment tracking
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS paid_on TIMESTAMP;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS items TEXT;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS payments TEXT;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS tax DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100);
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE st_invoices ADD COLUMN IF NOT EXISTS business_unit_id BIGINT;

-- APPOINTMENTS: Add tracking fields
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS actual_departure TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS technician_name VARCHAR(200);
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS appointment_number VARCHAR(100);
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS arrival_window_start TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS arrival_window_end TIMESTAMP;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS customer_id BIGINT;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE st_appointments ADD COLUMN IF NOT EXISTS technician_id BIGINT;

-- TECHNICIANS: Add performance fields
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS total_jobs INTEGER DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS completed_jobs INTEGER DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]';
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS role VARCHAR(100);
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS is_technician BOOLEAN DEFAULT TRUE;
ALTER TABLE st_technicians ADD COLUMN IF NOT EXISTS business_unit_id BIGINT;

-- BUSINESS UNITS: Add stats
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS total_jobs INTEGER DEFAULT 0;
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS active_jobs INTEGER DEFAULT 0;
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE st_business_units ADD COLUMN IF NOT EXISTS address TEXT;

-- JOB TYPES: Add fields
ALTER TABLE st_job_types ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_job_types ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE st_job_types ADD COLUMN IF NOT EXISTS business_unit_id BIGINT;

-- CAMPAIGNS: Add fields
ALTER TABLE st_campaigns ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_campaigns ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE st_campaigns ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- TAG TYPES: Add fields
ALTER TABLE st_tag_types ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_tag_types ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE st_tag_types ADD COLUMN IF NOT EXISTS color VARCHAR(50);
ALTER TABLE st_tag_types ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);

-- EMPLOYEES: Add fields
ALTER TABLE st_employees ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE st_employees ADD COLUMN IF NOT EXISTS role VARCHAR(100);
ALTER TABLE st_employees ADD COLUMN IF NOT EXISTS business_unit_id BIGINT;

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
