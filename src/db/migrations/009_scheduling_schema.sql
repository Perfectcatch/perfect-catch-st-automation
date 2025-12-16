-- ============================================
-- Scheduling Module Database Schema
-- Migration: 009_scheduling_schema.sql
-- Date: 2025-12-16
--
-- Hybrid Architecture for Jobs/Appointments:
-- - Reference data: Synced from ServiceTitan (technicians, zones, teams)
-- - Intelligence data: Local-only (skills, travel times, rules)
-- - Cache tables: Short TTL for real-time data
-- - Jobs/Appointments: NOT stored - always real-time API calls
-- ============================================

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
  CREATE TYPE scheduling_entity_type AS ENUM (
    'technician',
    'team',
    'zone',
    'business_hours',
    'arrival_window',
    'job_type',
    'tag'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE skill_level AS ENUM (
    'basic',
    'intermediate',
    'advanced',
    'expert'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE scheduling_rule_type AS ENUM (
    'constraint',      -- Hard rule - must be satisfied
    'preference',      -- Soft rule - try to satisfy
    'optimization'     -- Score improvement
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE scheduling_action_type AS ENUM (
    'book',
    'reschedule',
    'cancel',
    'recommend',
    'availability_query',
    'smart_match'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- REFERENCE DATA TABLES (Synced from ServiceTitan)
-- ============================================

-- Technicians (sync from ST Settings/Dispatch API)
CREATE TABLE IF NOT EXISTS scheduling_technicians (
  -- Primary Key (local UUID)
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,

  -- Basic Info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),

  -- Organization
  team_id BIGINT,
  team_name VARCHAR(255),
  zone_ids BIGINT[] DEFAULT '{}',

  -- Work Info
  role VARCHAR(100),
  employee_type VARCHAR(50),
  hourly_rate DECIMAL(10, 2),

  -- Status
  active BOOLEAN DEFAULT true,

  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,

  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',
  sync_error TEXT,

  -- Soft Delete
  deleted_at TIMESTAMPTZ,
  deleted_in_st BOOLEAN DEFAULT false,

  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for scheduling_technicians
CREATE INDEX IF NOT EXISTS idx_sched_tech_st_id ON scheduling_technicians(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_tech_tenant_id ON scheduling_technicians(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_tech_team_id ON scheduling_technicians(team_id);
CREATE INDEX IF NOT EXISTS idx_sched_tech_active ON scheduling_technicians(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_sched_tech_name_trgm ON scheduling_technicians USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sched_tech_zone_ids ON scheduling_technicians USING gin(zone_ids);
CREATE INDEX IF NOT EXISTS idx_sched_tech_sync_status ON scheduling_technicians(sync_status);
CREATE INDEX IF NOT EXISTS idx_sched_tech_deleted ON scheduling_technicians(deleted_at) WHERE deleted_at IS NULL;

-- Teams (sync from ST Dispatch API)
CREATE TABLE IF NOT EXISTS scheduling_teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,

  -- Status
  active BOOLEAN DEFAULT true,

  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,

  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',

  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sched_teams_st_id ON scheduling_teams(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_teams_tenant_id ON scheduling_teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_teams_active ON scheduling_teams(active) WHERE active = true;

-- Zones (sync from ST Dispatch API)
CREATE TABLE IF NOT EXISTS scheduling_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Geo data for proximity calculations (can be populated later)
  center_lat DECIMAL(10, 8),
  center_lng DECIMAL(11, 8),

  -- ServiceTitan Timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,

  -- Local Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW(),

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',

  -- Additional Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sched_zones_st_id ON scheduling_zones(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_zones_tenant_id ON scheduling_zones(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sched_zones_active ON scheduling_zones(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_sched_zones_name_trgm ON scheduling_zones USING gin(name gin_trgm_ops);

-- Business Hours (sync from ST Dispatch API)
CREATE TABLE IF NOT EXISTS scheduling_business_hours (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,

  -- Schedule
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',

  -- Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_hours_st_id ON scheduling_business_hours(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_hours_day ON scheduling_business_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_sched_hours_active ON scheduling_business_hours(active) WHERE active = true;

-- Arrival Windows (sync from ST Dispatch API)
CREATE TABLE IF NOT EXISTS scheduling_arrival_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,

  -- Window
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',

  -- Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_windows_st_id ON scheduling_arrival_windows(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_windows_active ON scheduling_arrival_windows(active) WHERE active = true;

-- Job Types / Tag Types (sync from ST Settings API)
CREATE TABLE IF NOT EXISTS scheduling_job_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ServiceTitan Fields
  st_id BIGINT UNIQUE NOT NULL,
  tenant_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,

  -- Classification
  category VARCHAR(100),

  -- Status
  active BOOLEAN DEFAULT true,

  -- Sync Metadata
  last_synced_at TIMESTAMPTZ,
  sync_status sync_status DEFAULT 'synced',

  -- Timestamps
  local_created_at TIMESTAMPTZ DEFAULT NOW(),
  local_modified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_job_types_st_id ON scheduling_job_types(st_id);
CREATE INDEX IF NOT EXISTS idx_sched_job_types_name_trgm ON scheduling_job_types USING gin(name gin_trgm_ops);

-- ============================================
-- INTELLIGENCE TABLES (Local-Only)
-- These enhance scheduling with business logic
-- ============================================

-- Technician Skills (local enhancement)
CREATE TABLE IF NOT EXISTS scheduling_technician_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- References
  technician_id UUID NOT NULL REFERENCES scheduling_technicians(id) ON DELETE CASCADE,
  technician_st_id BIGINT NOT NULL,

  -- Skill Info
  skill_name VARCHAR(100) NOT NULL,
  skill_level skill_level DEFAULT 'basic',

  -- Certification
  certified BOOLEAN DEFAULT false,
  certification_name VARCHAR(255),
  certification_expires DATE,
  certification_number VARCHAR(100),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(technician_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_tech_skills_tech_id ON scheduling_technician_skills(technician_id);
CREATE INDEX IF NOT EXISTS idx_tech_skills_skill_name ON scheduling_technician_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_tech_skills_certified ON scheduling_technician_skills(certified) WHERE certified = true;
CREATE INDEX IF NOT EXISTS idx_tech_skills_expires ON scheduling_technician_skills(certification_expires)
  WHERE certification_expires IS NOT NULL;

-- Job Type Profiles (local intelligence)
CREATE TABLE IF NOT EXISTS scheduling_job_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Reference to ST job type (optional)
  job_type_id UUID REFERENCES scheduling_job_types(id) ON DELETE SET NULL,
  job_type_st_id BIGINT,

  -- Profile Name (can be custom)
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,

  -- Duration Intelligence (in minutes)
  avg_duration_minutes INT NOT NULL DEFAULT 60,
  min_duration_minutes INT DEFAULT 30,
  max_duration_minutes INT DEFAULT 180,

  -- Skill Requirements (array of skill names)
  required_skills TEXT[] DEFAULT '{}',
  preferred_skills TEXT[] DEFAULT '{}',

  -- Scheduling Constraints
  requires_equipment BOOLEAN DEFAULT false,
  requires_permit BOOLEAN DEFAULT false,
  requires_two_techs BOOLEAN DEFAULT false,
  can_overlap BOOLEAN DEFAULT false,

  -- Pricing (for estimates)
  base_price DECIMAL(10, 2),

  -- Status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_profiles_name_trgm ON scheduling_job_profiles USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_profiles_skills ON scheduling_job_profiles USING gin(required_skills);
CREATE INDEX IF NOT EXISTS idx_job_profiles_active ON scheduling_job_profiles(active) WHERE active = true;

-- Zone Travel Times (local intelligence)
CREATE TABLE IF NOT EXISTS scheduling_zone_travel_times (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Zone References
  from_zone_id UUID REFERENCES scheduling_zones(id) ON DELETE CASCADE,
  from_zone_st_id BIGINT NOT NULL,
  to_zone_id UUID REFERENCES scheduling_zones(id) ON DELETE CASCADE,
  to_zone_st_id BIGINT NOT NULL,

  -- Travel Estimates (in minutes)
  avg_travel_minutes INT NOT NULL,
  min_travel_minutes INT,
  max_travel_minutes INT,

  -- Rush hour adjustments
  rush_hour_multiplier DECIMAL(3, 2) DEFAULT 1.5,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(from_zone_st_id, to_zone_st_id)
);

CREATE INDEX IF NOT EXISTS idx_travel_from_zone ON scheduling_zone_travel_times(from_zone_st_id);
CREATE INDEX IF NOT EXISTS idx_travel_to_zone ON scheduling_zone_travel_times(to_zone_st_id);

-- Scheduling Rules (local business logic)
CREATE TABLE IF NOT EXISTS scheduling_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Rule Identity
  rule_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  rule_type scheduling_rule_type NOT NULL DEFAULT 'preference',

  -- Rule Definition (JSON)
  conditions JSONB NOT NULL DEFAULT '{}',  -- When to apply this rule
  actions JSONB NOT NULL DEFAULT '{}',      -- What to do

  -- Priority (higher = more important)
  priority INT DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),

  -- Status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_rules_type ON scheduling_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_sched_rules_active ON scheduling_rules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_sched_rules_priority ON scheduling_rules(priority DESC);

-- ============================================
-- CACHE TABLES (Short TTL)
-- For caching real-time data from ServiceTitan
-- ============================================

-- Capacity Cache (15-min TTL)
CREATE TABLE IF NOT EXISTS scheduling_capacity_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Cache Key
  cache_date DATE NOT NULL,
  zone_st_id BIGINT, -- NULL means all zones
  team_st_id BIGINT, -- NULL means all teams

  -- Cached Data
  data JSONB NOT NULL,

  -- Cache Management
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Constraints
  UNIQUE(cache_date, zone_st_id, team_st_id),
  CONSTRAINT valid_cache_ttl CHECK (expires_at > cached_at)
);

CREATE INDEX IF NOT EXISTS idx_capacity_cache_expires ON scheduling_capacity_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_capacity_cache_date ON scheduling_capacity_cache(cache_date);
CREATE INDEX IF NOT EXISTS idx_capacity_cache_zone ON scheduling_capacity_cache(zone_st_id);

-- Technician Availability Cache (15-min TTL)
CREATE TABLE IF NOT EXISTS scheduling_availability_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Cache Key
  technician_st_id BIGINT NOT NULL,
  cache_date DATE NOT NULL,

  -- Cached Data
  data JSONB NOT NULL, -- { slots: [], booked: [], etc. }

  -- Cache Management
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  UNIQUE(technician_st_id, cache_date)
);

CREATE INDEX IF NOT EXISTS idx_avail_cache_expires ON scheduling_availability_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_avail_cache_tech ON scheduling_availability_cache(technician_st_id);
CREATE INDEX IF NOT EXISTS idx_avail_cache_date ON scheduling_availability_cache(cache_date);

-- ============================================
-- AUDIT & LOGGING TABLES
-- ============================================

-- Scheduling Sync Log
CREATE TABLE IF NOT EXISTS scheduling_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Sync Configuration
  sync_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'entity_specific'
  direction sync_direction NOT NULL DEFAULT 'from_st',
  entity_types scheduling_entity_type[] DEFAULT '{}',

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
  errors_encountered INT DEFAULT 0,

  -- Status
  status sync_job_status DEFAULT 'pending',
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  triggered_by change_source NOT NULL DEFAULT 'system',
  triggered_by_user VARCHAR(255),

  -- Detailed Results
  results JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_sync_log_status ON scheduling_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sched_sync_log_started ON scheduling_sync_log(started_at DESC);

-- Scheduling Audit Log (tracks all scheduling operations)
CREATE TABLE IF NOT EXISTS scheduling_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What was done
  action scheduling_action_type NOT NULL,

  -- Entity References (from ServiceTitan)
  job_st_id BIGINT,
  appointment_st_id BIGINT,
  customer_st_id BIGINT,
  technician_st_id BIGINT,

  -- Context
  user_id VARCHAR(255),
  source change_source NOT NULL DEFAULT 'api',

  -- Request/Response
  request_data JSONB,
  response_data JSONB,

  -- Smart Scheduling
  recommendations JSONB, -- If smart scheduling was used
  selected_recommendation INT, -- Which one was picked

  -- Performance
  duration_ms INT,
  api_calls_made INT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_audit_action ON scheduling_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_sched_audit_job ON scheduling_audit_log(job_st_id);
CREATE INDEX IF NOT EXISTS idx_sched_audit_customer ON scheduling_audit_log(customer_st_id);
CREATE INDEX IF NOT EXISTS idx_sched_audit_created ON scheduling_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_audit_source ON scheduling_audit_log(source);

-- ============================================
-- FUNCTIONS: Utilities
-- ============================================

-- Function to cleanup expired cache
CREATE OR REPLACE FUNCTION cleanup_scheduling_cache()
RETURNS TABLE (
  table_name TEXT,
  rows_deleted BIGINT
) AS $$
DECLARE
  v_capacity_deleted BIGINT;
  v_availability_deleted BIGINT;
BEGIN
  DELETE FROM scheduling_capacity_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS v_capacity_deleted = ROW_COUNT;

  DELETE FROM scheduling_availability_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS v_availability_deleted = ROW_COUNT;

  RETURN QUERY SELECT 'scheduling_capacity_cache'::TEXT, v_capacity_deleted
  UNION ALL
  SELECT 'scheduling_availability_cache'::TEXT, v_availability_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to get technician with skills
CREATE OR REPLACE FUNCTION get_technician_with_skills(p_technician_st_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'technician', to_jsonb(t.*),
    'skills', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s.*))
       FROM scheduling_technician_skills s
       WHERE s.technician_id = t.id),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM scheduling_technicians t
  WHERE t.st_id = p_technician_st_id
    AND t.deleted_at IS NULL;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to find techs with required skills
CREATE OR REPLACE FUNCTION find_technicians_by_skills(
  p_required_skills TEXT[],
  p_zone_st_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  technician_id UUID,
  technician_st_id BIGINT,
  technician_name VARCHAR,
  matching_skills INT,
  total_required INT,
  skill_match_percent DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.st_id,
    t.name,
    COUNT(DISTINCT s.skill_name)::INT as matching_skills,
    array_length(p_required_skills, 1)::INT as total_required,
    (COUNT(DISTINCT s.skill_name)::DECIMAL / array_length(p_required_skills, 1) * 100) as skill_match_percent
  FROM scheduling_technicians t
  LEFT JOIN scheduling_technician_skills s
    ON s.technician_id = t.id
    AND s.skill_name = ANY(p_required_skills)
  WHERE t.active = true
    AND t.deleted_at IS NULL
    AND (p_zone_st_id IS NULL OR p_zone_st_id = ANY(t.zone_ids))
  GROUP BY t.id, t.st_id, t.name
  HAVING COUNT(DISTINCT s.skill_name) > 0
  ORDER BY matching_skills DESC, t.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get scheduling stats
CREATE OR REPLACE FUNCTION get_scheduling_stats()
RETURNS TABLE (
  entity_type TEXT,
  total_count BIGINT,
  active_count BIGINT,
  synced_count BIGINT,
  last_synced TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'technicians'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE active = true AND deleted_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    MAX(last_synced_at)
  FROM scheduling_technicians
  UNION ALL
  SELECT 'teams'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE active = true)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    MAX(last_synced_at)
  FROM scheduling_teams
  UNION ALL
  SELECT 'zones'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE active = true)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    MAX(last_synced_at)
  FROM scheduling_zones
  UNION ALL
  SELECT 'job_types'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE active = true)::BIGINT,
    COUNT(*) FILTER (WHERE sync_status = 'synced')::BIGINT,
    MAX(last_synced_at)
  FROM scheduling_job_types
  UNION ALL
  SELECT 'job_profiles'::TEXT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE active = true)::BIGINT,
    NULL::BIGINT, -- Not synced
    NULL::TIMESTAMPTZ
  FROM scheduling_job_profiles
  UNION ALL
  SELECT 'technician_skills'::TEXT,
    COUNT(*)::BIGINT,
    NULL::BIGINT,
    NULL::BIGINT,
    NULL::TIMESTAMPTZ
  FROM scheduling_technician_skills;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS: Auto-update timestamps
-- ============================================

-- Reuse existing function if available, or create
CREATE OR REPLACE FUNCTION update_scheduling_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.local_modified_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_scheduling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trg_sched_tech_modified ON scheduling_technicians;
CREATE TRIGGER trg_sched_tech_modified
  BEFORE UPDATE ON scheduling_technicians
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_modified_at();

DROP TRIGGER IF EXISTS trg_sched_teams_modified ON scheduling_teams;
CREATE TRIGGER trg_sched_teams_modified
  BEFORE UPDATE ON scheduling_teams
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_modified_at();

DROP TRIGGER IF EXISTS trg_sched_zones_modified ON scheduling_zones;
CREATE TRIGGER trg_sched_zones_modified
  BEFORE UPDATE ON scheduling_zones
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_modified_at();

DROP TRIGGER IF EXISTS trg_sched_skills_updated ON scheduling_technician_skills;
CREATE TRIGGER trg_sched_skills_updated
  BEFORE UPDATE ON scheduling_technician_skills
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();

DROP TRIGGER IF EXISTS trg_sched_profiles_updated ON scheduling_job_profiles;
CREATE TRIGGER trg_sched_profiles_updated
  BEFORE UPDATE ON scheduling_job_profiles
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();

DROP TRIGGER IF EXISTS trg_sched_rules_updated ON scheduling_rules;
CREATE TRIGGER trg_sched_rules_updated
  BEFORE UPDATE ON scheduling_rules
  FOR EACH ROW EXECUTE FUNCTION update_scheduling_updated_at();

-- ============================================
-- VIEWS: Useful views for querying
-- ============================================

-- View: Active technicians with team/zone info
CREATE OR REPLACE VIEW v_scheduling_technicians AS
SELECT
  t.*,
  tm.name AS team_name_resolved,
  (
    SELECT array_agg(z.name ORDER BY z.name)
    FROM scheduling_zones z
    WHERE z.st_id = ANY(t.zone_ids)
  ) AS zone_names
FROM scheduling_technicians t
LEFT JOIN scheduling_teams tm ON tm.st_id = t.team_id
WHERE t.active = true AND t.deleted_at IS NULL;

-- View: Technicians with skills summary
CREATE OR REPLACE VIEW v_technicians_skills AS
SELECT
  t.id,
  t.st_id,
  t.name,
  t.team_name,
  t.active,
  COUNT(s.id) AS total_skills,
  COUNT(s.id) FILTER (WHERE s.certified = true) AS certified_skills,
  array_agg(DISTINCT s.skill_name) FILTER (WHERE s.skill_name IS NOT NULL) AS skills
FROM scheduling_technicians t
LEFT JOIN scheduling_technician_skills s ON s.technician_id = t.id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.st_id, t.name, t.team_name, t.active;

-- View: Recent scheduling activity
CREATE OR REPLACE VIEW v_scheduling_activity AS
SELECT
  id,
  action,
  job_st_id,
  customer_st_id,
  technician_st_id,
  source,
  duration_ms,
  created_at
FROM scheduling_audit_log
ORDER BY created_at DESC
LIMIT 100;

-- ============================================
-- SEED DATA: Default scheduling rules
-- ============================================

INSERT INTO scheduling_rules (rule_name, description, rule_type, conditions, actions, priority, active)
VALUES
  (
    'skill_match_required',
    'Technician must have all required skills for the job type',
    'constraint',
    '{"check": "required_skills", "operator": "all_present"}',
    '{"reject": true, "message": "Technician missing required skills"}',
    100,
    true
  ),
  (
    'zone_preference',
    'Prefer technicians assigned to the job zone',
    'preference',
    '{"check": "zone_assignment"}',
    '{"score_boost": 20}',
    70,
    true
  ),
  (
    'minimize_travel',
    'Optimize for minimal travel time between jobs',
    'optimization',
    '{"check": "travel_time"}',
    '{"score_formula": "100 - (travel_minutes / 2)"}',
    60,
    true
  ),
  (
    'certification_valid',
    'Certification must not be expired for certified-required jobs',
    'constraint',
    '{"check": "certification_expiry", "compare": "today"}',
    '{"reject": true, "message": "Certification expired"}',
    95,
    true
  ),
  (
    'workload_balance',
    'Balance jobs across available technicians',
    'optimization',
    '{"check": "daily_job_count"}',
    '{"score_formula": "max(0, 50 - (jobs_today * 10))"}',
    40,
    true
  )
ON CONFLICT (rule_name) DO NOTHING;

-- ============================================
-- COMMENTS: Document the schema
-- ============================================

COMMENT ON TABLE scheduling_technicians IS 'ServiceTitan technicians synced for scheduling intelligence';
COMMENT ON TABLE scheduling_teams IS 'ServiceTitan teams synced for scheduling';
COMMENT ON TABLE scheduling_zones IS 'ServiceTitan zones synced for scheduling and travel calculations';
COMMENT ON TABLE scheduling_business_hours IS 'Business operating hours from ServiceTitan';
COMMENT ON TABLE scheduling_arrival_windows IS 'Appointment arrival windows from ServiceTitan';
COMMENT ON TABLE scheduling_job_types IS 'Job/service types from ServiceTitan';

COMMENT ON TABLE scheduling_technician_skills IS 'Local skill assignments for technicians (not synced)';
COMMENT ON TABLE scheduling_job_profiles IS 'Local job profiles with duration/skill requirements';
COMMENT ON TABLE scheduling_zone_travel_times IS 'Local travel time estimates between zones';
COMMENT ON TABLE scheduling_rules IS 'Local scheduling business rules engine';

COMMENT ON TABLE scheduling_capacity_cache IS 'Short-lived cache for capacity data from ST API';
COMMENT ON TABLE scheduling_availability_cache IS 'Short-lived cache for technician availability';

COMMENT ON TABLE scheduling_sync_log IS 'Audit log of scheduling reference data syncs';
COMMENT ON TABLE scheduling_audit_log IS 'Audit trail for all scheduling operations';

COMMENT ON FUNCTION cleanup_scheduling_cache() IS 'Removes expired cache entries';
COMMENT ON FUNCTION get_technician_with_skills(BIGINT) IS 'Returns technician with all assigned skills';
COMMENT ON FUNCTION find_technicians_by_skills(TEXT[], BIGINT) IS 'Finds technicians matching required skills';
COMMENT ON FUNCTION get_scheduling_stats() IS 'Returns statistics for all scheduling entities';
