-- ============================================
-- Cleanup perfect-catch-db (Port 5433)
-- Remove ALL tables - this database will be decommissioned
-- ============================================
-- 
-- IMPORTANT: 
-- 1. Run migrate-ghl-data.sh FIRST to migrate GHL data to automation DB
-- 2. Verify data exists in automation DB (port 6432)
-- 3. Then run this script
--
-- Run with: docker exec perfect-catch-db psql -U postgres -d pricebook -f /path/to/cleanup-pricebook-db.sql
-- Or:       docker exec -i perfect-catch-db psql -U postgres -d pricebook < cleanup-pricebook-db.sql
-- ============================================

-- Start transaction for safety
BEGIN;

-- ============================================
-- PRE-FLIGHT CHECK: Verify GHL data was migrated
-- ============================================
DO $$
DECLARE
  local_contacts INT;
  local_opps INT;
BEGIN
  SELECT count(*) INTO local_contacts FROM ghl_contacts;
  SELECT count(*) INTO local_opps FROM ghl_opportunities;
  
  IF local_contacts > 0 OR local_opps > 0 THEN
    RAISE NOTICE 'WARNING: GHL data still exists locally!';
    RAISE NOTICE '  ghl_contacts: % rows', local_contacts;
    RAISE NOTICE '  ghl_opportunities: % rows', local_opps;
    RAISE NOTICE 'Run migrate-ghl-data.sh first, then re-run this script.';
    -- Uncomment next line to abort if GHL data exists
    -- RAISE EXCEPTION 'Aborting: GHL data not migrated';
  END IF;
END $$;

-- ============================================
-- Tables to DROP (ALL - database being decommissioned)
-- ============================================

-- ServiceTitan mirror tables (stale/empty - fresh data in port 6432)
DROP TABLE IF EXISTS st_appointments CASCADE;
DROP TABLE IF EXISTS st_business_units CASCADE;
DROP TABLE IF EXISTS st_call_reasons CASCADE;
DROP TABLE IF EXISTS st_campaigns CASCADE;
DROP TABLE IF EXISTS st_custom_fields CASCADE;
DROP TABLE IF EXISTS st_customers CASCADE;
DROP TABLE IF EXISTS st_employees CASCADE;
DROP TABLE IF EXISTS st_estimates CASCADE;
DROP TABLE IF EXISTS st_installed_equipment CASCADE;
DROP TABLE IF EXISTS st_invoices CASCADE;
DROP TABLE IF EXISTS st_job_types CASCADE;
DROP TABLE IF EXISTS st_jobs CASCADE;
DROP TABLE IF EXISTS st_locations CASCADE;
DROP TABLE IF EXISTS st_payments CASCADE;
DROP TABLE IF EXISTS st_sync_log CASCADE;
DROP TABLE IF EXISTS st_tag_types CASCADE;
DROP TABLE IF EXISTS st_technicians CASCADE;

-- Workflow tables (duplicate - exists in port 6432)
DROP TABLE IF EXISTS workflow_step_executions CASCADE;
DROP TABLE IF EXISTS workflow_instances CASCADE;
DROP TABLE IF EXISTS workflow_definitions CASCADE;

-- Messaging tables (duplicate - exists in port 6432)
DROP TABLE IF EXISTS messaging_log CASCADE;
DROP TABLE IF EXISTS messaging_templates CASCADE;

-- GHL tables (migrated to port 6432)
DROP TABLE IF EXISTS ghl_contacts CASCADE;
DROP TABLE IF EXISTS ghl_opportunities CASCADE;
DROP TABLE IF EXISTS ghl_sync_log CASCADE;

-- CallRail tables (duplicate - exists in port 6432)
DROP TABLE IF EXISTS callrail_calls CASCADE;
DROP TABLE IF EXISTS callrail_conversion_log CASCADE;

-- Other automation tables
DROP TABLE IF EXISTS customer_communication_preferences CASCADE;

-- Pricebook tables (duplicate - master is in port 5451)
DROP TABLE IF EXISTS pricebook_webhook_subscriptions CASCADE;
DROP TABLE IF EXISTS pricebook_sync_conflicts CASCADE;
DROP TABLE IF EXISTS pricebook_changes CASCADE;
DROP TABLE IF EXISTS pricebook_sync_log CASCADE;
DROP TABLE IF EXISTS pricebook_equipment CASCADE;
DROP TABLE IF EXISTS pricebook_services CASCADE;
DROP TABLE IF EXISTS pricebook_materials CASCADE;
DROP TABLE IF EXISTS pricebook_categories CASCADE;

-- Chat sessions (duplicate - exists in port 5451)
DROP TABLE IF EXISTS chat_sessions CASCADE;

-- ============================================
-- Drop any remaining enums/types
-- ============================================
DROP TYPE IF EXISTS sync_status CASCADE;
DROP TYPE IF EXISTS sync_direction CASCADE;
DROP TYPE IF EXISTS conflict_status CASCADE;
DROP TYPE IF EXISTS conflict_type CASCADE;
DROP TYPE IF EXISTS change_action CASCADE;
DROP TYPE IF EXISTS change_source CASCADE;
DROP TYPE IF EXISTS entity_type CASCADE;
DROP TYPE IF EXISTS sync_job_status CASCADE;
DROP TYPE IF EXISTS workflow_status CASCADE;
DROP TYPE IF EXISTS trigger_type CASCADE;
DROP TYPE IF EXISTS action_type CASCADE;
DROP TYPE IF EXISTS message_channel CASCADE;
DROP TYPE IF EXISTS message_status CASCADE;

-- ============================================
-- Verify all tables dropped
-- ============================================
SELECT 'Remaining tables:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- COMMIT or ROLLBACK
-- ============================================
-- Uncomment COMMIT when ready to execute
-- COMMIT;

-- For safety, ROLLBACK by default
ROLLBACK;

-- ============================================
-- After verification, run with COMMIT uncommented
-- ============================================
