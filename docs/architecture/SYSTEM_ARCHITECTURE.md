# Perfect Catch ST Automation - System Architecture

## Executive Summary

The Perfect Catch ST Automation Platform is a comprehensive automation system that:
- **Syncs data** from ServiceTitan to a local PostgreSQL database
- **Detects events** (new estimates, completed jobs, overdue invoices)
- **Triggers workflows** based on configurable rules
- **Executes actions** via AI agents (SMS, email, API calls)
- **Integrates** with GoHighLevel, CallRail, Twilio, and SendGrid

**Current Status:** ✅ Fully operational with all sync engines, workflow automation, GHL integration, and self-healing monitoring deployed.

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
│  │   st-sync-worker │    │ st-workflow-wrkr │    │                  │           │
│  │                  │    │                  │    │ • query-database │           │
│  │ • sync-customers │    │ • event-detector │    │ • call-st-api    │           │
│  │ • sync-jobs      │    │ • trigger-engine │    │ • send-sms       │           │
│  │ • sync-estimates │    │ • execution-eng  │    │ • send-email     │           │
│  │ • sync-invoices  │    │ • agent-executor │    │ • create-job     │           │
│  │ • sync-appts     │    │ • GHL sync       │    │ • scheduling/*   │           │
│  │ • sync-reference │    │ • workflow-mgr   │    │ • estimates/*    │           │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘           │
│           │                       │                       │                      │
│           ▼                       ▼                       ▼                      │
│  ┌───────────────────────────────────────────────────────────────────┐          │
│  │                     PostgreSQL DATABASE                            │          │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │          │
│  │  │servicetitan │  │ automation  │  │integrations │                │          │
│  │  │ st_customers│  │ workflow_   │  │ ghl_contacts│                │          │
│  │  │ st_jobs     │  │ definitions │  │ ghl_opps    │                │          │
│  │  │ st_estimates│  │ workflow_   │  │ ghl_sync_log│                │          │
│  │  │ st_invoices │  │ instances   │  │ callrail_*  │                │          │
│  │  │ st_appts    │  │ messaging_* │  │             │                │          │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │          │
│  └───────────────────────────────────────────────────────────────────┘          │
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐           │
│  │  GHL INTEGRATION │    │  MONITORING      │    │  SCRAPERS        │           │
│  │  ✅ OPERATIONAL  │    │  st-monitor-agent│    │  (Pool360, CED)  │           │
│  │                  │    │                  │    │                  │           │
│  │ • sync-contacts  │    │ • health-monitor │    │ • pool360-scraper│           │
│  │ • sync-opps      │    │ • self-healing   │    │ • ced-scraper    │           │
│  │ • sync-estimates │    │ • AI diagnostics │    │ • homedepot      │           │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Main API Server

| Property | Value |
|----------|-------|
| **Location** | `src/server.js` |
| **Port** | 3001 |
| **Framework** | Express.js |
| **Container** | `perfect-catch-st-automation` |
| **Status** | ✅ Running (healthy) |

### 2. Sync Worker

| Property | Value |
|----------|-------|
| **Location** | `src/services/sync/` |
| **Container** | `st-sync-worker` |
| **Schedule** | Full: 2 AM daily, Incremental: every 5 minutes |
| **Status** | ✅ Operational |

**Modules:**
- `sync-orchestrator.js` - Coordinates all sync operations
- `sync-customers.js` - Syncs customer data
- `sync-jobs.js` - Syncs job data
- `sync-estimates.js` - Syncs estimate data
- `sync-invoices.js` - Syncs invoice data
- `sync-appointments.js` - Syncs appointments ✅ Fixed
- `sync-reference-data.js` - Syncs business units, technicians, job types
- `sync-scheduler.js` - Cron-based scheduling
- `sync-base.js` - Shared utilities

### 3. Workflow Worker

| Property | Value |
|----------|-------|
| **Location** | `src/services/workflow/` |
| **Container** | `st-workflow-worker` |
| **Poll Interval** | 30 seconds |
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
- `job_created`, `job_completed`, `install_job_created`
- `invoice_created`, `invoice_overdue`
- `appointment_created`

### 4. Monitoring Agent

| Property | Value |
|----------|-------|
| **Location** | `src/services/monitoring/` |
| **Container** | `st-monitoring-agent` |
| **Check Interval** | Every 5 minutes |
| **Status** | ✅ Operational |

**Capabilities:**
- Health monitoring for all workers
- Automatic sync restart if stalled
- Stalled workflow recovery
- AI-powered diagnostics via Claude
- Docker container restart

### 5. MCP Server

| Property | Value |
|----------|-------|
| **Location** | `mcp-server/` |
| **Entry Point** | `mcp-server/index.js` |
| **Protocol** | Model Context Protocol (stdio) |
| **Status** | ✅ Available |

**Tool Categories:**
| Category | Tools |
|----------|-------|
| Database | `query_database` |
| ServiceTitan | `call_st_api`, `create_job` |
| Scheduling | `get_technicians`, `get_availability`, `schedule_appointment` |
| Estimates | `get_estimate_details`, `add_items_to_estimate`, `generate_estimate` |
| Messaging | `send_sms`, `send_email` |
| Customers | Customer lookup and management |
| AI | AI-powered analysis tools |

### 6. GHL Integration

| Property | Value |
|----------|-------|
| **Location** | `src/integrations/ghl/` |
| **Sync Schedule** | Every 5 minutes (via workflow worker) |
| **Status** | ✅ Fully Operational |

**Modules:**
- `index.js` - Main exports and pipeline management
- `sync-contacts-from-ghl.js` - Pull contacts from GHL
- `sync-opportunities-from-ghl.js` - Pull opportunities from GHL
- `sync-estimate-to-ghl.js` - Push estimates to GHL
- `move-to-install-pipeline.js` - Move opps to Install pipeline

**Pipeline Configuration:**
```javascript
SALES_PIPELINE = 'fWJfnMsPzwOXgKdWxdjC'
Stages:
  - NEW_LEAD
  - CONTACTED
  - APPOINTMENT_SCHEDULED
  - APPOINTMENT_COMPLETED_PROPOSAL_SENT
  - ESTIMATE_FOLLOWUP
  - JOB_SOLD
  - ESTIMATE_LOST
```

---

## Database Schema

### Current Data Counts (as of 2025-12-20)

| Table | Rows | Status |
|-------|------|--------|
| `st_customers` | 1,696 | ✅ Syncing |
| `st_jobs` | 3,260 | ✅ Syncing |
| `st_estimates` | 1,247 | ✅ Syncing |
| `st_invoices` | 3,597 | ✅ Syncing |
| `st_appointments` | 4,156 | ✅ Syncing |
| `st_technicians` | 14 | ✅ Syncing |
| `ghl_contacts` | 108 | ✅ Syncing |
| `ghl_opportunities` | 218 | ✅ Syncing |

### Database Schemas

| Schema | Purpose | Tables |
|--------|---------|--------|
| `servicetitan` | ST synced data | 18 tables |
| `integrations` | GHL, CallRail | 5 tables |
| `automation` | Workflows, messaging | 5 tables |
| `pricebook` | Pricebook data | 11 tables |
| `public` | Scheduling, sync state | 72 tables/views |

---

## Running Services

### Docker Containers

| Container | Port | Status |
|-----------|------|--------|
| `perfect-catch-st-automation` | 3001 | ✅ Healthy |
| `st-sync-worker` | - | ✅ Healthy |
| `st-workflow-worker` | - | ✅ Healthy |
| `st-monitoring-agent` | - | ✅ Healthy |
| `postgres` | 6432 | ✅ Running |
| `perfect-catch-redis` | 6380 | ✅ Healthy |
| `n8n-n8n-1` | 5678 | ✅ Running |
| `st-pool360-scraper-api` | - | ✅ Running |
| `st-ced-scraper-api` | - | ✅ Running |

---

## Deployment Status

### All Batches Complete

| Batch | Description | Status |
|-------|-------------|--------|
| **Batch 1** | Database Schema | ✅ Deployed |
| **Batch 2** | MCP Server | ✅ Deployed (20+ tools) |
| **Batch 3** | Sync Engine | ✅ Deployed |
| **Batch 4** | Workflow Engine | ✅ Deployed |
| **Batch 5** | n8n Integration | ✅ Deployed (legacy) |
| **Batch 5.5** | GHL Complete | ✅ Deployed |
| **Batch 8** | AI Estimation | ✅ Deployed |
| **Batch 9** | Enhanced Sync | ✅ Deployed |
| **Batch 10** | Self-Healing | ✅ Deployed |

### Data Flow Status

| Flow | Status | Notes |
|------|--------|-------|
| ServiceTitan → Database | ✅ Working | All entities syncing every 5 min |
| Database → Event Detection | ✅ Working | Polling every 30 seconds |
| Events → Workflows | ✅ Working | Auto-triggers on estimate/job events |
| Workflows → GHL | ✅ Working | Estimates auto-sync to opportunities |
| Self-Healing | ✅ Working | AI-powered diagnostics |

---

## Previous Issues - All Resolved

| Issue | Resolution |
|-------|------------|
| ~~Appointments Sync Failing~~ | ✅ Fixed - 4,156 records synced |
| ~~GHL Tables Missing~~ | ✅ Deployed - 108 contacts, 218 opps |
| ~~Technicians Not Synced~~ | ✅ Fixed - 14 technicians synced |
| ~~No Workflow Instances~~ | ✅ Working - Events triggering workflows |
| ~~Estimates without job_id failing~~ | ✅ Fixed - job_id now nullable |

---

*Last Updated: 2025-12-20*
