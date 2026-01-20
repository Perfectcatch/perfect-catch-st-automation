# ST-Automation Current State Audit

**Generated:** 2026-01-20
**Purpose:** Document current architecture before refactoring

---

## 1. Directory Structure Overview

```
src/
├── app.js                    # Express app setup (272 lines)
├── server.js                 # Entry point (123 lines)
├── config/                   # Configuration modules
├── controllers/              # Controller layer
├── chat/                     # AI chat functionality
├── db/
│   ├── migrations/           # SQL migration files (11 files)
│   └── prisma.js             # Prisma client
├── integrations/
│   ├── crm/                  # CRM API client
│   ├── ghl/                  # GHL integration (4 files)
│   ├── salesforce/           # Salesforce integration
│   └── slack/                # Slack bot integration
├── lib/                      # Shared utilities
├── middleware/               # Express middleware
├── routes/                   # API routes (28 files)
├── scrapers/                 # Price scrapers
├── services/
│   ├── monitoring/           # Health monitoring
│   ├── sync/                 # Sync services (14+ files)
│   └── workflow/             # Workflow engine
├── sync/
│   ├── crm/                  # CRM sync worker
│   ├── ghl/                  # GHL sync worker
│   ├── pricebook/            # Pricebook sync engine
│   └── scheduling/           # Scheduling sync engine
└── workers/
    ├── base-worker.js        # Heartbeat only (106 lines)
    └── servicetitan-sync/    # ST sync workers
```

---

## 2. Route Files Analysis

### Files Over 200 Lines (Need Splitting)

| File | Lines | Endpoints | Priority |
|------|-------|-----------|----------|
| scheduling.routes.js | 944 | ~20 | HIGH |
| db-sync.routes.js | 851 | ~25 | HIGH |
| pricebook.routes.js | 720 | ~15 | HIGH |
| crm.routes.js | 623 | ~18 | HIGH |
| ghl.routes.js | 418 | ~10 | MEDIUM |
| images.routes.js | 314 | ~8 | MEDIUM |
| monitor.routes.js | 256 | ~6 | MEDIUM |
| vapi.routes.js | 231 | ~5 | LOW |
| salesforce.routes.js | 229 | ~6 | LOW |
| slack.routes.js | 209 | ~8 | LOW |

### Current Route Structure

```javascript
// src/routes/index.js - Mounts 24 route modules:
router.use('/', healthRoutes);           // Health checks
router.use('/jobs', jobsRoutes);         // ST jobs
router.use('/customers', customersRoutes);
router.use('/estimates', estimatesRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/accounting', accountingRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/pricebook', pricebookRoutes);
router.use('/payroll', payrollRoutes);
router.use('/settings', settingsRoutes);
router.use('/equipment', equipmentRoutes);
router.use('/jbce', jbceRoutes);
router.use('/forms', formsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/jpm', jpmRoutes);
router.use('/marketing', marketingRoutes);
router.use('/marketing-ads', marketingadsRoutes);
router.use('/reporting', reportingRoutes);
router.use('/task-management', taskmanagementRoutes);
router.use('/telecom', telecomRoutes);
router.use('/timesheets', timesheetsRoutes);
router.use('/chat', pricebookChatRoutes);
router.use('/images', imagesRoutes);
router.use('/scrapers', scrapersRoutes);
router.use('/vapi', vapiRoutes);
router.use('/db', dbSyncRoutes);
router.use('/slack', slackRoutes);
router.use('/scheduling', schedulingRoutes);
router.use('/ghl', ghlRoutes);
router.use('/crm', crmRoutes);
router.use('/api/monitor', monitorRoutes);
```

---

## 3. Sync/Worker Files Analysis

### Files Over 200 Lines (Need Refactoring)

| File | Lines | Purpose |
|------|-------|---------|
| crm-sync.worker.js | 816 | CRM pipeline sync |
| ghl-sync.worker.js | 711 | GHL bidirectional sync |
| scheduling-sync.engine.js | 593 | Scheduling data sync |
| pricebook-sync.engine.js | 416 | Pricebook sync |
| conflict-resolver.js | 326 | Pricebook conflicts |
| sync.controller.js | 292 | Pricebook sync controller |

### Current Sync Architecture

```
src/sync/
├── crm/
│   ├── index.js              # Scheduler exports
│   └── crm-sync.worker.js    # Full CRM sync logic (816 lines)
├── ghl/
│   ├── index.js              # Scheduler exports
│   └── ghl-sync.worker.js    # Full GHL sync logic (711 lines)
├── pricebook/
│   ├── index.js              # Module exports
│   ├── pricebook-sync.engine.js
│   ├── sync.controller.js
│   ├── sync-scheduler.js
│   ├── conflict-resolver.js
│   ├── fetchers/             # ST data fetchers
│   ├── comparators/          # Change detection
│   └── appliers/             # Apply changes
└── scheduling/
    ├── index.js
    ├── scheduling-sync.engine.js
    ├── scheduling-sync.controller.js
    ├── scheduling-sync.scheduler.js
    ├── fetchers/
    ├── comparators/
    └── appliers/
```

---

## 4. GHL Integration Current State

### Files

```
src/integrations/ghl/
├── index.js                      # 86 lines - exports
├── sync-estimate-to-ghl.js       # 522 lines - push estimates
├── sync-contacts-from-ghl.js     # 436 lines - pull contacts
├── sync-opportunities-from-ghl.js # 408 lines - pull opportunities
└── move-to-install-pipeline.js   # 216 lines - pipeline moves
```

### Current GHL Functions

**Push to GHL:**
- `syncEstimateToGHL(estimateId)` - Create/update opportunity from ST estimate
- `syncCustomerToGHL(customerId)` - Create contact in GHL
- `moveOpportunityToJobSold(opportunityId)` - Move to Job Sold stage
- `moveOpportunityToInstallPipeline()` - Move to Install Pipeline

**Pull from GHL:**
- `syncContactsFromGHL()` - Pull all contacts
- `syncOpportunitiesFromGHL()` - Pull all opportunities

**Missing/Needed:**
- Webhook handlers for real-time GHL events
- Stage change event handling
- Contact update callbacks
- Rate limiting and retry logic

---

## 5. Database Schema

### Schemas

| Schema | Purpose |
|--------|---------|
| `servicetitan` | ST synced data (customers, jobs, estimates, etc.) |
| `integrations` | GHL data (contacts, opportunities, sync logs) |
| `pricebook` | Pricebook items (services, materials, equipment) |
| `scheduling` | Scheduling data (technicians, teams, zones) |
| `public` | App tables (workflows, callrail, messaging) |

### Key Tables

**integrations schema:**
- `ghl_contacts` - GHL contact mirror
- `ghl_opportunities` - GHL opportunity mirror
- `ghl_sync_log` - Sync execution logs
- `ghl_sync_controls` - Sync enable/disable flags

**servicetitan schema:**
- `st_customers` - Customer data
- `st_jobs` - Job data
- `st_estimates` - Estimate data
- `st_invoices` - Invoice data
- `st_technicians` - Technician data
- `st_business_units` - Business unit config

### Migrations (11 total)

1. `001_pricebook_schema.sql` - Pricebook tables
2. `002_servicetitan_complete.sql` - ST core tables
3. `003_workflow_engine.sql` - Workflow system
4. `004_callrail_tracking.sql` - Call tracking
5. `005_messaging_system.sql` - Messaging
6. `006_ghl_and_employees.sql` - GHL & employees
7. `007_sync_enrichment.sql` - Sync enhancements
8. `008_ghl_sync_controls.sql` - Sync controls
9. `009_scheduling_schema.sql` - Scheduling
10. `010_cleanup_st_customers.sql` - Data cleanup
11. `011_crm_sync.sql` - CRM sync tables

---

## 6. Current Schedulers

### Active Schedulers

| Scheduler | Schedule | File |
|-----------|----------|------|
| GHL Sync | Every 5 min | `src/sync/ghl/ghl-sync.worker.js` |
| CRM Sync | Every 5 min | `src/sync/crm/crm-sync.worker.js` |
| Pricebook Sync | 4am daily | `src/sync/pricebook/sync-scheduler.js` |
| Scheduling Sync | 3am daily | `src/sync/scheduling/scheduling-sync.scheduler.js` |

### Environment Controls

```bash
GHL_SYNC_ENABLED=true|false     # Enable GHL sync
CRM_SYNC_ENABLED=true|false     # Enable CRM sync
SYNC_SCHEDULER_ENABLED=true|false  # Enable pricebook sync
SCHEDULING_SYNC_ENABLED=true|false # Enable scheduling sync
```

---

## 7. Entry Points

### Main Server (src/server.js)

- Loads config
- Starts Express app
- Dynamically loads GHL sync scheduler
- Dynamically loads CRM sync scheduler
- Handles graceful shutdown

### App Setup (src/app.js)

- Configures middleware (JSON, rate limit, CORS)
- Mounts routes at `/`
- Conditionally mounts sync routes (`/api/sync/*`)
- Conditionally mounts Salesforce routes
- Error handling

---

## 8. Issues Identified

### High Priority

1. **Monolithic route files** - Files over 800 lines are unmaintainable
2. **No worker base class** - Current base-worker.js is heartbeat only
3. **Inconsistent sync patterns** - Each sync uses different patterns
4. **No centralized scheduler** - Schedulers scattered across files
5. **GHL webhooks missing** - No real-time event handling

### Medium Priority

1. **Mixed database patterns** - Some use Prisma, some use pg Pool
2. **No sync state tracking** - Limited visibility into sync progress
3. **No worker run history** - Can't see past execution results
4. **Limited error recovery** - Manual intervention required

### Low Priority

1. **Backup files in sync folder** - `backup_20251216/` should be removed
2. **Duplicate sync services** - Both `sync-customers.js` and `sync-customers-enhanced.js`
3. **Documentation gaps** - API docs incomplete

---

## 9. Refactoring Plan

### Phase 1: ✅ Audit (Complete)

### Phase 2: Route Refactoring
- Split large route files into one-file-per-endpoint
- Create route aggregators
- Add asyncHandler wrapper

### Phase 3: Worker Refactoring
- Create proper BaseWorker class with logging
- Create worker registry
- Implement centralized scheduler

### Phase 4: GHL Integration
- Add webhook handlers
- Create field mappings
- Implement rate limiting

### Phase 5: Database Schema
- Add worker_runs table
- Add worker_logs table
- Add sync_events audit table

### Phase 6: Server Entry Point
- Centralize worker startup
- Add worker management endpoints

### Phase 7: Verification
- Test all routes
- Test all workers
- Verify GHL sync flow

---

## 10. File Counts

```
Routes:          28 files, 6,176 total lines
Sync:            39 files, 6,847 total lines
Workers:         19 files, 4,763 total lines
Services:        45 files, 8,234 total lines
Integrations:    14 files, 4,547 total lines
```

**Total source files:** ~145
**Total lines of code:** ~30,500
