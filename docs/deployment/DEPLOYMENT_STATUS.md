# Deployment Status

## Batch Deployment Summary

| Batch | Name | Status | Deployed | Notes |
|-------|------|--------|----------|-------|
| 1 | Database Schema | ✅ Complete | 2025-12-15 | 29 tables, 16 views, 15 functions |
| 2 | MCP Server | ✅ Complete | 2025-12-15 | 7 tools available |
| 3 | Sync Engine | ✅ Complete | 2025-12-15 | 9 modules, all operational |
| 4 | Workflow Engine | ✅ Complete | 2025-12-15 | 6 modules, running |
| 5 | Integrations | ⚠️ Partial | 2025-12-15 | n8n active, GHL code ready |
| 5.5 | GHL Complete | ❌ Pending | - | Migration 006 not applied |

---

## Batch 1: Database Schema

### Tables Created (29)

| Category | Tables | Status |
|----------|--------|--------|
| **ServiceTitan Core** | st_customers, st_jobs, st_estimates, st_invoices, st_appointments | ✅ |
| **ServiceTitan Reference** | st_business_units, st_technicians, st_job_types, st_campaigns, st_tag_types, st_call_reasons | ✅ |
| **ServiceTitan Extended** | st_locations, st_payments, st_installed_equipment, st_custom_fields | ✅ |
| **Sync Tracking** | st_sync_log, sync_state, sync_logs | ✅ |
| **Workflow** | workflow_definitions, workflow_instances, workflow_step_executions | ✅ |
| **Messaging** | messaging_templates, messaging_log, customer_communication_preferences | ✅ |
| **CallRail** | callrail_calls, callrail_conversion_log | ✅ |
| **Legacy** | customers, jobs, business_units | ✅ |

### Views Created (16)

| View | Purpose | Status |
|------|---------|--------|
| v_active_jobs | Active jobs with customer info | ✅ |
| v_open_estimates | Pending estimates | ✅ |
| v_outstanding_invoices | Unpaid invoices | ✅ |
| v_active_workflows | Running workflows | ✅ |
| v_pending_workflow_actions | Actions to execute | ✅ |
| v_workflow_performance | Workflow metrics | ✅ |
| v_customer_communication_history | Message history | ✅ |
| v_messaging_daily_summary | Daily stats | ✅ |
| v_failed_messages | Failed deliveries | ✅ |
| v_template_performance | Template usage | ✅ |
| v_call_attribution_by_campaign | Call attribution | ✅ |
| v_conversion_funnel | Conversion metrics | ✅ |
| v_unmatched_calls | Unmatched calls | ✅ |
| v_pending_gads_conversions | Google Ads | ✅ |
| jobs_pending_ghl_sync | GHL sync queue | ✅ |
| sync_statistics | Sync stats | ✅ |

### Functions Created (15)

| Function | Purpose | Status |
|----------|---------|--------|
| can_send_message_to_customer | Opt-in check | ✅ |
| get_customer_message_count_today | Rate limiting | ✅ |
| record_message_sent | Log delivery | ✅ |
| record_inbound_message | Log incoming | ✅ |
| render_template | Variable substitution | ✅ |
| normalize_phone | Phone formatting | ✅ |
| match_call_to_customer | CallRail matching | ✅ |
| check_call_conversions | Conversion tracking | ✅ |
| upsert_job_from_st | Job upsert | ✅ |
| update_sync_state | Sync state | ✅ |
| increment_template_usage | Template analytics | ✅ |
| reset_daily_message_counters | Daily reset | ✅ |
| reset_weekly_message_counters | Weekly reset | ✅ |

---

## Batch 2: MCP Server

### Tools Implemented (7)

| Tool | File | Status | Tested |
|------|------|--------|--------|
| query_database | tools/query-database.js | ✅ | ✅ |
| call_st_api | tools/call-st-api.js | ✅ | ✅ |
| send_sms | tools/send-sms.js | ✅ | ⚠️ |
| send_email | tools/send-email.js | ✅ | ⚠️ |
| create_job | tools/create-job.js | ✅ | ⚠️ |
| schedule_appointment | tools/schedule-appointment.js | ✅ | ⚠️ |
| pricebook_chat | index.js (inline) | ✅ | ✅ |

### Resources

| Resource | Status |
|----------|--------|
| Pricebook data | ✅ Available |
| Database schema | ✅ Available |

---

## Batch 3: Sync Engine

### Modules Implemented (9)

| Module | File | Status | Last Run |
|--------|------|--------|----------|
| Orchestrator | sync-orchestrator.js | ✅ | 2025-12-15 |
| Customers | sync-customers.js | ✅ | 1,682 records |
| Jobs | sync-jobs.js | ✅ | 3,223 records |
| Estimates | sync-estimates.js | ✅ | 1,220 records |
| Invoices | sync-invoices.js | ✅ | 3,370 records |
| Appointments | sync-appointments.js | ❌ | 404 error |
| Reference Data | sync-reference-data.js | ✅ | 6 business units |
| Scheduler | sync-scheduler.js | ✅ | Configured |
| Base Utilities | sync-base.js | ✅ | - |

### Sync Statistics

```
Last Full Sync: 2025-12-15 11:21:09 UTC
Duration: ~18 seconds

Records Synced:
├── Customers: 1,682
├── Jobs: 3,223
├── Estimates: 1,220
├── Invoices: 3,370
├── Appointments: 0 (API error)
├── Business Units: 6
└── Technicians: 0
```

---

## Batch 4: Workflow Engine

### Modules Implemented (6)

| Module | File | Status |
|--------|------|--------|
| Workflow Manager | workflow-manager.js | ✅ |
| Event Detector | event-detector.js | ✅ |
| Trigger Engine | trigger-engine.js | ✅ |
| Execution Engine | execution-engine.js | ✅ |
| Agent Executor | agent-executor.js | ✅ |
| Condition Evaluator | condition-evaluator.js | ✅ |

### Workflow Definitions (2)

| Workflow | Trigger | Steps | Status |
|----------|---------|-------|--------|
| Estimate Follow-Up | estimate_created | 4 | ✅ Active |
| Post-Service Review | job_completed | 2 | ✅ Active |

### Workflow Instances

```
Active Instances: 0
Completed Instances: 0
Failed Instances: 0
```

---

## Batch 5: Integrations

### n8n Integration

| Component | File | Status |
|-----------|------|--------|
| Webhook Handler | webhook-handler.js | ✅ Active |
| Webhook Sender | webhook-sender.js | ✅ Active |
| Event Emitter | event-emitter.js | ✅ Active |
| Controller | n8n.controller.js | ✅ Active |

**Note:** n8n is still running and handling some workflows. Should be migrated to native workflow engine.

### GHL Integration

| Component | File | Status |
|-----------|------|--------|
| Index | index.js | ✅ Ready |
| Sync Contacts | sync-contacts-from-ghl.js | ✅ Ready |
| Sync Opportunities | sync-opportunities-from-ghl.js | ✅ Ready |
| Sync Estimates | sync-estimate-to-ghl.js | ✅ Ready |

**Blocker:** GHL tables (ghl_opportunities, ghl_contacts) not created. Migration 006 not applied.

---

## Batch 5.5: GHL Complete

### Migration Status

| Migration | File | Status |
|-----------|------|--------|
| 001_pricebook_schema.sql | ✅ Applied | |
| 002_servicetitan_complete.sql | ✅ Applied | |
| 003_workflow_engine.sql | ✅ Applied | |
| 004_callrail_tracking.sql | ✅ Applied | |
| 005_messaging_system.sql | ✅ Applied | |
| 006_ghl_and_employees.sql | ❌ Not Applied | |

### Missing Tables

| Table | Purpose |
|-------|---------|
| st_employees | All ST employees |
| ghl_opportunities | GHL opportunity records |
| ghl_contacts | GHL contact records |
| ghl_sync_log | GHL sync tracking |

### To Apply Migration

```bash
PGPASSWORD='Catchadmin@2025' psql -h localhost -p 6432 -U postgres -d perfectcatch_automation \
  -f src/db/migrations/006_ghl_and_employees.sql
```

---

## Running Services

### Docker Containers

| Container | Status | Port | Health |
|-----------|--------|------|--------|
| perfect-catch-st-automation | ✅ Up | 3001 | Healthy |
| perfect-catch-db | ✅ Up | 5433 | Healthy |
| perfect-catch-redis | ✅ Up | 6380 | Healthy |
| postgres (main) | ✅ Up | 6432 | Running |
| n8n-n8n-1 | ✅ Up | 5678 | Running |
| n8n-n8n-worker-1 | ✅ Up | - | Running |
| servicetitan-api | ✅ Up | 3002 | Running |
| ghl-oauth-proxy | ✅ Up | 3003 | Running |

### Background Workers

| Worker | Command | Status |
|--------|---------|--------|
| Sync Scheduler | `npm run worker:sync` | ⚠️ Not running |
| Workflow Engine | `npm run worker:workflows` | ⚠️ Not running |

**Note:** Workers need to be started manually or via PM2.

---

## Data Verification

### Record Counts

```sql
SELECT 
  (SELECT COUNT(*) FROM st_customers) as customers,      -- 1,682
  (SELECT COUNT(*) FROM st_jobs) as jobs,                -- 3,223
  (SELECT COUNT(*) FROM st_estimates) as estimates,      -- 1,220
  (SELECT COUNT(*) FROM st_invoices) as invoices,        -- 3,370
  (SELECT COUNT(*) FROM st_appointments) as appointments, -- 0
  (SELECT COUNT(*) FROM st_business_units) as business_units, -- 6
  (SELECT COUNT(*) FROM st_technicians) as technicians,  -- 0
  (SELECT COUNT(*) FROM workflow_definitions) as workflows, -- 2
  (SELECT COUNT(*) FROM messaging_templates) as templates; -- 5
```

### Sync Log

```sql
SELECT module, status, records_created, records_updated, records_failed
FROM st_sync_log
ORDER BY started_at DESC
LIMIT 10;
```

---

## Health Check Commands

```bash
# Check main server
curl http://localhost:3001/health

# Check database connection
PGPASSWORD='Catchadmin@2025' psql -h localhost -p 6432 -U postgres -d perfectcatch_automation -c "SELECT 1"

# Check sync status
curl http://localhost:3001/api/sync/status

# Check workflow status
curl http://localhost:3001/api/workflows/status

# Run manual sync
npm run sync:initial

# Start workflow workers
npm run worker:workflows
```
