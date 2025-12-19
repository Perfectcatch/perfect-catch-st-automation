# Workers, Workflows & Database Architecture

This document describes all running workers, sync engines, workflow systems, and database connections in the Perfect Catch ST Automation system.

---

## Table of Contents

1. [Running Containers Overview](#running-containers-overview)
2. [Workers](#workers)
   - [ST Sync Worker](#1-st-sync-worker)
   - [Workflow Worker](#2-workflow-worker)
   - [Monitoring Agent](#3-monitoring-agent)
3. [Sync Engines](#sync-engines)
   - [ServiceTitan Sync](#servicetitan-sync)
   - [GHL Sync](#ghl-sync)
4. [Workflow System](#workflow-system)
5. [Databases](#databases)
6. [Database Schemas](#database-schemas)
7. [NPM Scripts Reference](#npm-scripts-reference)

---

## Running Containers Overview

| Container | Status | Purpose | Port |
|-----------|--------|---------|------|
| `perfect-catch-st-automation` | Healthy | Main API server | 3001 |
| `st-sync-worker` | Healthy | ServiceTitan data sync | - |
| `st-workflow-worker` | Healthy | Event detection & workflows | - |
| `st-monitoring-agent` | Healthy | Self-healing monitoring | - |
| `postgres` | Running | Primary PostgreSQL database | 6432 |
| `perfect-catch-redis` | Healthy | Redis cache | 6380 |
| `n8n-n8n-1` | Running | n8n workflow automation | 5678 |
| `n8n-n8n-worker-1` | Running | n8n background worker | - |

---

## Workers

### 1. ST Sync Worker

**Container:** `st-sync-worker`
**Command:** `npm run worker:sync`
**Entry Point:** `src/services/sync/sync-scheduler.js`

#### Schedule

| Sync Type | Cron Schedule | Default | Description |
|-----------|--------------|---------|-------------|
| Incremental | `*/5 * * * *` | Every 5 minutes | Syncs changes since last sync |
| Full | `0 2 * * *` | Daily at 2:00 AM | Complete data refresh |

#### Environment Variables

```bash
SYNC_INCREMENTAL_CRON="*/5 * * * *"  # Override incremental schedule
SYNC_FULL_CRON="0 2 * * *"           # Override full sync schedule
```

#### What Gets Synced (in order)

1. **Reference Data** (daily at 2 AM)
   - Business Units
   - Job Types
   - Technicians
   - Tag Types
   - Custom Fields

2. **Customers** → `servicetitan.st_customers`
3. **Jobs** → `servicetitan.st_jobs`
4. **Estimates** → `servicetitan.st_estimates`
5. **Appointments** → `servicetitan.st_appointments`
6. **Invoices** → `servicetitan.st_invoices`

#### Example Sync Stats (Last 24 Hours)

```
Module        | Sync Count | Last Sync           | Avg Duration
--------------+------------+---------------------+--------------
appointments  | 259        | 2025-12-19 23:50:48 | 1214 ms
customers     | 259        | 2025-12-19 23:50:48 | 1240 ms
estimates     | 259        | 2025-12-19 23:50:48 | 932 ms
invoices      | 259        | 2025-12-19 23:50:48 | 1172 ms
jobs          | 259        | 2025-12-19 23:50:48 | 1120 ms
reference_data| 1          | 2025-12-19 02:00:03 | 1925 ms
```

#### Health Check

```bash
# File-based heartbeat written every 30 seconds
/tmp/worker-heartbeat

# Check sync status
docker logs st-sync-worker --tail 50

# Manual sync commands
npm run sync:st-incremental  # Run incremental sync now
npm run sync:st-full         # Run full sync now
```

---

### 2. Workflow Worker

**Container:** `st-workflow-worker`
**Command:** `npm run worker:workflows`
**Entry Point:** `scripts/start-workflow-workers.js`

#### Components

| Component | Poll Interval | Description |
|-----------|--------------|-------------|
| Event Detector | 30 seconds | Polls ST tables for changes |
| Trigger Engine | On-demand | Matches events to workflow triggers |
| Execution Engine | On-demand | Executes workflow actions |
| Install Pipeline Checker | 2 minutes | Background GHL pipeline moves |

#### Events Detected

| Event | Trigger | Actions |
|-------|---------|---------|
| `estimate_created` | New estimate in `st_estimates` | Sync to GHL, create opportunity |
| `estimate_approved` | Status changed to "Sold" | Move GHL opp to "Job Sold" |
| `estimate_rejected` | Status changed to "Dismissed" | Update GHL opp status |
| `job_created` | New job in `st_jobs` | Notify, create GHL record |
| `job_completed` | Job status = "Completed" | Trigger review request |
| `install_job_created` | New job with "Install" in BU name | Move opp to Install Pipeline |
| `invoice_created` | New invoice in `st_invoices` | Track for payment |
| `invoice_overdue` | Balance > 0 and past due date | Alert/escalate |
| `appointment_created` | New appointment | Update GHL stage |

#### Environment Variables

```bash
EVENT_POLL_INTERVAL_MS=30000          # Event detector poll interval
GHL_SYNC_ENABLED=true                 # Master GHL sync switch
GHL_AUTO_SYNC_ESTIMATES=true          # Auto-sync estimates to GHL
GHL_AUTO_SYNC_JOBS=true               # Auto-sync jobs to GHL
GHL_AUTO_SYNC_CUSTOMERS=true          # Auto-sync customers to GHL
```

#### Example: Estimate Workflow

```
1. New estimate created in ServiceTitan
   ↓
2. ST Sync Worker syncs to st_estimates table (within 5 min)
   ↓
3. Event Detector detects estimate_created (within 30 sec)
   ↓
4. If GHL_AUTO_SYNC_ESTIMATES=true:
   - Create/find GHL contact for customer
   - Create GHL opportunity in "Proposal Sent" stage
   - Set monetary value from estimate total
   ↓
5. When estimate marked "Sold" in ServiceTitan:
   - Event Detector detects estimate_approved
   - Move GHL opportunity to "Job Sold" stage
```

---

### 3. Monitoring Agent

**Container:** `st-monitoring-agent`
**Command:** `node scripts/start-self-healing-agent.js`
**Entry Point:** `src/services/monitoring/self-healing-agent.js`

#### Schedule

| Check | Interval | Default |
|-------|----------|---------|
| Health Check | Every 5 minutes | `HEALTH_CHECK_INTERVAL_MS=300000` |

#### Self-Healing Actions

| Issue Detected | Automated Fix |
|----------------|---------------|
| Sync stalled (>30 min) | Trigger manual incremental sync |
| Stalled workflows | Reset `next_action_at` to NOW() |
| Workers not running | Restart Docker containers |
| Database issues | Alert human (no auto-fix) |
| Unknown issues | AI diagnosis via Claude API |

#### AI-Powered Diagnostics

When `ANTHROPIC_API_KEY` is set, the agent uses Claude to:
- Diagnose unknown issues
- Recommend actions (restart_workers, trigger_sync, reset_workflows, alert_human)
- Only executes high-confidence recommendations

#### Example Health Check Output

```
✅ All systems healthy

-- or --

⚠️  Issues detected
   Component: sync
   Status: warning
   Details: { minutesSince: 45 }
   → Triggering manual sync...
   ✅ Manual sync completed successfully
```

---

## Sync Engines

### ServiceTitan Sync

**Location:** `src/services/sync/`

| File | Purpose |
|------|---------|
| `sync-orchestrator.js` | Coordinates all sync operations |
| `sync-scheduler.js` | Cron scheduling for syncs |
| `sync-customers.js` | Customer sync logic |
| `sync-jobs.js` | Job sync logic |
| `sync-estimates.js` | Estimate sync logic |
| `sync-appointments.js` | Appointment sync logic |
| `sync-invoices.js` | Invoice sync logic |
| `sync-reference-data.js` | Reference data sync (BUs, job types, etc.) |
| `sync-base.js` | Shared utilities and logging |

### GHL Sync

**Location:** `src/sync/ghl/ghl-sync.worker.js`

**Schedule:** Every 5 minutes (`GHL_SYNC_CRON=*/5 * * * *`)

#### Sync Steps

| Step | Description | GHL Stage |
|------|-------------|-----------|
| 1 | New ST customers → GHL contacts | Contacted |
| 2 | Jobs with appointments → stage update | Appointment Scheduled |
| 3 | Estimates → opportunity update | Proposal Sent |
| 4 | Technician assignments → custom field | (techs field) |

#### GHL Pipeline Configuration

```javascript
PIPELINE = {
  id: 'fWJfnMsPzwOXgKdWxdjC',
  name: 'SALES PIPELINE',
  stages: {
    NEW_LEAD: '3dc14ef1-7883-40d4-9831-61a313a46e0a',
    CONTACTED: '56ab4d16-e629-4315-a755-7755677e03e1',
    APPOINTMENT_SCHEDULED: 'e439d832-d8af-47a6-b459-26ed1f210f96',
    APPOINTMENT_COMPLETED_PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
    ESTIMATE_FOLLOWUP: 'de5601ac-5dbe-4980-a960-b1699b9f4a74',
    JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd',
    ESTIMATE_LOST: 'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db'
  }
}
```

---

## Workflow System

**Location:** `src/services/workflow/`

| File | Purpose |
|------|---------|
| `workflow-manager.js` | Main coordinator |
| `event-detector.js` | Polls DB for changes, emits events |
| `trigger-engine.js` | Matches events to workflow triggers |
| `execution-engine.js` | Executes workflow actions |
| `condition-evaluator.js` | Evaluates workflow conditions |
| `agent-executor.js` | Executes AI agent actions |

### Event Flow

```
Database Tables → Event Detector → Trigger Engine → Execution Engine
                      ↓                  ↓               ↓
                 (30s poll)         (event match)    (actions)
```

---

## Databases

### Database Instances

| Database | Container | Port | Purpose |
|----------|-----------|------|---------|
| `perfectcatch_automation` | postgres | 6432 | Primary automation database |
| `perfectcatch` | postgres | 6432 | Legacy/alternate |
| `ghl_oauth_proxy` | postgres | 6432 | GHL OAuth storage |
| `pricebook` | docling-postgres | 5432 | Pricebook data |
| `n8n` | n8n-postgres-1 | 5432 | n8n workflow storage |
| `supabase` | supabase-db | 5432 | Supabase platform |
| `mongodb` | mongodb | 27018 | Document storage |
| `librechat-mongo` | librechat-mongo | 27017 | LibreChat storage |

### Connection Strings

```bash
# Primary automation database
DATABASE_URL=postgresql://postgres:Catchadmin@2025@postgres:5432/perfectcatch_automation
SERVICETITAN_DATABASE_URL=postgresql://postgres:Catchadmin@2025@postgres:5432/perfectcatch_automation

# External access
MCP_DATABASE_URL=postgresql://postgres:Catchadmin@2025@localhost:6432/perfectcatch_automation

# Redis
REDIS_URL=redis://perfect-catch-redis:6379
```

---

## Database Schemas

### perfectcatch_automation Schemas

| Schema | Purpose | Table Count |
|--------|---------|-------------|
| `servicetitan` | ServiceTitan synced data | 18 tables |
| `integrations` | GHL, CallRail integrations | 5 tables |
| `automation` | Workflows, messaging | 5 tables |
| `pricebook` | Pricebook data | 11 tables |
| `public` | Scheduling, sync state, views | 72 tables/views |

### Key Tables by Schema

#### servicetitan

| Table | Description |
|-------|-------------|
| `st_customers` | Customer records |
| `st_jobs` | Job records |
| `st_estimates` | Estimates |
| `st_appointments` | Appointments |
| `st_invoices` | Invoices |
| `st_technicians` | Technicians |
| `st_business_units` | Business units |
| `st_sync_log` | Sync history |
| `job_technicians` | Job-technician assignments |

#### integrations

| Table | Description |
|-------|-------------|
| `ghl_contacts` | GHL contact records |
| `ghl_opportunities` | GHL opportunities |
| `ghl_sync_log` | GHL sync history |
| `callrail_calls` | CallRail call records |
| `callrail_conversion_log` | Conversion tracking |

#### automation

| Table | Description |
|-------|-------------|
| `workflow_definitions` | Workflow configurations |
| `workflow_instances` | Running workflow instances |
| `workflow_step_executions` | Step execution history |
| `messaging_templates` | Message templates |
| `messaging_log` | Sent messages log |

---

## NPM Scripts Reference

### Sync Commands

```bash
# ServiceTitan sync
npm run sync:st-full          # Full sync from ServiceTitan
npm run sync:st-incremental   # Incremental sync
npm run sync:reference        # Reference data only

# GHL sync
npm run ghl:sync:contacts     # Sync contacts from GHL
npm run ghl:sync:opportunities # Sync opportunities from GHL
npm run ghl:sync:estimates    # Push estimates to GHL
npm run ghl:sync:all          # Sync all from GHL

# Enhanced sync (with detailed logging)
npm run sync:customers        # Sync customers
npm run sync:jobs             # Sync jobs
npm run sync:estimates        # Sync estimates
npm run sync:invoices         # Sync invoices
npm run sync:appointments     # Sync appointments
npm run sync:technicians      # Sync technicians
```

### Worker Commands

```bash
npm run worker:sync           # Start sync scheduler
npm run worker:workflows      # Start workflow engine
npm run worker:monitor        # Start self-healing agent
```

### Utility Commands

```bash
npm run health:check          # Check system health
npm run workflow:status       # Check workflow status
npm run sync:gap-analysis     # Analyze sync gaps
npm run sync:backfill         # Backfill missing data
```

---

## Docker Compose Services

```yaml
services:
  st-automation:      # Main API server (port 3001)
  sync-worker:        # ST sync scheduler
  workflow-worker:    # Event detection & workflows
  monitoring-agent:   # Self-healing agent
```

### Start/Stop Commands

```bash
# Start all services
docker-compose up -d

# Start specific worker
docker-compose up -d sync-worker

# View logs
docker logs st-sync-worker --tail 100 -f
docker logs st-workflow-worker --tail 100 -f
docker logs st-monitoring-agent --tail 100 -f

# Restart a worker
docker-compose restart sync-worker
```

---

## Health Checks

All workers use file-based heartbeat for Docker health checks:

```bash
# Heartbeat file (updated every 30 seconds)
/tmp/worker-heartbeat

# Health check command (in docker-compose.yml)
test: ["CMD", "node", "-e", "
  const fs = require('fs');
  const stat = fs.statSync('/tmp/worker-heartbeat');
  const age = Date.now() - stat.mtimeMs;
  process.exit(age < 120000 ? 0 : 1);
"]
```

---

## Troubleshooting

### Sync Not Running

```bash
# Check sync worker logs
docker logs st-sync-worker --tail 100

# Check last sync times
docker exec postgres psql -U postgres -d perfectcatch_automation -c "
SELECT module, status, completed_at
FROM servicetitan.st_sync_log
ORDER BY completed_at DESC LIMIT 10;"

# Manually trigger sync
npm run sync:st-incremental
```

### GHL Not Syncing

```bash
# Check GHL sync log
docker exec postgres psql -U postgres -d perfectcatch_automation -c "
SELECT * FROM integrations.ghl_sync_log
ORDER BY completed_at DESC LIMIT 5;"

# Check environment variables
docker exec st-workflow-worker env | grep GHL
```

### Workflow Not Processing Events

```bash
# Check workflow worker logs
docker logs st-workflow-worker --tail 100

# Check event detector poll interval
docker exec st-workflow-worker env | grep EVENT_POLL_INTERVAL_MS
```

---

*Last Updated: 2025-12-19*
