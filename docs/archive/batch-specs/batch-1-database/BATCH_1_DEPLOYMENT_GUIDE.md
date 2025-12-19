# 🗄️ BATCH 1: DATABASE MIGRATIONS - DEPLOYMENT GUIDE

## ✅ Files Generated

1. **002_servicetitan_complete.sql** - Complete ST data replication (15 tables)
2. **003_workflow_engine.sql** - Event-driven workflows (4 tables)
3. **004_callrail_tracking.sql** - Conversion tracking (2 tables)
4. **005_messaging_system.sql** - SMS/Email logging (2 tables)

**Total:** 23 new tables + views + functions

---

## 📊 Database Summary

### ServiceTitan Tables (002)
- `st_customers` - 15+ customer fields
- `st_locations` - Service addresses with geo
- `st_jobs` - Jobs with GHL sync tracking
- `st_estimates` - Quotes/estimates
- `st_appointments` - Scheduled appointments
- `st_invoices` - Invoices
- `st_payments` - Payments
- `st_technicians` - Tech roster
- `st_business_units` - Divisions (Pool, Electric, etc.)
- `st_installed_equipment` - Equipment at locations
- `st_campaigns` - Marketing campaigns
- `st_call_reasons` - Booking reasons
- `st_job_types` - Job type definitions
- `st_tag_types` - Tag definitions
- `st_custom_fields` - Custom field definitions
- `st_sync_log` - Sync audit trail

**Views:** `v_active_jobs`, `v_open_estimates`, `v_outstanding_invoices`

### Workflow Engine (003)
- `workflow_definitions` - Workflow templates
- `workflow_instances` - Active executions
- `workflow_step_executions` - Step audit log
- `customer_communication_preferences` - Opt-out + rate limits

**Views:** `v_active_workflows`, `v_workflow_performance`, `v_pending_workflow_actions`

**Functions:** 
- `can_send_message_to_customer()` - Check limits
- `record_message_sent()` - Increment counters
- `reset_daily_message_counters()` - Daily cleanup
- `reset_weekly_message_counters()` - Weekly cleanup

**Sample Workflows:** 
- Estimate Follow-Up (4 message max)
- Post-Service Review Request

### CallRail Integration (004)
- `callrail_calls` - Complete call tracking
- `callrail_conversion_log` - Google Ads push log

**Views:** `v_unmatched_calls`, `v_conversion_funnel`, `v_pending_gads_conversions`, `v_call_attribution_by_campaign`

**Functions:**
- `normalize_phone()` - Clean phone numbers
- `match_call_to_customer()` - Auto-match by phone
- `check_call_conversions()` - Link calls to jobs

### Messaging System (005)
- `messaging_log` - All sent/received messages
- `messaging_templates` - Reusable templates

**Views:** `v_messaging_daily_summary`, `v_template_performance`, `v_customer_communication_history`, `v_failed_messages`

**Functions:**
- `render_template()` - Variable substitution
- `increment_template_usage()` - Track usage
- `get_customer_message_count_today()` - Rate limiting
- `record_inbound_message()` - Log replies

**Sample Templates:** 
- appointment_confirmation
- appointment_reminder_24hr
- estimate_sent
- post_service_review
- payment_reminder

---

## 🚀 Deployment Steps

### Step 1: Create Database (if needed)

```bash
# Option A: New database
createdb servicetitan_mirror

# Option B: Use existing database
# (migrations will add tables alongside pricebook tables)
```

### Step 2: Run Migrations

```bash
# Navigate to output directory
cd /mnt/user-data/outputs

# Run migrations in order
psql -U postgres -d servicetitan_mirror < 002_servicetitan_complete.sql
psql -U postgres -d servicetitan_mirror < 003_workflow_engine.sql
psql -U postgres -d servicetitan_mirror < 004_callrail_tracking.sql
psql -U postgres -d servicetitan_mirror < 005_messaging_system.sql
```

**Expected output:**
```
CREATE EXTENSION
CREATE TABLE
CREATE INDEX
...
INSERT 0 5
```

### Step 3: Verify Installation

```sql
-- Connect to database
psql -U postgres -d servicetitan_mirror

-- Check tables created
\dt st_*
\dt workflow_*
\dt callrail_*
\dt messaging_*

-- Should see 23 tables

-- Check views
\dv v_*

-- Should see 12 views

-- Check functions
\df

-- Should see 10+ functions

-- Check sample data
SELECT * FROM workflow_definitions;
SELECT * FROM messaging_templates;

-- Should see 2 workflows and 5 templates
```

### Step 4: Set Permissions (if needed)

```sql
-- Replace 'your_app_user' with your actual app user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;
```

---

## 🔍 Testing Queries

### Test ServiceTitan Tables

```sql
-- Check if ready for data
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'st_customers' 
ORDER BY ordinal_position;

-- Should show all customer fields
```

### Test Workflow Engine

```sql
-- View sample workflow
SELECT name, trigger_event, enabled, steps->0 as first_step
FROM workflow_definitions;

-- Check if functions work
SELECT can_send_message_to_customer(12345, 'sms');
-- Should return true (no preferences set yet)
```

### Test CallRail Tables

```sql
-- Check conversion funnel view
SELECT * FROM v_conversion_funnel;
-- Should return zeros (no data yet)

-- Test phone normalization
SELECT normalize_phone('(555) 123-4567');
-- Should return: 5551234567
```

### Test Messaging System

```sql
-- View templates
SELECT name, category, channel, required_variables 
FROM messaging_templates
WHERE active = true;

-- Test template rendering
SELECT render_template(
  'Hi {customer.name}! Your appointment is {appointment.date}',
  '{"customer.name": "John", "appointment.date": "Dec 20"}'::jsonb
);
-- Should return: "Hi John! Your appointment is Dec 20"
```

---

## 📈 Database Size Estimates

After initial sync:
- **st_customers:** ~5,000 records = 5 MB
- **st_jobs:** ~10,000 records = 15 MB
- **st_estimates:** ~8,000 records = 12 MB
- **st_appointments:** ~15,000 records = 10 MB
- **st_invoices:** ~12,000 records = 18 MB
- **st_payments:** ~8,000 records = 8 MB
- **Other ST tables:** ~5 MB

**Total ST Data:** ~75-100 MB

**Workflow/CallRail/Messaging:** ~10-20 MB (grows over time)

**Total Database:** ~100-150 MB initially

---

## 🔧 Maintenance Tasks

### Daily Tasks (Automated)

```sql
-- Reset message counters (run at midnight)
SELECT reset_daily_message_counters();
```

### Weekly Tasks (Automated)

```sql
-- Reset weekly counters (run Monday 12 AM)
SELECT reset_weekly_message_counters();

-- Clean old sync logs (keep 90 days)
DELETE FROM st_sync_log 
WHERE started_at < CURRENT_DATE - INTERVAL '90 days';
```

### Monthly Tasks

```sql
-- Analyze tables for query optimization
ANALYZE st_customers;
ANALYZE st_jobs;
ANALYZE st_estimates;
ANALYZE workflow_instances;

-- Vacuum to reclaim space
VACUUM ANALYZE;
```

---

## 🚨 Troubleshooting

### Issue: Migration fails with "relation already exists"

**Cause:** Tables already exist from previous run

**Solution:**
```sql
-- Drop all tables (WARNING: DELETES ALL DATA)
DROP TABLE IF EXISTS st_sync_log CASCADE;
DROP TABLE IF EXISTS st_custom_fields CASCADE;
-- ... (drop all tables)

-- Or use fresh database
DROP DATABASE servicetitan_mirror;
CREATE DATABASE servicetitan_mirror;
```

### Issue: Permission denied

**Cause:** Database user lacks privileges

**Solution:**
```sql
-- As postgres user
GRANT ALL PRIVILEGES ON DATABASE servicetitan_mirror TO your_app_user;
\c servicetitan_mirror
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
```

### Issue: Functions not working

**Cause:** plpgsql language not available

**Solution:**
```sql
CREATE EXTENSION IF NOT EXISTS plpgsql;
```

---

## ✅ Success Checklist

- [ ] All 4 migrations run without errors
- [ ] 23 tables created
- [ ] 12 views created
- [ ] 10+ functions created
- [ ] Sample workflows inserted
- [ ] Sample templates inserted
- [ ] Test queries return expected results
- [ ] Permissions granted to app user
- [ ] Database size is reasonable (~100 MB)

---

## 📝 Next Steps

After successful deployment:

1. **Update .env** with database URL:
   ```bash
   SERVICETITAN_DATABASE_URL=postgresql://user:pass@localhost:5432/servicetitan_mirror
   ```

2. **Run initial sync** to populate tables (we'll provide sync scripts)

3. **Continue to Batch 2** - Extended MCP Server

---

## 🆘 Need Help?

If migrations fail:
1. Check PostgreSQL version (requires 12+)
2. Check disk space (need ~200 MB)
3. Check user permissions
4. Review error messages carefully
5. Try migrations one at a time

**Migrations are idempotent** - safe to re-run after fixing issues.

---

**Batch 1 Complete! Ready for Batch 2.**
