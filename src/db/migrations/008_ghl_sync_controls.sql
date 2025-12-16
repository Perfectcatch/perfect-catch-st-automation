-- ============================================
-- Migration 008: GHL Sync Controls & Deduplication
-- Perfect Catch ST Automation - Batch 10
-- Date: 2025-12-15
-- Purpose: Add deduplication functions and additional GHL tables
-- ============================================

-- ============================================
-- ENUM: GHL Sync Status (if not exists)
-- ============================================

DO $$ BEGIN
  CREATE TYPE ghl_sync_status AS ENUM (
    'pending',
    'synced',
    'failed',
    'skipped',
    'conflict'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ghl_entity_type AS ENUM (
    'contact',
    'opportunity',
    'task',
    'note',
    'appointment'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- TABLE: ghl_pipeline_mapping
-- Maps ST job types/business units to GHL pipelines/stages
-- ============================================

CREATE TABLE IF NOT EXISTS ghl_pipeline_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Reference
  st_job_type_id BIGINT,
  st_job_type_name VARCHAR(255),
  st_business_unit_id BIGINT,
  st_business_unit_name VARCHAR(255),

  -- GoHighLevel Reference
  ghl_pipeline_id VARCHAR(255) NOT NULL,
  ghl_pipeline_name VARCHAR(255),
  ghl_default_stage_id VARCHAR(255),
  ghl_default_stage_name VARCHAR(255),
  ghl_location_id VARCHAR(255) NOT NULL,

  -- Mapping Rules
  is_default BOOLEAN DEFAULT false,
  priority INT DEFAULT 0, -- Higher = more specific match

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT uq_ghl_pipeline_mapping UNIQUE (st_job_type_id, st_business_unit_id, ghl_location_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_st_job_type ON ghl_pipeline_mapping(st_job_type_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_st_bu ON ghl_pipeline_mapping(st_business_unit_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_default ON ghl_pipeline_mapping(is_default) WHERE is_default = true;

-- ============================================
-- TABLE: ghl_webhook_events
-- Incoming webhooks from GHL
-- ============================================

CREATE TABLE IF NOT EXISTS ghl_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event Info
  event_type VARCHAR(100) NOT NULL,
  ghl_location_id VARCHAR(255),

  -- Payload
  payload JSONB NOT NULL,
  headers JSONB,

  -- Processing
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ghl_webhook_events_type ON ghl_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ghl_webhook_events_unprocessed ON ghl_webhook_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_ghl_webhook_events_received ON ghl_webhook_events(received_at DESC);

-- ============================================
-- ALTER: Add sync_status columns to existing tables
-- ============================================

-- Add sync_status to ghl_contacts if it doesn't exist
DO $$ BEGIN
  ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'synced';
  ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS sync_attempts INT DEFAULT 0;
  ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
  ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS st_data_hash VARCHAR(64);
  ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS ghl_data_hash VARCHAR(64);
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Add sync_status to ghl_opportunities if it doesn't exist
DO $$ BEGIN
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'synced';
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS sync_attempts INT DEFAULT 0;
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS last_sync_error TEXT;
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS st_data_hash VARCHAR(64);
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS ghl_data_hash VARCHAR(64);
  ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS st_estimate_id BIGINT;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Add index for st_estimate_id
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_st_estimate ON ghl_opportunities(st_estimate_id);

-- ============================================
-- FUNCTION: Check if contact already synced
-- Prevents duplicate syncs
-- ============================================

CREATE OR REPLACE FUNCTION ghl_contact_exists(p_st_customer_id BIGINT, p_ghl_location_id VARCHAR)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ghl_contacts
    WHERE st_customer_id = p_st_customer_id
      AND (ghl_location_id = p_ghl_location_id OR p_ghl_location_id IS NULL)
      AND ghl_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Check if opportunity already synced
-- Prevents duplicate syncs
-- ============================================

CREATE OR REPLACE FUNCTION ghl_opportunity_exists(
  p_st_job_id BIGINT,
  p_st_estimate_id BIGINT,
  p_ghl_location_id VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ghl_opportunities
    WHERE (ghl_location_id = p_ghl_location_id OR p_ghl_location_id IS NULL)
      AND ghl_id IS NOT NULL
      AND (
        (p_st_job_id IS NOT NULL AND st_job_id = p_st_job_id)
        OR (p_st_estimate_id IS NOT NULL AND st_estimate_id = p_st_estimate_id)
        OR (p_st_estimate_id IS NOT NULL AND (custom_fields->>'stEstimateId')::bigint = p_st_estimate_id)
      )
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Get pipeline for job type
-- ============================================

CREATE OR REPLACE FUNCTION ghl_get_pipeline_for_job(
  p_st_job_type_id BIGINT,
  p_st_business_unit_id BIGINT,
  p_ghl_location_id VARCHAR
)
RETURNS TABLE (
  pipeline_id VARCHAR,
  pipeline_name VARCHAR,
  stage_id VARCHAR,
  stage_name VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ghl_pipeline_id,
    ghl_pipeline_name,
    ghl_default_stage_id,
    ghl_default_stage_name
  FROM ghl_pipeline_mapping
  WHERE ghl_location_id = p_ghl_location_id
    AND (
      (st_job_type_id = p_st_job_type_id AND st_business_unit_id = p_st_business_unit_id)
      OR (st_job_type_id = p_st_job_type_id AND st_business_unit_id IS NULL)
      OR (st_job_type_id IS NULL AND st_business_unit_id = p_st_business_unit_id)
      OR is_default = true
    )
  ORDER BY priority DESC, is_default ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Log GHL sync operation
-- ============================================

CREATE OR REPLACE FUNCTION ghl_log_sync(
  p_sync_type VARCHAR,
  p_direction VARCHAR,
  p_entity_id VARCHAR,
  p_st_id BIGINT,
  p_status VARCHAR,
  p_error_message TEXT DEFAULT NULL,
  p_duration_ms INT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO ghl_sync_log (
    sync_type,
    direction,
    status,
    error_message,
    duration_ms,
    started_at,
    completed_at
  ) VALUES (
    p_sync_type,
    p_direction,
    p_status,
    p_error_message,
    p_duration_ms,
    NOW(),
    CASE WHEN p_status IN ('completed', 'failed') THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: GHL Sync Status Summary
-- ============================================

CREATE OR REPLACE VIEW v_ghl_sync_status AS
SELECT
  'contacts' as entity_type,
  COUNT(*) FILTER (WHERE ghl_id IS NOT NULL) as synced_count,
  COUNT(*) FILTER (WHERE ghl_id IS NULL AND st_customer_id IS NOT NULL) as pending_count,
  COUNT(*) FILTER (WHERE st_sync_error IS NOT NULL) as failed_count,
  MAX(local_synced_at) as last_sync
FROM ghl_contacts
UNION ALL
SELECT
  'opportunities' as entity_type,
  COUNT(*) FILTER (WHERE ghl_id IS NOT NULL) as synced_count,
  COUNT(*) FILTER (WHERE ghl_id IS NULL) as pending_count,
  COUNT(*) FILTER (WHERE st_sync_error IS NOT NULL) as failed_count,
  MAX(local_synced_at) as last_sync
FROM ghl_opportunities;

-- ============================================
-- VIEW: Recent GHL Sync Activity
-- ============================================

CREATE OR REPLACE VIEW v_ghl_recent_activity AS
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
  started_at,
  completed_at
FROM ghl_sync_log
ORDER BY started_at DESC
LIMIT 100;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE ghl_pipeline_mapping IS 'Configures how ST job types map to GHL pipelines and stages';
COMMENT ON TABLE ghl_webhook_events IS 'Incoming webhook events from GoHighLevel for processing';

COMMENT ON FUNCTION ghl_contact_exists IS 'Check if a ST customer is already synced to GHL - prevents duplicates';
COMMENT ON FUNCTION ghl_opportunity_exists IS 'Check if a ST job/estimate is already synced to GHL - prevents duplicates';
COMMENT ON FUNCTION ghl_get_pipeline_for_job IS 'Get the appropriate GHL pipeline/stage for a ST job type';
COMMENT ON FUNCTION ghl_log_sync IS 'Log a GHL sync operation for audit and debugging';

-- ============================================
-- END OF MIGRATION 008
-- ============================================
