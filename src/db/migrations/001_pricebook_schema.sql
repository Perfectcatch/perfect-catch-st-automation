-- ============================================
-- Pricebook Sync Engine Database Schema
-- Migration: 001_pricebook_schema.sql
-- Date: 2025-12-06
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE sync_status AS ENUM (
  'synced',
  'pending_sync',
  'sync_failed',
  'conflict',
  'local_only',
  'st_only'
);

CREATE TYPE sync_direction AS ENUM (
  'from_st',
  'to_st',
  'bidirectional'
);

CREATE TYPE conflict_status AS ENUM (
  'unresolved',
  'resolved_keep_st',
  'resolved_keep_local',
  'resolved_merged',
  'ignored'
);

CREATE TYPE conflict_type AS ENUM (
  'both_modified',
  'local_deleted_st_modified',
  'st_deleted_local_modified',
  'field_conflict'
);

CREATE TYPE change_action AS ENUM (
  'create',
  'update',
  'delete',
  'restore'
);

CREATE TYPE change_source AS ENUM (
  'sync_from_st',
  'sync_to_st',
  'api',
  'chat',
  'n8n',
  'manual',
  'system'
);

CREATE TYPE entity_type AS ENUM (
  'category',
  'material',
  'service',
  'equipment'
);

CREATE TYPE sync_job_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'partial',
  'cancelled'
);

-- ============================================
-- TABLE: pricebook_categories
-- Mirrors ServiceTitan Pricebook Categories
-- ============================================

CREATE TABLE pricebook_categories (
  -- Primary Key (local UUID)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100),
  parent_id BIGINT,
  display_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  category_type VARCHAR(50),
  
  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  
  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',
  sync_direction sync_direction,
  sync_error TEXT,
  
  -- Conflict Tracking
  has_conflict BOOLEAN DEFAULT false,
  conflict_data JSONB,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_in_st BOOLEAN DEFAULT false,
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for pricebook_categories
CREATE INDEX idx_categories_st_id ON pricebook_categories(st_id);
CREATE INDEX idx_categories_tenant_id ON pricebook_categories(tenant_id);
CREATE INDEX idx_categories_parent_id ON pricebook_categories(parent_id);
CREATE INDEX idx_categories_name ON pricebook_categories(name);
CREATE INDEX idx_categories_code ON pricebook_categories(code);
CREATE INDEX idx_categories_active ON pricebook_categories(active) WHERE active = true;
CREATE INDEX idx_categories_sync_status ON pricebook_categories(sync_status);
CREATE INDEX idx_categories_has_conflict ON pricebook_categories(has_conflict) WHERE has_conflict = true;
CREATE INDEX idx_categories_deleted ON pricebook_categories(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_categories_st_modified ON pricebook_categories(st_modified_on);
CREATE INDEX idx_categories_name_trgm ON pricebook_categories USING gin(name gin_trgm_ops);

-- ============================================
-- TABLE: pricebook_materials
-- Mirrors ServiceTitan Pricebook Materials
-- ============================================

CREATE TABLE pricebook_materials (
  -- Primary Key (local UUID)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  category_id BIGINT,
  
  -- Basic Info
  code VARCHAR(100) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  display_name VARCHAR(500),
  
  -- Product Details
  manufacturer VARCHAR(255),
  model_number VARCHAR(255),
  upc VARCHAR(50),
  sku VARCHAR(100),
  part_number VARCHAR(100),
  
  -- Pricing
  cost DECIMAL(18, 4),
  price DECIMAL(18, 4),
  member_price DECIMAL(18, 4),
  add_on_price DECIMAL(18, 4),
  hours DECIMAL(10, 4),
  
  -- Units
  unit_of_measure VARCHAR(50),
  quantity_on_hand DECIMAL(18, 4),
  quantity_on_order DECIMAL(18, 4),
  
  -- Warranty & Commission
  warranty_months INT,
  commission_bonus DECIMAL(18, 4),
  pay_type VARCHAR(50),
  
  -- Flags
  active BOOLEAN DEFAULT true,
  taxable BOOLEAN DEFAULT true,
  cross_sell BOOLEAN DEFAULT false,
  account VARCHAR(100),
  
  -- Assets
  primary_vendor_id BIGINT,
  images JSONB DEFAULT '[]'::jsonb,
  assets JSONB DEFAULT '[]'::jsonb,
  
  -- Custom Fields & Tags
  custom_fields JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  external_data JSONB DEFAULT '{}'::jsonb,
  
  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  
  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',
  sync_direction sync_direction,
  sync_error TEXT,
  
  -- Conflict Tracking
  has_conflict BOOLEAN DEFAULT false,
  conflict_data JSONB,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_in_st BOOLEAN DEFAULT false,
  
  -- AI Embedding (for semantic search)
  embedding vector(1536),
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Foreign Key to local category
  category_uuid UUID REFERENCES pricebook_categories(id) ON DELETE SET NULL
);

-- Indexes for pricebook_materials
CREATE INDEX idx_materials_st_id ON pricebook_materials(st_id);
CREATE INDEX idx_materials_tenant_id ON pricebook_materials(tenant_id);
CREATE INDEX idx_materials_category_id ON pricebook_materials(category_id);
CREATE INDEX idx_materials_category_uuid ON pricebook_materials(category_uuid);
CREATE INDEX idx_materials_code ON pricebook_materials(code);
CREATE INDEX idx_materials_name ON pricebook_materials(name);
CREATE INDEX idx_materials_manufacturer ON pricebook_materials(manufacturer);
CREATE INDEX idx_materials_sku ON pricebook_materials(sku);
CREATE INDEX idx_materials_upc ON pricebook_materials(upc);
CREATE INDEX idx_materials_active ON pricebook_materials(active) WHERE active = true;
CREATE INDEX idx_materials_sync_status ON pricebook_materials(sync_status);
CREATE INDEX idx_materials_has_conflict ON pricebook_materials(has_conflict) WHERE has_conflict = true;
CREATE INDEX idx_materials_deleted ON pricebook_materials(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_materials_st_modified ON pricebook_materials(st_modified_on);
CREATE INDEX idx_materials_price ON pricebook_materials(price);
CREATE INDEX idx_materials_name_trgm ON pricebook_materials USING gin(name gin_trgm_ops);
CREATE INDEX idx_materials_description_trgm ON pricebook_materials USING gin(description gin_trgm_ops);

-- Vector similarity index for AI search
CREATE INDEX idx_materials_embedding ON pricebook_materials USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- TABLE: pricebook_services
-- Mirrors ServiceTitan Pricebook Services
-- ============================================

CREATE TABLE pricebook_services (
  -- Primary Key (local UUID)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  category_id BIGINT,
  
  -- Basic Info
  code VARCHAR(100) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  display_name VARCHAR(500),
  
  -- Pricing
  price DECIMAL(18, 4),
  member_price DECIMAL(18, 4),
  add_on_price DECIMAL(18, 4),
  duration_hours DECIMAL(10, 4),
  
  -- Labor
  recommended_hours DECIMAL(10, 4),
  labor_rate DECIMAL(18, 4),
  
  -- Related Items
  materials_included JSONB DEFAULT '[]'::jsonb,
  equipment_included JSONB DEFAULT '[]'::jsonb,
  
  -- Warranty & Commission
  warranty_months INT,
  commission_bonus DECIMAL(18, 4),
  pay_type VARCHAR(50),
  
  -- Flags
  active BOOLEAN DEFAULT true,
  taxable BOOLEAN DEFAULT true,
  account VARCHAR(100),
  
  -- Assets
  images JSONB DEFAULT '[]'::jsonb,
  assets JSONB DEFAULT '[]'::jsonb,
  
  -- Custom Fields & Tags
  custom_fields JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  external_data JSONB DEFAULT '{}'::jsonb,
  
  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  
  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',
  sync_direction sync_direction,
  sync_error TEXT,
  
  -- Conflict Tracking
  has_conflict BOOLEAN DEFAULT false,
  conflict_data JSONB,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_in_st BOOLEAN DEFAULT false,
  
  -- AI Embedding (for semantic search)
  embedding vector(1536),
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Foreign Key to local category
  category_uuid UUID REFERENCES pricebook_categories(id) ON DELETE SET NULL
);

-- Indexes for pricebook_services
CREATE INDEX idx_services_st_id ON pricebook_services(st_id);
CREATE INDEX idx_services_tenant_id ON pricebook_services(tenant_id);
CREATE INDEX idx_services_category_id ON pricebook_services(category_id);
CREATE INDEX idx_services_category_uuid ON pricebook_services(category_uuid);
CREATE INDEX idx_services_code ON pricebook_services(code);
CREATE INDEX idx_services_name ON pricebook_services(name);
CREATE INDEX idx_services_active ON pricebook_services(active) WHERE active = true;
CREATE INDEX idx_services_sync_status ON pricebook_services(sync_status);
CREATE INDEX idx_services_has_conflict ON pricebook_services(has_conflict) WHERE has_conflict = true;
CREATE INDEX idx_services_deleted ON pricebook_services(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_st_modified ON pricebook_services(st_modified_on);
CREATE INDEX idx_services_price ON pricebook_services(price);
CREATE INDEX idx_services_name_trgm ON pricebook_services USING gin(name gin_trgm_ops);

-- Vector similarity index for AI search
CREATE INDEX idx_services_embedding ON pricebook_services USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- TABLE: pricebook_equipment
-- Mirrors ServiceTitan Pricebook Equipment
-- ============================================

CREATE TABLE pricebook_equipment (
  -- Primary Key (local UUID)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  category_id BIGINT,
  
  -- Basic Info
  code VARCHAR(100) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  display_name VARCHAR(500),
  
  -- Product Details
  manufacturer VARCHAR(255),
  model_number VARCHAR(255),
  
  -- Pricing
  cost DECIMAL(18, 4),
  price DECIMAL(18, 4),
  member_price DECIMAL(18, 4),
  add_on_price DECIMAL(18, 4),
  
  -- Labor
  recommended_hours DECIMAL(10, 4),
  
  -- Warranty
  warranty_years INT,
  warranty_months INT,
  
  -- Commission
  commission_bonus DECIMAL(18, 4),
  pay_type VARCHAR(50),
  
  -- Flags
  active BOOLEAN DEFAULT true,
  taxable BOOLEAN DEFAULT true,
  account VARCHAR(100),
  
  -- Assets
  primary_vendor_id BIGINT,
  images JSONB DEFAULT '[]'::jsonb,
  assets JSONB DEFAULT '[]'::jsonb,
  
  -- Custom Fields & Tags
  custom_fields JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  external_data JSONB DEFAULT '{}'::jsonb,
  
  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  
  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',
  sync_direction sync_direction,
  sync_error TEXT,
  
  -- Conflict Tracking
  has_conflict BOOLEAN DEFAULT false,
  conflict_data JSONB,
  
  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_in_st BOOLEAN DEFAULT false,
  
  -- AI Embedding (for semantic search)
  embedding vector(1536),
  
  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Foreign Key to local category
  category_uuid UUID REFERENCES pricebook_categories(id) ON DELETE SET NULL
);

-- Indexes for pricebook_equipment
CREATE INDEX idx_equipment_st_id ON pricebook_equipment(st_id);
CREATE INDEX idx_equipment_tenant_id ON pricebook_equipment(tenant_id);
CREATE INDEX idx_equipment_category_id ON pricebook_equipment(category_id);
CREATE INDEX idx_equipment_category_uuid ON pricebook_equipment(category_uuid);
CREATE INDEX idx_equipment_code ON pricebook_equipment(code);
CREATE INDEX idx_equipment_name ON pricebook_equipment(name);
CREATE INDEX idx_equipment_manufacturer ON pricebook_equipment(manufacturer);
CREATE INDEX idx_equipment_model_number ON pricebook_equipment(model_number);
CREATE INDEX idx_equipment_active ON pricebook_equipment(active) WHERE active = true;
CREATE INDEX idx_equipment_sync_status ON pricebook_equipment(sync_status);
CREATE INDEX idx_equipment_has_conflict ON pricebook_equipment(has_conflict) WHERE has_conflict = true;
CREATE INDEX idx_equipment_deleted ON pricebook_equipment(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_equipment_st_modified ON pricebook_equipment(st_modified_on);
CREATE INDEX idx_equipment_price ON pricebook_equipment(price);
CREATE INDEX idx_equipment_name_trgm ON pricebook_equipment USING gin(name gin_trgm_ops);

-- Vector similarity index for AI search
CREATE INDEX idx_equipment_embedding ON pricebook_equipment USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- TABLE: pricebook_sync_log
-- Tracks all sync operations
-- ============================================

CREATE TABLE pricebook_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Sync Configuration
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'entity_specific'
  direction sync_direction NOT NULL,
  entity_types entity_type[] DEFAULT ARRAY['category', 'material', 'service', 'equipment']::entity_type[],
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INT,
  
  -- Statistics
  records_fetched INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_deleted INT DEFAULT 0,
  records_skipped INT DEFAULT 0,
  conflicts_detected INT DEFAULT 0,
  errors_encountered INT DEFAULT 0,
  
  -- Status
  status sync_job_status DEFAULT 'pending',
  error_message TEXT,
  error_stack TEXT,
  
  -- Metadata
  triggered_by change_source NOT NULL,
  triggered_by_user VARCHAR(255),
  config JSONB DEFAULT '{}'::jsonb,
  
  -- Detailed Results
  results JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pricebook_sync_log
CREATE INDEX idx_sync_log_status ON pricebook_sync_log(status);
CREATE INDEX idx_sync_log_started_at ON pricebook_sync_log(started_at DESC);
CREATE INDEX idx_sync_log_sync_type ON pricebook_sync_log(sync_type);
CREATE INDEX idx_sync_log_direction ON pricebook_sync_log(direction);

-- ============================================
-- TABLE: pricebook_sync_conflicts
-- Tracks sync conflicts for resolution
-- ============================================

CREATE TABLE pricebook_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Entity Reference
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  st_id BIGINT NOT NULL,
  
  -- Conflict Details
  conflict_type conflict_type NOT NULL,
  
  -- Data Snapshots
  st_data JSONB NOT NULL,
  local_data JSONB NOT NULL,
  diff JSONB, -- Field-level differences
  
  -- Resolution
  status conflict_status DEFAULT 'unresolved',
  resolution_strategy VARCHAR(50),
  resolved_data JSONB,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(255),
  resolution_notes TEXT,
  
  -- Sync Reference
  sync_log_id UUID REFERENCES pricebook_sync_log(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pricebook_sync_conflicts
CREATE INDEX idx_conflicts_entity_type ON pricebook_sync_conflicts(entity_type);
CREATE INDEX idx_conflicts_entity_id ON pricebook_sync_conflicts(entity_id);
CREATE INDEX idx_conflicts_st_id ON pricebook_sync_conflicts(st_id);
CREATE INDEX idx_conflicts_status ON pricebook_sync_conflicts(status);
CREATE INDEX idx_conflicts_unresolved ON pricebook_sync_conflicts(status) WHERE status = 'unresolved';
CREATE INDEX idx_conflicts_created_at ON pricebook_sync_conflicts(created_at DESC);
CREATE INDEX idx_conflicts_sync_log ON pricebook_sync_conflicts(sync_log_id);

-- ============================================
-- TABLE: pricebook_changes
-- Audit log for all pricebook changes
-- ============================================

CREATE TABLE pricebook_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Entity Reference
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  st_id BIGINT,
  
  -- Change Details
  action change_action NOT NULL,
  source change_source NOT NULL,
  
  -- Data
  changed_fields JSONB, -- Only the fields that changed
  old_values JSONB, -- Previous values of changed fields
  new_values JSONB, -- New values of changed fields
  full_snapshot JSONB, -- Complete entity state after change
  
  -- User/Context
  user_id VARCHAR(255),
  user_name VARCHAR(255),
  session_id VARCHAR(255),
  request_id VARCHAR(255),
  
  -- Sync Reference
  sync_log_id UUID REFERENCES pricebook_sync_log(id) ON DELETE SET NULL,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pricebook_changes
CREATE INDEX idx_changes_entity_type ON pricebook_changes(entity_type);
CREATE INDEX idx_changes_entity_id ON pricebook_changes(entity_id);
CREATE INDEX idx_changes_st_id ON pricebook_changes(st_id);
CREATE INDEX idx_changes_action ON pricebook_changes(action);
CREATE INDEX idx_changes_source ON pricebook_changes(source);
CREATE INDEX idx_changes_created_at ON pricebook_changes(created_at DESC);
CREATE INDEX idx_changes_user_id ON pricebook_changes(user_id);
CREATE INDEX idx_changes_sync_log ON pricebook_changes(sync_log_id);

-- ============================================
-- TABLE: pricebook_webhook_subscriptions
-- n8n webhook subscriptions
-- ============================================

CREATE TABLE pricebook_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Webhook Configuration
  webhook_url TEXT NOT NULL,
  events TEXT[] NOT NULL, -- Array of event types to subscribe to
  
  -- Authentication
  secret_key VARCHAR(255),
  headers JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INT,
  last_error TEXT,
  failure_count INT DEFAULT 0,
  
  -- Metadata
  name VARCHAR(255),
  description TEXT,
  created_by VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for webhook subscriptions
CREATE INDEX idx_webhooks_active ON pricebook_webhook_subscriptions(active) WHERE active = true;
CREATE INDEX idx_webhooks_events ON pricebook_webhook_subscriptions USING gin(events);

-- ============================================
-- TABLE: chat_sessions
-- Stores chat conversation sessions
-- ============================================

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) UNIQUE NOT NULL,
  
  -- Context
  last_category_id UUID REFERENCES pricebook_categories(id) ON DELETE SET NULL,
  last_category_st_id BIGINT,
  last_category_name VARCHAR(255),
  
  -- Pending Action
  pending_action JSONB,
  
  -- History (last N messages)
  history JSONB DEFAULT '[]'::jsonb,
  
  -- User Info
  user_id VARCHAR(255),
  user_name VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes for chat_sessions
CREATE INDEX idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_expires ON chat_sessions(expires_at);

-- ============================================
-- FUNCTIONS: Audit Trigger
-- ============================================

CREATE OR REPLACE FUNCTION track_pricebook_change()
RETURNS TRIGGER AS $$
DECLARE
  v_entity_type entity_type;
  v_action change_action;
  v_changed_fields JSONB;
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  -- Determine entity type from table name
  v_entity_type := CASE TG_TABLE_NAME
    WHEN 'pricebook_categories' THEN 'category'::entity_type
    WHEN 'pricebook_materials' THEN 'material'::entity_type
    WHEN 'pricebook_services' THEN 'service'::entity_type
    WHEN 'pricebook_equipment' THEN 'equipment'::entity_type
  END;
  
  -- Determine action
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'create'::change_action
    WHEN 'UPDATE' THEN 'update'::change_action
    WHEN 'DELETE' THEN 'delete'::change_action
  END;
  
  -- Calculate changed fields for updates
  IF TG_OP = 'UPDATE' THEN
    SELECT 
      jsonb_object_agg(key, value) FILTER (WHERE value IS DISTINCT FROM (OLD_row->>key)),
      jsonb_object_agg(key, OLD_row->key) FILTER (WHERE value IS DISTINCT FROM (OLD_row->>key)),
      jsonb_object_agg(key, value) FILTER (WHERE value IS DISTINCT FROM (OLD_row->>key))
    INTO v_changed_fields, v_old_values, v_new_values
    FROM jsonb_each_text(to_jsonb(NEW)) AS t(key, value),
         LATERAL (SELECT to_jsonb(OLD) AS OLD_row) AS old_data;
  END IF;
  
  -- Insert audit record
  INSERT INTO pricebook_changes (
    entity_type,
    entity_id,
    st_id,
    action,
    source,
    changed_fields,
    old_values,
    new_values,
    full_snapshot
  ) VALUES (
    v_entity_type,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP WHEN 'DELETE' THEN OLD.st_id ELSE NEW.st_id END,
    v_action,
    COALESCE(current_setting('app.change_source', true), 'system')::change_source,
    v_changed_fields,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    CASE TG_OP WHEN 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
  );
  
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS: Apply audit triggers to all tables
-- ============================================

CREATE TRIGGER trg_categories_audit
  AFTER INSERT OR UPDATE OR DELETE ON pricebook_categories
  FOR EACH ROW EXECUTE FUNCTION track_pricebook_change();

CREATE TRIGGER trg_materials_audit
  AFTER INSERT OR UPDATE OR DELETE ON pricebook_materials
  FOR EACH ROW EXECUTE FUNCTION track_pricebook_change();

CREATE TRIGGER trg_services_audit
  AFTER INSERT OR UPDATE OR DELETE ON pricebook_services
  FOR EACH ROW EXECUTE FUNCTION track_pricebook_change();

CREATE TRIGGER trg_equipment_audit
  AFTER INSERT OR UPDATE OR DELETE ON pricebook_equipment
  FOR EACH ROW EXECUTE FUNCTION track_pricebook_change();

-- ============================================
-- FUNCTIONS: Update local_modified_at
-- ============================================

CREATE OR REPLACE FUNCTION update_local_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.local_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all pricebook tables
CREATE TRIGGER trg_categories_modified
  BEFORE UPDATE ON pricebook_categories
  FOR EACH ROW EXECUTE FUNCTION update_local_modified_at();

CREATE TRIGGER trg_materials_modified
  BEFORE UPDATE ON pricebook_materials
  FOR EACH ROW EXECUTE FUNCTION update_local_modified_at();

CREATE TRIGGER trg_services_modified
  BEFORE UPDATE ON pricebook_services
  FOR EACH ROW EXECUTE FUNCTION update_local_modified_at();

CREATE TRIGGER trg_equipment_modified
  BEFORE UPDATE ON pricebook_equipment
  FOR EACH ROW EXECUTE FUNCTION update_local_modified_at();

-- ============================================
-- FUNCTIONS: Utility Functions
-- ============================================

-- Function to get sync statistics
CREATE OR REPLACE FUNCTION get_sync_stats()
RETURNS TABLE (
  entity_type TEXT,
  total_count BIGINT,
  synced_count BIGINT,
  pending_count BIGINT,
  conflict_count BIGINT,
  deleted_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'categories'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'pending_sync')::BIGINT,
    COUNT(*) FILTER (WHERE has_conflict = true)::BIGINT,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::BIGINT
  FROM pricebook_categories
  UNION ALL
  SELECT 'materials'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'pending_sync')::BIGINT,
    COUNT(*) FILTER (WHERE has_conflict = true)::BIGINT,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::BIGINT
  FROM pricebook_materials
  UNION ALL
  SELECT 'services'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'pending_sync')::BIGINT,
    COUNT(*) FILTER (WHERE has_conflict = true)::BIGINT,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::BIGINT
  FROM pricebook_services
  UNION ALL
  SELECT 'equipment'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'pending_sync')::BIGINT,
    COUNT(*) FILTER (WHERE has_conflict = true)::BIGINT,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::BIGINT
  FROM pricebook_equipment;
END;
$$ LANGUAGE plpgsql;

-- Function to search materials by embedding similarity
CREATE OR REPLACE FUNCTION search_materials_by_embedding(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  st_id BIGINT,
  name VARCHAR(500),
  code VARCHAR(100),
  price DECIMAL(18, 4),
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.st_id,
    m.name,
    m.code,
    m.price,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM pricebook_materials m
  WHERE m.embedding IS NOT NULL
    AND m.active = true
    AND m.deleted_at IS NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS: Useful views for querying
-- ============================================

-- View: Active materials with category info
CREATE OR REPLACE VIEW v_active_materials AS
SELECT 
  m.*,
  c.name AS category_name,
  c.code AS category_code
FROM pricebook_materials m
LEFT JOIN pricebook_categories c ON m.category_uuid = c.id
WHERE m.active = true AND m.deleted_at IS NULL;

-- View: Active services with category info
CREATE OR REPLACE VIEW v_active_services AS
SELECT 
  s.*,
  c.name AS category_name,
  c.code AS category_code
FROM pricebook_services s
LEFT JOIN pricebook_categories c ON s.category_uuid = c.id
WHERE s.active = true AND s.deleted_at IS NULL;

-- View: Active equipment with category info
CREATE OR REPLACE VIEW v_active_equipment AS
SELECT 
  e.*,
  c.name AS category_name,
  c.code AS category_code
FROM pricebook_equipment e
LEFT JOIN pricebook_categories c ON e.category_uuid = c.id
WHERE e.active = true AND e.deleted_at IS NULL;

-- View: Unresolved conflicts
CREATE OR REPLACE VIEW v_unresolved_conflicts AS
SELECT 
  c.*,
  CASE c.entity_type
    WHEN 'category' THEN (SELECT name FROM pricebook_categories WHERE id = c.entity_id)
    WHEN 'material' THEN (SELECT name FROM pricebook_materials WHERE id = c.entity_id)
    WHEN 'service' THEN (SELECT name FROM pricebook_services WHERE id = c.entity_id)
    WHEN 'equipment' THEN (SELECT name FROM pricebook_equipment WHERE id = c.entity_id)
  END AS entity_name
FROM pricebook_sync_conflicts c
WHERE c.status = 'unresolved'
ORDER BY c.created_at DESC;

-- View: Recent sync activity
CREATE OR REPLACE VIEW v_recent_syncs AS
SELECT 
  id,
  sync_type,
  direction,
  status,
  started_at,
  completed_at,
  duration_seconds,
  records_fetched,
  records_created,
  records_updated,
  records_deleted,
  conflicts_detected,
  errors_encountered,
  triggered_by
FROM pricebook_sync_log
ORDER BY started_at DESC
LIMIT 100;

-- ============================================
-- GRANTS: Set up permissions (adjust as needed)
-- ============================================

-- Grant usage on schema
-- GRANT USAGE ON SCHEMA public TO pricebook_app;

-- Grant permissions on tables
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pricebook_app;

-- Grant usage on sequences
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pricebook_app;

-- ============================================
-- COMMENTS: Document the schema
-- ============================================

COMMENT ON TABLE pricebook_categories IS 'ServiceTitan pricebook categories with sync metadata';
COMMENT ON TABLE pricebook_materials IS 'ServiceTitan pricebook materials with sync metadata and AI embeddings';
COMMENT ON TABLE pricebook_services IS 'ServiceTitan pricebook services with sync metadata and AI embeddings';
COMMENT ON TABLE pricebook_equipment IS 'ServiceTitan pricebook equipment with sync metadata and AI embeddings';
COMMENT ON TABLE pricebook_sync_log IS 'Audit log of all sync operations';
COMMENT ON TABLE pricebook_sync_conflicts IS 'Tracks sync conflicts for manual resolution';
COMMENT ON TABLE pricebook_changes IS 'Complete audit trail of all pricebook changes';
COMMENT ON TABLE pricebook_webhook_subscriptions IS 'n8n webhook subscriptions for event notifications';
COMMENT ON TABLE chat_sessions IS 'Conversational AI session storage';

COMMENT ON FUNCTION track_pricebook_change() IS 'Audit trigger function for tracking all pricebook changes';
COMMENT ON FUNCTION get_sync_stats() IS 'Returns sync statistics for all entity types';
COMMENT ON FUNCTION search_materials_by_embedding(vector, FLOAT, INT) IS 'Semantic search for materials using vector embeddings';
