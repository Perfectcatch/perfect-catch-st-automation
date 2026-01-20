-- =============================================================================
-- Job Relationships Table
-- Track Sales Job -> Service/Install Job progression for GHL pipeline automation
-- =============================================================================

-- Schema for job workflow tracking
CREATE SCHEMA IF NOT EXISTS workflow;

-- Main job relationships table
CREATE TABLE IF NOT EXISTS workflow.job_relationships (
    id SERIAL PRIMARY KEY,

    -- GHL tracking
    ghl_opportunity_id VARCHAR(100),
    ghl_contact_id VARCHAR(100),
    ghl_pipeline_id VARCHAR(100),

    -- Sales side (original job from Sales BU)
    sales_job_id BIGINT,
    sales_job_number VARCHAR(50),
    sales_job_status VARCHAR(50),
    sales_estimate_id BIGINT,
    sales_estimate_status VARCHAR(50),
    sales_business_unit_id BIGINT,
    sales_business_unit_name VARCHAR(255),

    -- Service/Install side (job from Service/Install BU)
    service_job_id BIGINT,
    service_job_number VARCHAR(50),
    service_job_status VARCHAR(50),
    service_business_unit_id BIGINT,
    service_business_unit_name VARCHAR(255),

    -- Customer linking
    customer_id BIGINT NOT NULL,
    customer_name VARCHAR(255),
    location_id BIGINT,
    location_address TEXT,

    -- Monetary value
    estimate_total NUMERIC(12, 2),
    invoice_total NUMERIC(12, 2),

    -- Current state tracking
    current_ghl_stage_id VARCHAR(100),
    current_ghl_stage_name VARCHAR(100),
    previous_ghl_stage_id VARCHAR(100),

    -- Sync timestamps
    last_st_job_sync_at TIMESTAMPTZ,
    last_st_estimate_sync_at TIMESTAMPTZ,
    last_ghl_sync_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,

    -- Constraints (unique opportunity ID)
    UNIQUE(ghl_opportunity_id)
);

-- Partial unique indexes for job IDs (only enforce uniqueness when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_rel_unique_sales_job
    ON workflow.job_relationships(sales_job_id)
    WHERE sales_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_rel_unique_service_job
    ON workflow.job_relationships(service_job_id)
    WHERE service_job_id IS NOT NULL;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_job_rel_customer
    ON workflow.job_relationships(customer_id);

CREATE INDEX IF NOT EXISTS idx_job_rel_sales_job
    ON workflow.job_relationships(sales_job_id)
    WHERE sales_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_rel_service_job
    ON workflow.job_relationships(service_job_id)
    WHERE service_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_rel_opportunity
    ON workflow.job_relationships(ghl_opportunity_id)
    WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_rel_sales_estimate
    ON workflow.job_relationships(sales_estimate_id)
    WHERE sales_estimate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_rel_pending_sync
    ON workflow.job_relationships(updated_at)
    WHERE ghl_opportunity_id IS NOT NULL
    AND (last_ghl_sync_at IS NULL OR last_ghl_sync_at < updated_at);

CREATE INDEX IF NOT EXISTS idx_job_rel_customer_location
    ON workflow.job_relationships(customer_id, location_id);

-- Stage transition history
CREATE TABLE IF NOT EXISTS workflow.job_stage_history (
    id SERIAL PRIMARY KEY,
    job_relationship_id INTEGER REFERENCES workflow.job_relationships(id) ON DELETE CASCADE,

    -- Stage change
    from_stage_id VARCHAR(100),
    from_stage_name VARCHAR(100),
    to_stage_id VARCHAR(100),
    to_stage_name VARCHAR(100),

    -- Trigger info
    trigger_type VARCHAR(50), -- 'st_job_status', 'st_estimate_status', 'manual', 'auto'
    trigger_job_id BIGINT,
    trigger_job_status VARCHAR(50),
    trigger_estimate_id BIGINT,
    trigger_estimate_status VARCHAR(50),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stage_history_relationship
    ON workflow.job_stage_history(job_relationship_id);

CREATE INDEX IF NOT EXISTS idx_stage_history_created
    ON workflow.job_stage_history(created_at DESC);

-- =============================================================================
-- Sync log for debugging and monitoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS workflow.job_sync_log (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(50) NOT NULL, -- 'stage_update', 'relationship_create', 'relationship_link'
    job_relationship_id INTEGER REFERENCES workflow.job_relationships(id) ON DELETE SET NULL,

    -- Details
    status VARCHAR(20) DEFAULT 'success', -- 'success', 'failed', 'skipped'
    details JSONB,
    error_message TEXT,

    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_operation
    ON workflow.job_sync_log(operation, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_log_status
    ON workflow.job_sync_log(status, created_at DESC);

-- =============================================================================
-- Helper function to update timestamps
-- =============================================================================

CREATE OR REPLACE FUNCTION workflow.update_job_relationship_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_relationships_updated_at
    BEFORE UPDATE ON workflow.job_relationships
    FOR EACH ROW
    EXECUTE FUNCTION workflow.update_job_relationship_timestamp();

-- =============================================================================
-- View for easy querying of current relationships with status
-- =============================================================================

CREATE OR REPLACE VIEW workflow.job_relationships_view AS
SELECT
    jr.id,
    jr.ghl_opportunity_id,
    jr.customer_id,
    jr.customer_name,
    jr.location_address,

    -- Sales job info
    jr.sales_job_id,
    jr.sales_job_number,
    jr.sales_job_status,
    jr.sales_business_unit_name,

    -- Estimate info
    jr.sales_estimate_id,
    jr.sales_estimate_status,
    jr.estimate_total,

    -- Service job info
    jr.service_job_id,
    jr.service_job_number,
    jr.service_job_status,
    jr.service_business_unit_name,
    jr.invoice_total,

    -- GHL stage
    jr.current_ghl_stage_name,

    -- Status summary
    CASE
        WHEN jr.service_job_status = 'Completed' THEN 'Install Complete'
        WHEN jr.service_job_status IN ('Dispatched', 'Working') THEN 'Install In Progress'
        WHEN jr.service_job_id IS NOT NULL THEN 'Install Scheduled'
        WHEN jr.sales_estimate_status = 'Sold' THEN 'Job Sold'
        WHEN jr.sales_estimate_status = 'Dismissed' THEN 'Lost'
        WHEN jr.sales_job_status = 'Completed' THEN 'Proposal Sent'
        WHEN jr.sales_job_status IN ('Scheduled', 'Dispatched', 'Working') THEN 'Appointment Scheduled'
        ELSE 'New Lead'
    END as workflow_status,

    -- Timestamps
    jr.last_ghl_sync_at,
    jr.updated_at,
    jr.created_at

FROM workflow.job_relationships jr
ORDER BY jr.updated_at DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA workflow TO your_app_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA workflow TO your_app_user;

COMMENT ON TABLE workflow.job_relationships IS 'Tracks the progression of opportunities from Sales job through Service/Install job completion';
COMMENT ON TABLE workflow.job_stage_history IS 'Audit log of all GHL stage transitions';
COMMENT ON TABLE workflow.job_sync_log IS 'Debug log for sync operations';
