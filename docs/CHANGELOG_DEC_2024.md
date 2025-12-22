# Changelog - December 2024

## December 21-22, 2024

### CRM Pipeline Sync Implementation

Complete implementation of bidirectional sync between ServiceTitan and Perfect Catch CRM (Payload CMS), replicating the GoHighLevel sync logic exactly.

#### New Features

1. **CRM Sync Worker** (`src/sync/crm/crm-sync.worker.js`)
   - 6-step sync process matching GHL logic
   - Business unit → pipeline mapping
   - Protected stages (Job Sold, Estimate Lost)
   - 5-minute scheduled sync with cron

2. **CRM API Client** (`src/integrations/crm/crm-api-client.js`)
   - Axios-based client for Payload CMS API
   - Contact and opportunity CRUD operations
   - Pipeline and stage queries

3. **Pipeline Configuration** (`src/config/crm-pipelines.js`)
   - Sales Pipeline with 7 stages
   - Install Pipeline with 6 stages
   - Business unit mappings
   - Stage utility functions

4. **Database Migration** (`src/db/migrations/011_crm_sync.sql`)
   - New `crm` schema for sync tracking
   - `crm_contacts` table for contact sync
   - `crm_opportunities` table for opportunity sync
   - `crm_sync_log` table for audit trail
   - `crm_pipeline_mapping` for stage mappings
   - `crm_webhook_events` for incoming events
   - Utility functions and views

5. **CRM Updates**
   - Added ServiceTitan fields to Opportunities collection
   - Created pipeline seed script
   - Added ST automation webhook handlers
   - Updated Activities with new type options

#### Files Created

```
st-automation/
├── src/
│   ├── sync/crm/
│   │   └── crm-sync.worker.js          # Main sync worker
│   ├── integrations/crm/
│   │   └── crm-api-client.js           # Payload API client
│   ├── config/
│   │   └── crm-pipelines.js            # Pipeline configuration
│   └── db/migrations/
│       └── 011_crm_sync.sql            # Database schema

crm/packages/payload/
├── src/
│   ├── seed/
│   │   └── seed-st-pipelines.ts        # Pipeline seeder
│   ├── endpoints/webhooks/
│   │   └── st-automation.ts            # Webhook handlers
│   └── hooks/
│       └── opportunity-st-sync-hooks.ts # Opportunity hooks
```

#### Files Modified

```
st-automation/
├── src/routes/index.js                 # Added CRM routes
└── src/app.js                          # Registered CRM sync

crm/packages/payload/
├── src/collections/Opportunities.ts    # Added ST fields
├── src/collections/Activities.ts       # Added type options
├── src/endpoints/index.ts              # Exported webhooks
└── src/payload.config.ts               # Registered endpoints
```

#### Database Changes

New `crm` schema with tables:
- `crm.crm_contacts` - Contact sync tracking
- `crm.crm_opportunities` - Opportunity sync tracking
- `crm.crm_sync_log` - Sync audit log
- `crm.crm_pipeline_mapping` - ST → CRM stage mapping
- `crm.crm_webhook_events` - Incoming webhook log
- `crm.crm_stage_history` - Stage change history

New views:
- `crm.v_sync_status` - Overall sync status
- `crm.v_recent_activity` - Recent sync operations
- `crm.v_pipeline_distribution` - Pipeline statistics

#### Configuration

New environment variables:
```env
CRM_SYNC_ENABLED=true
CRM_SYNC_CRON=*/5 * * * *
CRM_API_URL=http://localhost:3005
CRM_WEBHOOK_SECRET=your-secret
```

#### Results

Initial sync completed successfully:
- 450 contacts synced
- 91 opportunities created
- Correct pipeline distribution:
  - Install Pipeline: 16
  - Sales Pipeline (Contacted): 37
  - Sales Pipeline (Proposal Sent): 38

---

### Salesforce Integration (Prior to CRM Sync)

Added Salesforce integration for customer sync.

#### Files Created
- `src/integrations/salesforce/` - Complete Salesforce integration
- `src/routes/salesforce.routes.js` - Salesforce API routes
- `docs/integrations/Salesforce/` - Salesforce documentation

---

### ServiceTitan Sync Workers (Prior)

Refactored ServiceTitan sync into modular workers.

#### Files Created
- `src/workers/servicetitan-sync/fetchers/` - Data fetchers by category
- `src/workers/servicetitan-sync/mergers/` - Data merge logic
- `src/workers/servicetitan-sync/sync-customer-contacts.js` - Customer contact sync

---

### Local Development Setup (Prior)

Added local development tools.

#### Files Created
- `docker-compose.local.yml` - Local Docker setup
- `scripts/local-setup.sh` - Setup script

---

## Summary

Major milestone achieved with CRM Pipeline Sync:
- Full replication of GHL sync logic
- Bidirectional sync infrastructure
- Comprehensive audit logging
- Webhook handlers for real-time updates
- Production-ready with error handling and rate limiting
