# CRM Pipeline Sync Integration

## Overview

The CRM Pipeline Sync provides bidirectional synchronization between ServiceTitan and the Perfect Catch CRM (Payload CMS). This integration replicates the GoHighLevel (GHL) sync logic exactly, ensuring consistent pipeline tracking across systems.

**Implemented:** December 21-22, 2024

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   ServiceTitan      │────▶│   ST Automation      │────▶│   Perfect Catch     │
│   (Source of Truth) │     │   (Sync Worker)      │     │   CRM (Payload)     │
│                     │◀────│                      │◀────│                     │
│   - Customers       │     │   - crm.* schema     │     │   - Contacts        │
│   - Jobs            │     │   - API Client       │     │   - Opportunities   │
│   - Estimates       │     │   - Webhooks         │     │   - Pipelines       │
│   - Appointments    │     │                      │     │   - Pipeline Stages │
└─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

## Sync Logic (Replicates GHL Exactly)

### Business Unit → Pipeline Mapping

| Business Unit | Pipeline |
|--------------|----------|
| Pool - Sales | Sales Pipeline |
| Pool - Service | Sales Pipeline |
| Pool - Install | Install Pipeline |
| Electrical - Sales | Sales Pipeline |
| Electrical - Service | Sales Pipeline |
| Electrical - Install | Install Pipeline |

### Sales Pipeline Stages

| Order | Stage | Trigger |
|-------|-------|---------|
| 1 | New Lead | Initial lead creation |
| 2 | Contacted | New ST customer synced |
| 3 | Appointment Scheduled | Job has scheduled appointment |
| 4 | Proposal Sent | Estimate created with $ value |
| 5 | Estimate Follow-up | Manual stage for follow-up |
| 6 | Job Sold | Estimate marked as "Sold" |
| 7 | Estimate Lost | Estimate marked as "Dismissed" |

### Install Pipeline Stages

| Order | Stage | Trigger |
|-------|-------|---------|
| 1 | Estimate Approved / Job Created | Install job created |
| 2 | Pre-Install Planning / Permitting | Manual planning stage |
| 3 | Scheduled / Ready for Install | Job status "Scheduled" |
| 4 | In Progress / On Site | Job status "Working" |
| 5 | On Hold / Return Visit Needed | Job status "Hold" |
| 6 | Job Completed | Job status "Completed" |

## Sync Worker Steps

The sync worker runs every 5 minutes (configurable via `CRM_SYNC_CRON`):

### Step 1: New Customers → Contacted Stage
- Finds ST customers with jobs from last 14 days
- Creates CRM contact with name, email, phone, address
- Creates opportunity in "Contacted" stage
- Sets pipeline based on business unit

### Step 2: Appointments → Appointment Scheduled Stage
- Finds opportunities in "Contacted" stage
- Checks if associated job has appointments
- Moves to "Appointment Scheduled" stage

### Step 3: Estimates → Proposal Sent Stage
- Finds estimates with monetary value
- Updates opportunity title with estimate name and $ value
- Moves to "Proposal Sent" stage
- **Respects protected stages** - never moves backward from Job Sold/Estimate Lost

### Step 4: Sold Estimates → Job Sold Stage
- Finds estimates with status "Sold"
- Moves opportunity to "Job Sold" stage
- Marks opportunity as "won"

### Step 5: Install Jobs → Install Pipeline
- Finds customers with install business unit jobs
- Moves opportunity from Sales to Install Pipeline
- Sets to "Estimate Approved" stage

### Step 6: Job Status → Install Pipeline Stages
- Maps ST job status to Install Pipeline stage
- Updates opportunity stage based on job progress

## Files Created/Modified

### ST Automation

| File | Purpose |
|------|---------|
| `src/sync/crm/crm-sync.worker.js` | Main sync worker with 6-step logic |
| `src/integrations/crm/crm-api-client.js` | Payload CMS API client |
| `src/config/crm-pipelines.js` | Pipeline/stage configuration |
| `src/db/migrations/011_crm_sync.sql` | Database schema for sync tracking |
| `src/routes/crm.routes.js` | API routes for sync control |

### CRM (Payload)

| File | Purpose |
|------|---------|
| `src/collections/Opportunities.ts` | Updated with ST integration fields |
| `src/collections/Activities.ts` | Added contact_created, assignment_changed types |
| `src/seed/seed-st-pipelines.ts` | Seeds Sales and Install pipelines |
| `src/endpoints/webhooks/st-automation.ts` | Webhook handlers for ST events |
| `src/hooks/opportunity-st-sync-hooks.ts` | Opportunity change hooks |

## Database Schema

### crm.crm_contacts
Tracks CRM contacts synced from ST customers.

```sql
- id (UUID)
- crm_id (Payload ID)
- st_customer_id (ServiceTitan ID)
- first_name, last_name, email, phone
- sync_status ('pending', 'synced', 'failed')
- last_synced_at
```

### crm.crm_opportunities
Tracks CRM opportunities with pipeline/stage info.

```sql
- id (UUID)
- crm_id (Payload ID)
- st_customer_id, st_job_id, st_estimate_id
- crm_pipeline_slug ('sales', 'install')
- crm_stage_slug ('contacted', 'proposal-sent', etc.)
- monetary_value
- status ('open', 'won', 'lost')
- sync_status, last_synced_at
```

### crm.crm_sync_log
Audit trail of sync operations.

```sql
- sync_type ('incremental', 'full')
- direction ('st_to_crm', 'crm_to_st')
- status ('started', 'completed', 'failed')
- records_created, records_updated, records_failed
- duration_ms
```

### Useful Views

```sql
-- Sync status summary
SELECT * FROM crm.v_sync_status;

-- Recent sync activity
SELECT * FROM crm.v_recent_activity;

-- Pipeline distribution
SELECT * FROM crm.v_pipeline_distribution;
```

## API Endpoints

### ST Automation

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/crm/sync/trigger` | POST | Manually trigger sync |
| `/api/crm/sync/status` | GET | Get sync status and logs |
| `/api/crm/sync/stats` | GET | Get pipeline distribution stats |

### CRM Webhooks

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/st-automation` | POST | Receive ST events |
| `/api/webhooks/st-automation/health` | GET | Health check |

## Environment Variables

### ST Automation
```env
CRM_SYNC_ENABLED=true
CRM_SYNC_CRON=*/5 * * * *
CRM_API_URL=http://localhost:3005
CRM_WEBHOOK_SECRET=your-secret
```

### CRM
```env
ST_AUTOMATION_URL=http://localhost:3001
ST_AUTOMATION_WEBHOOK_SECRET=your-secret
```

## Running the Sync

### Automatic (Scheduled)
The sync runs automatically every 5 minutes when `CRM_SYNC_ENABLED=true`.

### Manual Trigger
```bash
# Via API
curl -X POST http://localhost:3001/api/crm/sync/trigger

# Direct worker
cd st-automation
node src/sync/crm/crm-sync.worker.js
```

### Seed Pipelines
```bash
cd crm/packages/payload
npx ts-node src/seed/seed-st-pipelines.ts
```

## Sync Results (Initial Run)

From December 22, 2024 initial sync:
- **450 contacts** synced from ST customers
- **91 opportunities** created with correct pipeline distribution:
  - Install Pipeline: 16 opportunities
  - Sales Pipeline (Contacted): 37 opportunities
  - Sales Pipeline (Proposal Sent): 38 opportunities

## Troubleshooting

### Common Issues

1. **"businessUnit" column not found**
   - The Payload CMS uses `push: false` to avoid enum conflicts
   - Manually add columns if needed

2. **Enum conflicts**
   - Keep `push: false` in postgres adapter config
   - Use migrations for schema changes

3. **Rate limiting**
   - Worker has 150ms delay between API calls
   - Adjust if needed for large syncs

### Logs

```bash
# ST Automation logs
cd st-automation && npm run dev

# Look for "[crm-sync-worker]" entries
```

## Future Enhancements

- [ ] Real-time webhooks for immediate updates
- [ ] CRM → ST sync (stage changes trigger ST updates)
- [ ] Technician assignment sync
- [ ] Pricebook push from CRM to ST
