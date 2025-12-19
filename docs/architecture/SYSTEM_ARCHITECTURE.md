# Perfect Catch ST Automation - System Architecture

## Executive Summary

The Perfect Catch ST Automation Platform is a comprehensive automation system that:
- **Syncs data** from ServiceTitan to a local PostgreSQL database
- **Detects events** (new estimates, completed jobs, overdue invoices)
- **Triggers workflows** based on configurable rules
- **Executes actions** via AI agents (SMS, email, API calls)
- **Integrates** with GoHighLevel, CallRail, Twilio, and SendGrid

**Current Status:** Core sync and workflow engines are deployed and operational. GHL integration tables pending migration.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ServiceTitan API    GoHighLevel API    Twilio SMS    SendGrid Email    CallRail │
└────────┬─────────────────┬──────────────────┬─────────────┬──────────────┬───────┘
         │                 │                  │             │              │
         ▼                 ▼                  ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         PERFECT CATCH AUTOMATION PLATFORM                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐           │
│  │   SYNC ENGINE    │    │  WORKFLOW ENGINE │    │   MCP SERVER     │           │
│  │                  │    │                  │    │                  │           │
│  │ • sync-customers │    │ • event-detector │    │ • query-database │           │
│  │ • sync-jobs      │    │ • trigger-engine │    │ • call-st-api    │           │
│  │ • sync-estimates │    │ • execution-eng  │    │ • send-sms       │           │
│  │ • sync-invoices  │    │ • agent-executor │    │ • send-email     │           │
│  │ • sync-reference │    │ • workflow-mgr   │    │ • create-job     │           │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘           │
│           │                       │                       │                      │
│           ▼                       ▼                       ▼                      │
│  ┌───────────────────────────────────────────────────────────────────┐          │
│  │                     PostgreSQL DATABASE                            │          │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │          │
│  │  │ st_customers│  │ workflow_   │  │ messaging_  │                │          │
│  │  │ st_jobs     │  │ definitions │  │ templates   │                │          │
│  │  │ st_estimates│  │ workflow_   │  │ messaging_  │                │          │
│  │  │ st_invoices │  │ instances   │  │ log         │                │          │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │          │
│  └───────────────────────────────────────────────────────────────────┘          │
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                                   │
│  │  GHL INTEGRATION │    │  n8n INTEGRATION │                                   │
│  │                  │    │  (Legacy)        │                                   │
│  │ • sync-contacts  │    │ • webhook-handler│                                   │
│  │ • sync-opps      │    │ • event-emitter  │                                   │
│  │ • sync-estimates │    │                  │                                   │
│  └──────────────────┘    └──────────────────┘                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Main API Server

| Property | Value |
|----------|-------|
| **Location** | `src/server.js`, `src/app.js` |
| **Port** | 3001 |
| **Framework** | Express.js |
| **Container** | `perfect-catch-st-automation` |
| **Status** | ✅ Running (healthy) |

**Entry Point:** `src/server.js`
- Loads Express app from `src/app.js`
- Mounts all routes from `src/routes/index.js`
- Includes 27 route modules

### 2. Sync Engine

| Property | Value |
|----------|-------|
| **Location** | `src/services/sync/` |
| **Files** | 9 modules |
| **Schedule** | Full: 2 AM daily, Incremental: every 6 hours |
| **Status** | ✅ Operational |

**Modules:**
- `sync-orchestrator.js` - Coordinates all sync operations
- `sync-customers.js` - Syncs customer data
- `sync-jobs.js` - Syncs job data
- `sync-estimates.js` - Syncs estimate data
- `sync-invoices.js` - Syncs invoice data
- `sync-appointments.js` - Syncs appointments (404 error - endpoint issue)
- `sync-reference-data.js` - Syncs business units, technicians, job types
- `sync-scheduler.js` - Cron-based scheduling
- `sync-base.js` - Shared utilities

### 3. Workflow Engine

| Property | Value |
|----------|-------|
| **Location** | `src/services/workflow/` |
| **Files** | 6 modules |
| **Poll Interval** | 30 seconds |
| **Execution Interval** | 10 seconds |
| **Status** | ✅ Operational |

**Modules:**
- `workflow-manager.js` - Main coordinator
- `event-detector.js` - Polls DB for changes, emits events
- `trigger-engine.js` - Matches events to workflow definitions
- `execution-engine.js` - Executes workflow steps
- `agent-executor.js` - Uses Claude AI for action execution
- `condition-evaluator.js` - Evaluates workflow conditions

**Supported Events:**
- `estimate_created`, `estimate_approved`, `estimate_rejected`
- `job_created`, `job_completed`
- `invoice_created`, `invoice_overdue`
- `appointment_created`

### 4. MCP Server

| Property | Value |
|----------|-------|
| **Location** | `mcp-server/` |
| **Entry Point** | `mcp-server/index.js` |
| **Protocol** | Model Context Protocol (stdio) |
| **Status** | ✅ Available |

**Available Tools:**
| Tool | File | Purpose |
|------|------|---------|
| `query_database` | `tools/query-database.js` | Execute SQL queries |
| `call_st_api` | `tools/call-st-api.js` | Call ServiceTitan API |
| `send_sms` | `tools/send-sms.js` | Send SMS via Twilio |
| `send_email` | `tools/send-email.js` | Send email via SendGrid |
| `create_job` | `tools/create-job.js` | Create ServiceTitan job |
| `schedule_appointment` | `tools/schedule-appointment.js` | Schedule appointment |

### 5. GHL Integration

| Property | Value |
|----------|-------|
| **Location** | `src/integrations/ghl/` |
| **Files** | 4 modules |
| **Status** | ⚠️ Tables not migrated |

**Modules:**
- `index.js` - Main exports
- `sync-contacts-from-ghl.js` - Pull contacts from GHL
- `sync-opportunities-from-ghl.js` - Pull opportunities from GHL
- `sync-estimate-to-ghl.js` - Push estimates to GHL

### 6. n8n Integration (Legacy)

| Property | Value |
|----------|-------|
| **Location** | `src/integrations/n8n/` |
| **Files** | 5 modules |
| **Status** | ⚠️ Active but being replaced |

**Modules:**
- `webhook-handler.js` - Receives n8n webhooks
- `webhook-sender.js` - Sends webhooks to n8n
- `event-emitter.js` - Emits events to n8n
- `n8n.controller.js` - Controller for n8n routes

---

## Database Schema

### Core ServiceTitan Tables (29 total)

| Table | Rows | Purpose |
|-------|------|---------|
| `st_customers` | 1,682 | Customer records |
| `st_jobs` | 3,223 | Job records |
| `st_estimates` | 1,220 | Estimate records |
| `st_invoices` | 3,370 | Invoice records |
| `st_appointments` | 0 | Appointment records (sync failing) |
| `st_business_units` | 6 | Business unit config |
| `st_technicians` | 0 | Technician records |
| `st_locations` | 0 | Location records |
| `st_campaigns` | - | Marketing campaigns |
| `st_job_types` | - | Job type definitions |
| `st_tag_types` | - | Tag definitions |
| `st_payments` | - | Payment records |
| `st_installed_equipment` | - | Equipment records |
| `st_custom_fields` | - | Custom field definitions |
| `st_call_reasons` | - | Call reason codes |
| `st_sync_log` | 52 | Sync operation logs |

### Workflow Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `workflow_definitions` | 2 | Workflow templates |
| `workflow_instances` | 0 | Active workflow instances |
| `workflow_step_executions` | 0 | Step execution logs |

### Messaging Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `messaging_templates` | 5 | Message templates |
| `messaging_log` | 0 | Message delivery logs |
| `customer_communication_preferences` | 0 | Opt-in/out preferences |

### Integration Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `callrail_calls` | 0 | CallRail call records |
| `callrail_conversion_log` | 0 | Conversion tracking |
| `sync_state` | - | Sync state tracking |
| `sync_logs` | - | Legacy sync logs |

### Views (16 total)

| View | Purpose |
|------|---------|
| `v_active_jobs` | Active jobs with customer info |
| `v_open_estimates` | Open estimates pending approval |
| `v_outstanding_invoices` | Invoices with balance due |
| `v_active_workflows` | Currently running workflows |
| `v_pending_workflow_actions` | Actions ready to execute |
| `v_workflow_performance` | Workflow metrics |
| `v_customer_communication_history` | Message history per customer |
| `v_messaging_daily_summary` | Daily message stats |
| `v_failed_messages` | Failed message deliveries |
| `v_template_performance` | Template usage stats |
| `v_call_attribution_by_campaign` | Call attribution |
| `v_conversion_funnel` | Conversion metrics |
| `v_unmatched_calls` | Calls not matched to customers |
| `v_pending_gads_conversions` | Google Ads conversions |
| `jobs_pending_ghl_sync` | Jobs to sync to GHL |
| `sync_statistics` | Sync performance stats |

### Functions (15 custom)

| Function | Purpose |
|----------|---------|
| `can_send_message_to_customer()` | Check opt-in status |
| `get_customer_message_count_today()` | Rate limiting |
| `record_message_sent()` | Log message delivery |
| `record_inbound_message()` | Log incoming messages |
| `render_template()` | Template variable substitution |
| `normalize_phone()` | Phone number formatting |
| `match_call_to_customer()` | CallRail matching |
| `check_call_conversions()` | Conversion tracking |
| `upsert_job_from_st()` | Job upsert logic |
| `update_sync_state()` | Sync state management |
| `increment_template_usage()` | Template analytics |
| `reset_daily_message_counters()` | Daily reset |
| `reset_weekly_message_counters()` | Weekly reset |

---

## Running Services

### Docker Containers (Key Services)

| Container | Port | Status |
|-----------|------|--------|
| `perfect-catch-st-automation` | 3001 | ✅ Healthy |
| `perfect-catch-db` | 5433 | ✅ Healthy |
| `perfect-catch-redis` | 6380 | ✅ Healthy |
| `postgres` (main) | 6432 | ✅ Running |
| `n8n-n8n-1` | 5678 | ✅ Running |
| `n8n-n8n-worker-1` | - | ✅ Running |
| `servicetitan-api` | 3002 | ✅ Running |
| `ghl-oauth-proxy` | 3003 | ✅ Running |

### NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm start` | `node src/server.js` | Start main server |
| `npm run sync:initial` | `node scripts/run-initial-sync.js` | Full initial sync |
| `npm run sync:st-full` | Inline script | Full ST sync |
| `npm run sync:st-incremental` | Inline script | Incremental sync |
| `npm run worker:sync` | `node src/services/sync/sync-scheduler.js` | Start sync scheduler |
| `npm run worker:workflows` | `node scripts/start-workflow-workers.js` | Start workflow engine |
| `npm run ghl:sync:all` | Combined | Sync all from GHL |
| `npm run ghl:push:estimates` | Inline script | Push estimates to GHL |

---

## Configuration

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (3001) |
| `NODE_ENV` | Environment (development) |
| `DATABASE_URL` | PostgreSQL connection |
| `SERVICETITAN_DATABASE_URL` | ST mirror database |
| `SERVICE_TITAN_CLIENT_ID` | ST API client ID |
| `SERVICE_TITAN_CLIENT_SECRET` | ST API secret |
| `SERVICE_TITAN_TENANT_ID` | ST tenant ID |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_PHONE_NUMBER` | Twilio sender |
| `GHL_LOCATION_ID` | GHL location |
| `GHL_API_KEY` | GHL API key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `SYNC_FULL_CRON` | Full sync schedule |
| `SYNC_INCREMENTAL_CRON` | Incremental schedule |

---

## Deployment Status

### Batch Status

| Batch | Description | Status |
|-------|-------------|--------|
| **Batch 1** | Database Schema | ✅ Deployed (29 tables, 16 views) |
| **Batch 2** | MCP Server | ✅ Deployed (7 tools) |
| **Batch 3** | Sync Engine | ✅ Deployed (9 modules) |
| **Batch 4** | Workflow Engine | ✅ Deployed (6 modules) |
| **Batch 5** | Integrations | ⚠️ Partial (n8n active, GHL code ready) |
| **Batch 5.5** | GHL Complete | ❌ Tables not migrated |

### Data Flow Status

| Flow | Status | Notes |
|------|--------|-------|
| ServiceTitan → Database | ✅ Working | 1,682 customers, 3,223 jobs synced |
| Database → Event Detection | ✅ Working | Polling every 30 seconds |
| Events → Workflows | ✅ Working | 2 workflow definitions active |
| Workflows → Actions | ⚠️ Ready | No instances created yet |
| Database → GoHighLevel | ❌ Blocked | GHL tables not migrated |

---

## Current Issues

1. **Appointments Sync Failing** - 404 error on API endpoint
2. **GHL Tables Missing** - Migration 006 not applied
3. **No Workflow Instances** - Workflows defined but not triggering
4. **Technicians Not Synced** - 0 records in st_technicians
5. **n8n Redundancy** - Both n8n and workflow engine active

---

## Next Steps

1. **Apply Migration 006** - Create GHL tables
2. **Fix Appointments Sync** - Correct API endpoint
3. **Sync Technicians** - Add to reference data sync
4. **Test Workflow Triggers** - Create test estimate to trigger workflow
5. **Deprecate n8n** - Migrate remaining workflows to native engine
