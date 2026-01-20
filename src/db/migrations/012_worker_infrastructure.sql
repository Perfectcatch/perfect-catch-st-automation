-- Migration: 012_worker_infrastructure.sql
-- Description: Worker infrastructure tables for tracking runs, logs, and sync state
-- Created: 2026-01-20

-- ═══════════════════════════════════════════════════════════════
-- SYNC STATE TRACKING
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sync_state (
  id SERIAL PRIMARY KEY,
  entity VARCHAR(100) UNIQUE NOT NULL,
  last_synced_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.sync_state IS 'Tracks sync state for each entity type';

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_sync_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_state_updated_at ON public.sync_state;
CREATE TRIGGER sync_state_updated_at
  BEFORE UPDATE ON public.sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_sync_state_timestamp();

-- ═══════════════════════════════════════════════════════════════
-- WORKER RUN HISTORY
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.worker_runs (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'timeout', 'skipped')),
  duration_ms INTEGER,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.worker_runs IS 'History of worker executions';

CREATE INDEX IF NOT EXISTS idx_worker_runs_name_created
  ON public.worker_runs(worker_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_runs_status
  ON public.worker_runs(status);

-- ═══════════════════════════════════════════════════════════════
-- WORKER LOGS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.worker_logs (
  id SERIAL PRIMARY KEY,
  worker_name VARCHAR(100) NOT NULL,
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.worker_logs IS 'Detailed worker execution logs';

CREATE INDEX IF NOT EXISTS idx_worker_logs_name_created
  ON public.worker_logs(worker_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_logs_level
  ON public.worker_logs(level) WHERE level IN ('error', 'fatal');

-- Partition worker_logs by month for better performance (optional - for high volume)
-- This can be enabled later if needed

-- ═══════════════════════════════════════════════════════════════
-- GHL WEBHOOK LOGS (extend existing if needed)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integrations.ghl_webhook_log (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  ghl_id VARCHAR(100),
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  process_result JSONB,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE integrations.ghl_webhook_log IS 'Log of incoming GHL webhooks';

CREATE INDEX IF NOT EXISTS idx_ghl_webhook_log_event
  ON integrations.ghl_webhook_log(event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_ghl_webhook_log_processed
  ON integrations.ghl_webhook_log(processed) WHERE NOT processed;

-- ═══════════════════════════════════════════════════════════════
-- GHL SYNC EVENTS (audit trail)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integrations.ghl_sync_events (
  id SERIAL PRIMARY KEY,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('st_to_ghl', 'ghl_to_st')),
  entity VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  ghl_id VARCHAR(100),
  st_id VARCHAR(100),
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE integrations.ghl_sync_events IS 'Audit trail of sync events between ST and GHL';

CREATE INDEX IF NOT EXISTS idx_ghl_sync_events_direction
  ON integrations.ghl_sync_events(direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ghl_sync_events_entity
  ON integrations.ghl_sync_events(entity, action);

CREATE INDEX IF NOT EXISTS idx_ghl_sync_events_status
  ON integrations.ghl_sync_events(status) WHERE status = 'pending';

-- ═══════════════════════════════════════════════════════════════
-- INITIAL SEED DATA
-- ═══════════════════════════════════════════════════════════════

-- Initialize sync state for main entities
INSERT INTO public.sync_state (entity, records_synced) VALUES
  ('st_customers', 0),
  ('st_jobs', 0),
  ('st_estimates', 0),
  ('st_invoices', 0),
  ('ghl_contacts', 0),
  ('ghl_opportunities', 0)
ON CONFLICT (entity) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Function to get recent worker stats
CREATE OR REPLACE FUNCTION public.get_worker_stats(p_worker_name VARCHAR, p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  total_runs INTEGER,
  success_count INTEGER,
  error_count INTEGER,
  avg_duration_ms NUMERIC,
  last_run_at TIMESTAMPTZ,
  last_status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_runs,
    COUNT(*) FILTER (WHERE status = 'success')::INTEGER as success_count,
    COUNT(*) FILTER (WHERE status = 'error')::INTEGER as error_count,
    AVG(duration_ms)::NUMERIC as avg_duration_ms,
    MAX(created_at) as last_run_at,
    (SELECT wr.status FROM public.worker_runs wr
     WHERE wr.worker_name = p_worker_name
     ORDER BY wr.created_at DESC LIMIT 1)::VARCHAR as last_status
  FROM public.worker_runs
  WHERE worker_name = p_worker_name
    AND created_at > NOW() - (p_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_worker_stats IS 'Get statistics for a specific worker';

-- Function to cleanup old logs
CREATE OR REPLACE FUNCTION public.cleanup_old_logs(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  worker_logs_deleted INTEGER,
  worker_runs_deleted INTEGER,
  webhook_logs_deleted INTEGER
) AS $$
DECLARE
  v_worker_logs INTEGER;
  v_worker_runs INTEGER;
  v_webhook_logs INTEGER;
BEGIN
  -- Delete old worker logs
  DELETE FROM public.worker_logs
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_worker_logs = ROW_COUNT;

  -- Delete old worker runs
  DELETE FROM public.worker_runs
  WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_worker_runs = ROW_COUNT;

  -- Delete old webhook logs
  DELETE FROM integrations.ghl_webhook_log
  WHERE received_at < NOW() - (p_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_webhook_logs = ROW_COUNT;

  RETURN QUERY SELECT v_worker_logs, v_worker_runs, v_webhook_logs;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.cleanup_old_logs IS 'Cleanup old logs and run history';

-- ═══════════════════════════════════════════════════════════════
-- VIEWS FOR MONITORING
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.worker_status AS
SELECT
  s.entity as worker_name,
  s.last_synced_at,
  s.records_synced,
  s.error_count,
  (SELECT COUNT(*) FROM public.worker_runs wr
   WHERE wr.worker_name = REPLACE(s.entity, '_', '-') || '-sync'
   AND wr.created_at > NOW() - INTERVAL '24 hours') as runs_24h,
  (SELECT COUNT(*) FROM public.worker_runs wr
   WHERE wr.worker_name = REPLACE(s.entity, '_', '-') || '-sync'
   AND wr.status = 'error'
   AND wr.created_at > NOW() - INTERVAL '24 hours') as errors_24h
FROM public.sync_state s;

COMMENT ON VIEW public.worker_status IS 'Overview of worker status and recent activity';

-- ═══════════════════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════════════════

-- Grant permissions (adjust role name as needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA integrations TO app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA integrations TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;
