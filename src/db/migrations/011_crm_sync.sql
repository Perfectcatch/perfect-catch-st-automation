-- ============================================
-- Migration 011: CRM Pipeline Sync Schema
-- Perfect Catch ST Automation
-- Date: 2025-12-21
-- Purpose: Bidirectional sync between ServiceTitan and Perfect Catch CRM
-- Schema: crm (separate from integrations/ghl)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SCHEMA: crm
-- Isolated schema for CRM sync data
-- ============================================

CREATE SCHEMA IF NOT EXISTS crm;

-- ============================================
-- ENUM: CRM Sync Status
-- ============================================

DO $$ BEGIN
  CREATE TYPE crm.sync_status AS ENUM (
    'pending',
    'synced',
    'failed',
    'skipped',
    'conflict'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- TABLE: crm.crm_contacts
-- CRM contacts linked to ST customers
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- CRM Reference (Payload CMS ID)
  crm_id VARCHAR(255) UNIQUE,

  -- ServiceTitan Reference
  st_customer_id BIGINT,

  -- Basic Info
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  full_name VARCHAR(500),
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),

  -- Address
  address_street VARCHAR(500),
  address_city VARCHAR(255),
  address_state VARCHAR(100),
  address_zip VARCHAR(20),

  -- CRM Classification
  contact_type VARCHAR(50), -- 'lead', 'customer', 'past_customer', 'vendor'
  source VARCHAR(100), -- 'website', 'referral', 'google_ads', 'servicetitan'

  -- Assignment
  assigned_to VARCHAR(255), -- CRM user ID

  -- Tags & Custom Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- Timestamps from CRM
  crm_created_at TIMESTAMPTZ,
  crm_updated_at TIMESTAMPTZ,

  -- Full Data (complete CRM response)
  full_data JSONB,

  -- Sync Tracking
  sync_status VARCHAR(50) DEFAULT 'pending',
  sync_direction VARCHAR(20), -- 'to_crm', 'from_crm', 'bidirectional'
  sync_attempts INT DEFAULT 0,
  sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  st_data_hash VARCHAR(64), -- Hash of ST data for change detection
  crm_data_hash VARCHAR(64), -- Hash of CRM data for change detection

  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_contacts_crm_id ON crm.crm_contacts(crm_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_st_customer ON crm.crm_contacts(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm.crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm.crm_contacts(phone);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_sync_status ON crm.crm_contacts(sync_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_pending ON crm.crm_contacts(sync_status)
  WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_contacts_failed ON crm.crm_contacts(sync_status)
  WHERE sync_status = 'failed';

COMMENT ON TABLE crm.crm_contacts IS 'CRM contacts with bidirectional sync to ServiceTitan customers';

-- ============================================
-- TABLE: crm.crm_opportunities
-- CRM opportunities with pipeline/stage tracking
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- CRM Reference (Payload CMS ID)
  crm_id VARCHAR(255) UNIQUE,
  crm_contact_id VARCHAR(255), -- Link to CRM contact

  -- ServiceTitan References
  st_customer_id BIGINT,
  st_job_id BIGINT,
  st_estimate_id BIGINT,

  -- Pipeline/Stage Info (using slugs for CRM compatibility)
  crm_pipeline_slug VARCHAR(100) NOT NULL, -- 'sales', 'install'
  crm_pipeline_name VARCHAR(255),
  crm_stage_slug VARCHAR(100) NOT NULL, -- 'new-lead', 'contacted', etc.
  crm_stage_name VARCHAR(255),
  previous_stage_slug VARCHAR(100), -- Track stage changes

  -- Opportunity Info
  title VARCHAR(500) NOT NULL,
  description TEXT,
  monetary_value DECIMAL(18,4) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'won', 'lost', 'on_hold'
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'

  -- Assignment
  assigned_to VARCHAR(255), -- CRM user ID

  -- Dates
  expected_close_date DATE,
  actual_close_date DATE,
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason VARCHAR(100),

  -- Tags & Custom Fields
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',

  -- ST Data References (for quick access)
  st_job_number VARCHAR(50),
  st_estimate_number VARCHAR(50),
  st_business_unit_id BIGINT,
  st_job_type_id BIGINT,
  technician_ids JSONB DEFAULT '[]', -- Array of technician IDs

  -- Timestamps from CRM
  crm_created_at TIMESTAMPTZ,
  crm_updated_at TIMESTAMPTZ,

  -- Full Data
  full_data JSONB,

  -- Sync Tracking
  sync_status VARCHAR(50) DEFAULT 'pending',
  sync_direction VARCHAR(20), -- 'to_crm', 'from_crm'
  sync_attempts INT DEFAULT 0,
  sync_error TEXT,
  last_synced_at TIMESTAMPTZ,
  st_data_hash VARCHAR(64),
  crm_data_hash VARCHAR(64),

  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_crm_id ON crm.crm_opportunities(crm_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact ON crm.crm_opportunities(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_st_customer ON crm.crm_opportunities(st_customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_st_job ON crm.crm_opportunities(st_job_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_st_estimate ON crm.crm_opportunities(st_estimate_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_pipeline ON crm.crm_opportunities(crm_pipeline_slug);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm.crm_opportunities(crm_stage_slug);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_status ON crm.crm_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_sync_status ON crm.crm_opportunities(sync_status);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_pending ON crm.crm_opportunities(sync_status)
  WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_open ON crm.crm_opportunities(status)
  WHERE status = 'open';

COMMENT ON TABLE crm.crm_opportunities IS 'CRM opportunities with pipeline tracking and ST job/estimate linking';

-- ============================================
-- TABLE: crm.crm_sync_log
-- Sync operation audit trail
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Sync Operation Info
  sync_type VARCHAR(50) NOT NULL,
    -- 'contacts_to_crm', 'opportunities_to_crm',
    -- 'contacts_from_crm', 'opportunities_from_crm',
    -- 'incremental', 'full'
  direction VARCHAR(20) NOT NULL, -- 'to_crm', 'from_crm', 'bidirectional'

  -- Status
  status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed'

  -- Statistics
  records_processed INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  records_failed INT DEFAULT 0,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INT,

  -- Error Details
  error_message TEXT,
  error_details JSONB,
  failed_records JSONB DEFAULT '[]', -- Array of {id, error} for failed records

  -- Metadata
  triggered_by VARCHAR(100), -- 'scheduled', 'manual', 'webhook'
  trigger_source VARCHAR(255), -- Additional context (webhook event type, user, etc.)

  -- Step-by-step progress (for multi-step syncs)
  step_results JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_type ON crm.crm_sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_direction ON crm.crm_sync_log(direction);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_status ON crm.crm_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_log_started ON crm.crm_sync_log(started_at DESC);

COMMENT ON TABLE crm.crm_sync_log IS 'Audit trail of all CRM sync operations';

-- ============================================
-- TABLE: crm.crm_pipeline_mapping
-- Maps ST business units/job types to CRM pipelines/stages
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_pipeline_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Reference (what triggers the mapping)
  st_business_unit_id BIGINT,
  st_business_unit_name VARCHAR(255),
  st_job_type_id BIGINT,
  st_job_type_name VARCHAR(255),

  -- CRM Pipeline/Stage Reference
  crm_pipeline_slug VARCHAR(100) NOT NULL, -- 'sales', 'install'
  crm_pipeline_name VARCHAR(255),
  crm_default_stage_slug VARCHAR(100), -- Default stage when entering this pipeline
  crm_default_stage_name VARCHAR(255),

  -- Stage Mapping (ST status -> CRM stage)
  stage_mappings JSONB DEFAULT '{}',
  -- Example: {"Scheduled": "appointment-scheduled", "InProgress": "in-progress", "Completed": "job-completed"}

  -- Mapping Rules
  is_default BOOLEAN DEFAULT false, -- Use this mapping if no specific match
  priority INT DEFAULT 0, -- Higher = more specific match (wins over lower)
  is_install_pipeline BOOLEAN DEFAULT false, -- True for install-related mappings

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_crm_pipeline_mapping UNIQUE (st_business_unit_id, st_job_type_id, crm_pipeline_slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_mapping_bu ON crm.crm_pipeline_mapping(st_business_unit_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_mapping_job_type ON crm.crm_pipeline_mapping(st_job_type_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_mapping_pipeline ON crm.crm_pipeline_mapping(crm_pipeline_slug);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_mapping_default ON crm.crm_pipeline_mapping(is_default)
  WHERE is_default = true;

COMMENT ON TABLE crm.crm_pipeline_mapping IS 'Maps ST business units and job types to CRM pipelines and stages';

-- ============================================
-- TABLE: crm.crm_webhook_events
-- Incoming webhook events from CRM
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event Info
  event_type VARCHAR(100) NOT NULL,
    -- 'opportunity.stage_changed', 'opportunity.won', 'opportunity.lost',
    -- 'contact.created', 'contact.updated', 'pricebook.push_requested'
  event_source VARCHAR(100), -- 'crm', 'manual', 'automation'

  -- Entity Reference
  entity_type VARCHAR(50), -- 'opportunity', 'contact', 'pricebook'
  entity_id VARCHAR(255), -- CRM entity ID
  st_entity_id BIGINT, -- ST entity ID if known

  -- Payload
  payload JSONB NOT NULL,
  headers JSONB,

  -- Processing Status
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_result JSONB, -- Result of processing
  processing_error TEXT,
  processing_attempts INT DEFAULT 0,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_type ON crm.crm_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_entity ON crm.crm_webhook_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_unprocessed ON crm.crm_webhook_events(processed)
  WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_received ON crm.crm_webhook_events(received_at DESC);

COMMENT ON TABLE crm.crm_webhook_events IS 'Incoming webhook events from CRM for processing';

-- ============================================
-- TABLE: crm.crm_stage_history
-- Track opportunity stage changes over time
-- ============================================

CREATE TABLE IF NOT EXISTS crm.crm_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Opportunity Reference
  crm_opportunity_id UUID REFERENCES crm.crm_opportunities(id),
  crm_id VARCHAR(255), -- CRM opportunity ID

  -- Stage Change
  from_pipeline_slug VARCHAR(100),
  from_stage_slug VARCHAR(100),
  to_pipeline_slug VARCHAR(100) NOT NULL,
  to_stage_slug VARCHAR(100) NOT NULL,

  -- Change Trigger
  trigger_type VARCHAR(50), -- 'st_sync', 'crm_manual', 'crm_automation', 'webhook'
  trigger_source VARCHAR(255), -- Additional context

  -- ST Context (if triggered by ST event)
  st_job_id BIGINT,
  st_job_status VARCHAR(50),
  st_estimate_id BIGINT,
  st_estimate_status VARCHAR(50),

  -- Timestamp
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_opportunity ON crm.crm_stage_history(crm_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_crm_id ON crm.crm_stage_history(crm_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_history_changed ON crm.crm_stage_history(changed_at DESC);

COMMENT ON TABLE crm.crm_stage_history IS 'Audit trail of opportunity stage changes';

-- ============================================
-- FUNCTIONS: CRM Sync Utilities
-- ============================================

-- Function to check if contact already synced
CREATE OR REPLACE FUNCTION crm.contact_exists(p_st_customer_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM crm.crm_contacts
    WHERE st_customer_id = p_st_customer_id
      AND crm_id IS NOT NULL
      AND sync_status = 'synced'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check if opportunity already synced
CREATE OR REPLACE FUNCTION crm.opportunity_exists(
  p_st_customer_id BIGINT,
  p_st_job_id BIGINT DEFAULT NULL,
  p_st_estimate_id BIGINT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM crm.crm_opportunities
    WHERE st_customer_id = p_st_customer_id
      AND crm_id IS NOT NULL
      AND sync_status = 'synced'
      AND (
        (p_st_job_id IS NOT NULL AND st_job_id = p_st_job_id)
        OR (p_st_estimate_id IS NOT NULL AND st_estimate_id = p_st_estimate_id)
        OR (p_st_job_id IS NULL AND p_st_estimate_id IS NULL)
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get pipeline mapping for a job
CREATE OR REPLACE FUNCTION crm.get_pipeline_for_job(
  p_st_business_unit_id BIGINT,
  p_st_job_type_id BIGINT DEFAULT NULL,
  p_is_install BOOLEAN DEFAULT false
)
RETURNS TABLE (
  pipeline_slug VARCHAR,
  pipeline_name VARCHAR,
  stage_slug VARCHAR,
  stage_name VARCHAR,
  stage_mappings JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.crm_pipeline_slug,
    m.crm_pipeline_name,
    m.crm_default_stage_slug,
    m.crm_default_stage_name,
    m.stage_mappings
  FROM crm.crm_pipeline_mapping m
  WHERE (
    (m.st_business_unit_id = p_st_business_unit_id AND m.st_job_type_id = p_st_job_type_id)
    OR (m.st_business_unit_id = p_st_business_unit_id AND m.st_job_type_id IS NULL)
    OR (m.st_business_unit_id IS NULL AND m.st_job_type_id = p_st_job_type_id)
    OR m.is_default = true
  )
  AND (NOT p_is_install OR m.is_install_pipeline = p_is_install)
  ORDER BY m.priority DESC, m.is_default ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to log sync operation
CREATE OR REPLACE FUNCTION crm.log_sync_start(
  p_sync_type VARCHAR,
  p_direction VARCHAR,
  p_triggered_by VARCHAR DEFAULT 'scheduled'
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO crm.crm_sync_log (sync_type, direction, status, triggered_by)
  VALUES (p_sync_type, p_direction, 'started', p_triggered_by)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to complete sync log
CREATE OR REPLACE FUNCTION crm.log_sync_complete(
  p_log_id UUID,
  p_records_created INT DEFAULT 0,
  p_records_updated INT DEFAULT 0,
  p_records_skipped INT DEFAULT 0,
  p_records_failed INT DEFAULT 0,
  p_step_results JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
  UPDATE crm.crm_sync_log
  SET
    status = 'completed',
    records_processed = p_records_created + p_records_updated + p_records_skipped + p_records_failed,
    records_created = p_records_created,
    records_updated = p_records_updated,
    records_skipped = p_records_skipped,
    records_failed = p_records_failed,
    step_results = p_step_results,
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
  WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to fail sync log
CREATE OR REPLACE FUNCTION crm.log_sync_fail(
  p_log_id UUID,
  p_error_message TEXT,
  p_error_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE crm.crm_sync_log
  SET
    status = 'failed',
    error_message = p_error_message,
    error_details = p_error_details,
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
  WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record stage change
CREATE OR REPLACE FUNCTION crm.record_stage_change(
  p_crm_opportunity_id UUID,
  p_crm_id VARCHAR,
  p_from_pipeline VARCHAR,
  p_from_stage VARCHAR,
  p_to_pipeline VARCHAR,
  p_to_stage VARCHAR,
  p_trigger_type VARCHAR,
  p_trigger_source VARCHAR DEFAULT NULL,
  p_st_job_id BIGINT DEFAULT NULL,
  p_st_job_status VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  INSERT INTO crm.crm_stage_history (
    crm_opportunity_id, crm_id,
    from_pipeline_slug, from_stage_slug,
    to_pipeline_slug, to_stage_slug,
    trigger_type, trigger_source,
    st_job_id, st_job_status
  ) VALUES (
    p_crm_opportunity_id, p_crm_id,
    p_from_pipeline, p_from_stage,
    p_to_pipeline, p_to_stage,
    p_trigger_type, p_trigger_source,
    p_st_job_id, p_st_job_status
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update local_updated_at
CREATE OR REPLACE FUNCTION crm.update_local_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.local_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_crm_contacts_updated_at ON crm.crm_contacts;
CREATE TRIGGER update_crm_contacts_updated_at
  BEFORE UPDATE ON crm.crm_contacts
  FOR EACH ROW
  EXECUTE FUNCTION crm.update_local_updated_at();

DROP TRIGGER IF EXISTS update_crm_opportunities_updated_at ON crm.crm_opportunities;
CREATE TRIGGER update_crm_opportunities_updated_at
  BEFORE UPDATE ON crm.crm_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION crm.update_local_updated_at();

-- ============================================
-- VIEWS: CRM Sync Insights
-- ============================================

-- Sync status summary
CREATE OR REPLACE VIEW crm.v_sync_status AS
SELECT
  'contacts' as entity_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE sync_status = 'synced') as synced,
  COUNT(*) FILTER (WHERE sync_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE sync_status = 'failed') as failed,
  MAX(last_synced_at) as last_sync
FROM crm.crm_contacts
UNION ALL
SELECT
  'opportunities' as entity_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE sync_status = 'synced') as synced,
  COUNT(*) FILTER (WHERE sync_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE sync_status = 'failed') as failed,
  MAX(last_synced_at) as last_sync
FROM crm.crm_opportunities;

-- Recent sync activity
CREATE OR REPLACE VIEW crm.v_recent_activity AS
SELECT
  id,
  sync_type,
  direction,
  status,
  records_created,
  records_updated,
  records_failed,
  duration_ms,
  error_message,
  triggered_by,
  started_at,
  completed_at
FROM crm.crm_sync_log
ORDER BY started_at DESC
LIMIT 100;

-- Pending contacts for sync
CREATE OR REPLACE VIEW crm.v_contacts_pending_sync AS
SELECT
  c.id,
  c.st_customer_id,
  c.full_name,
  c.email,
  c.phone,
  c.sync_status,
  c.sync_error,
  c.sync_attempts,
  sc.name as st_customer_name,
  sc.email as st_email,
  sc.phone as st_phone
FROM crm.crm_contacts c
LEFT JOIN servicetitan.st_customers sc ON c.st_customer_id = sc.st_id
WHERE c.sync_status IN ('pending', 'failed')
ORDER BY c.local_created_at DESC;

-- Pending opportunities for sync
CREATE OR REPLACE VIEW crm.v_opportunities_pending_sync AS
SELECT
  o.id,
  o.st_customer_id,
  o.st_job_id,
  o.st_estimate_id,
  o.title,
  o.crm_pipeline_slug,
  o.crm_stage_slug,
  o.monetary_value,
  o.sync_status,
  o.sync_error,
  o.sync_attempts,
  sc.name as customer_name,
  j.job_number,
  j.job_status
FROM crm.crm_opportunities o
LEFT JOIN servicetitan.st_customers sc ON o.st_customer_id = sc.st_id
LEFT JOIN servicetitan.st_jobs j ON o.st_job_id = j.st_id
WHERE o.sync_status IN ('pending', 'failed')
ORDER BY o.local_created_at DESC;

-- Pipeline stage distribution
CREATE OR REPLACE VIEW crm.v_pipeline_distribution AS
SELECT
  crm_pipeline_slug,
  crm_pipeline_name,
  crm_stage_slug,
  crm_stage_name,
  status,
  COUNT(*) as opportunity_count,
  SUM(monetary_value) as total_value,
  AVG(monetary_value) as avg_value
FROM crm.crm_opportunities
GROUP BY crm_pipeline_slug, crm_pipeline_name, crm_stage_slug, crm_stage_name, status
ORDER BY crm_pipeline_slug, crm_stage_slug;

-- ============================================
-- SEED DATA: Default Pipeline Mappings
-- ============================================

-- Insert default sales pipeline mapping
INSERT INTO crm.crm_pipeline_mapping (
  st_business_unit_id, st_business_unit_name,
  crm_pipeline_slug, crm_pipeline_name,
  crm_default_stage_slug, crm_default_stage_name,
  stage_mappings,
  is_default, priority, is_install_pipeline
) VALUES (
  NULL, NULL,
  'sales', 'Sales Pipeline',
  'new-lead', 'New Lead',
  '{
    "new": "new-lead",
    "contacted": "contacted",
    "scheduled": "appointment-scheduled",
    "proposal_sent": "proposal-sent",
    "followup": "estimate-followup",
    "sold": "job-sold",
    "lost": "estimate-lost"
  }',
  true, 0, false
) ON CONFLICT DO NOTHING;

-- Insert default install pipeline mapping
INSERT INTO crm.crm_pipeline_mapping (
  st_business_unit_id, st_business_unit_name,
  crm_pipeline_slug, crm_pipeline_name,
  crm_default_stage_slug, crm_default_stage_name,
  stage_mappings,
  is_default, priority, is_install_pipeline
) VALUES (
  NULL, NULL,
  'install', 'Install Pipeline',
  'estimate-approved', 'Estimate Approved',
  '{
    "Scheduled": "scheduled",
    "Dispatched": "scheduled",
    "Working": "in-progress",
    "Hold": "on-hold",
    "Completed": "job-completed",
    "Canceled": "job-completed"
  }',
  false, 0, true
) ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON SCHEMA crm IS 'Perfect Catch CRM sync data - isolated from main ST data';
COMMENT ON FUNCTION crm.contact_exists IS 'Check if ST customer already synced to CRM';
COMMENT ON FUNCTION crm.opportunity_exists IS 'Check if ST job/estimate already synced to CRM';
COMMENT ON FUNCTION crm.get_pipeline_for_job IS 'Get CRM pipeline/stage mapping for ST job';
COMMENT ON FUNCTION crm.log_sync_start IS 'Start a sync operation log entry';
COMMENT ON FUNCTION crm.log_sync_complete IS 'Complete a sync operation log entry with stats';
COMMENT ON FUNCTION crm.log_sync_fail IS 'Mark a sync operation as failed with error details';
COMMENT ON FUNCTION crm.record_stage_change IS 'Record opportunity stage change for audit trail';

-- ============================================
-- END OF MIGRATION 011
-- ============================================
