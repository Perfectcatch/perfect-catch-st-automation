# Job Sync Modernization Implementation Guide

## Overview

This guide walks through replacing Airtable with PostgreSQL in your ServiceTitan → GoHighLevel job sync workflow.

### **Key Improvements**

1. ✅ **Eliminated Airtable dependency** - All data in PostgreSQL
2. ✅ **Streamlined workflow** - Fewer nodes, cleaner logic
3. ✅ **Better audit trail** - sync_logs table tracks every sync
4. ✅ **Sync state management** - Database-backed state tracking
5. ✅ **Idempotent upserts** - Safe to re-run without duplicates
6. ✅ **GHL sync tracking** - Know exactly which jobs synced successfully
7. ✅ **Business unit filtering** - Database-driven pipeline routing

---

## Architecture Comparison

### **OLD WORKFLOW (Airtable)**
```
Schedule → n8n DataTable → Get Jobs → Split → 
  Airtable Search Customer → Airtable Upsert Job → 
  JavaScript Merge → Filter BU → GHL Webhook
```

**Problems:**
- 3 external dependencies (n8n DataTable, Airtable x2, GHL)
- No audit trail
- Manual conflict resolution
- Customer data scattered across systems
- No GHL sync status tracking

### **NEW WORKFLOW (PostgreSQL)**
```
Schedule → Get Sync State → Get Jobs → Split → 
  Get Customer → Get Location → Merge → 
  Upsert to DB → Filter BU → GHL Webhook → 
  Mark Synced → Update Sync State → Log Completion
```

**Benefits:**
- Single source of truth (PostgreSQL)
- Complete audit trail (sync_logs)
- Automatic conflict resolution (upsert functions)
- GHL sync status per job
- Business unit configuration in DB

---

## Implementation Steps

### **Phase 1: Database Setup**

#### 1.1 Create the Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE perfectcatch_automation;

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE perfectcatch_automation TO your_user;
```

#### 1.2 Run the Schema

```bash
# Run the schema file
psql -U your_user -d perfectcatch_automation -f job-sync-schema.sql

# Verify tables created
psql -U your_user -d perfectcatch_automation -c "\dt"
```

Expected output:
```
              List of relations
 Schema |      Name       | Type  |  Owner   
--------+-----------------+-------+----------
 public | business_units  | table | your_user
 public | customers       | table | your_user
 public | jobs            | table | your_user
 public | sync_logs       | table | your_user
 public | sync_state      | table | your_user
```

#### 1.3 Verify Functions

```bash
psql -U your_user -d perfectcatch_automation -c "\df"
```

Expected functions:
- `update_sync_state()`
- `get_last_job_pull()`
- `upsert_job_from_st()`

---

### **Phase 2: ServiceTitan Proxy Update**

#### 2.1 Add Environment Variables

```bash
# Edit your .env file
DATABASE_URL=postgresql://user:password@postgres:5432/perfectcatch_automation
DATABASE_MAX_CONNECTIONS=20
```

#### 2.2 Install Database Dependencies

```bash
cd /opt/perfectcatch-st-automation
npm install pg
```

#### 2.3 Add Database Service

Copy `database.service.js` to `/opt/perfectcatch-st-automation/src/services/database.js`

#### 2.4 Add Database Routes

Copy `db-sync.routes.js` to `/opt/perfectcatch-st-automation/src/routes/db-sync.routes.js`

#### 2.5 Update Main Router

Edit `/opt/perfectcatch-st-automation/src/routes/index.js`:

```javascript
import dbSyncRoutes from './db-sync.routes.js';

// ... existing routes

// Database sync routes (NEW)
router.use('/db', dbSyncRoutes);
```

#### 2.6 Test Database Connection

```bash
# Restart the service
docker-compose restart servicetitan-api

# Test connection
curl http://localhost:3001/db/sync-state
```

Expected response:
```json
[
  {
    "id": "...",
    "key": "lastJobPull",
    "value": "2025-01-01T00:00:00Z",
    "metadata": {...},
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

### **Phase 3: n8n Workflow Migration**

#### 3.1 Import New Workflow

1. Open n8n dashboard
2. Click **Workflows** → **Import from File**
3. Upload `get-jobs-modernized-v2.json`
4. Review the imported workflow

#### 3.2 Update GHL Webhook URLs

Find these nodes and update webhook URLs:
- **Push to GHL: Sales & Service** (keep existing URL)
- **Push to GHL: Install** (update with correct Install webhook URL)

Current Sales & Service URL:
```
https://services.leadconnectorhq.com/hooks/kgnEweBlJ8Uq11kNc3Xs/webhook-trigger/daf74170-7f02-45bd-af45-ae5c6c687f18
```

You need to add the Install webhook URL (replace `INSTALL_WEBHOOK_ID`).

#### 3.3 Test the Workflow

1. Click **Test workflow** button
2. Manually trigger the schedule
3. Watch the execution flow
4. Verify each node completes successfully

#### 3.4 Verify Database Updates

```bash
# Check if jobs were inserted
psql -U your_user -d perfectcatch_automation -c "SELECT COUNT(*) FROM jobs;"

# Check sync logs
psql -U your_user -d perfectcatch_automation -c "SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 5;"

# Check sync state
psql -U your_user -d perfectcatch_automation -c "SELECT * FROM sync_state WHERE key = 'lastJobPull';"
```

---

### **Phase 4: Business Unit Configuration**

#### 4.1 Review Business Units

```bash
curl http://localhost:3001/db/business-units
```

#### 4.2 Add Additional Business Units (if needed)

```sql
INSERT INTO business_units (st_business_unit_id, name, ghl_pipeline_name, sync_enabled) 
VALUES (12345, 'New Business Unit', 'New Pipeline', TRUE);
```

#### 4.3 Update Workflow Filters

Edit the workflow to dynamically filter by enabled business units instead of hardcoded IDs:

**Replace hardcoded filters with:**
```javascript
// In "Filter: Sales & Service" node
const businessUnits = await $httpRequest({
  method: 'GET',
  url: 'http://servicetitan-api:3001/db/business-units?syncEnabled=true'
});

const salesServiceBU = businessUnits.find(bu => bu.name === 'Sales & Service');
return $json.businessUnitId === salesServiceBU.st_business_unit_id;
```

---

### **Phase 5: Migration from Airtable**

#### 5.1 Export Existing Airtable Data (Optional)

If you want to preserve historical data:

1. Export Airtable **Customer Records** → CSV
2. Export Airtable **Jobs** → CSV
3. Create migration script (see below)

#### 5.2 Airtable Migration Script

```javascript
// migrate-airtable-to-postgres.js
import fs from 'fs';
import csv from 'csv-parser';
import fetch from 'node-fetch';

const customersCsvPath = './airtable-customers.csv';
const jobsCsvPath = './airtable-jobs.csv';

async function migrateCustomers() {
  const customers = [];
  
  fs.createReadStream(customersCsvPath)
    .pipe(csv())
    .on('data', (row) => {
      customers.push({
        customer: {
          customerId: row['ST ID'],
          locationId: row['Location ID'],
          firstName: row['First Name'],
          lastName: row['Last Name'],
          email: row['Email'],
          phone: row['Phone'],
          address: {
            street: row['Street'],
            city: row['City'],
            state: row['State'],
            zip: row['Postal Code'],
            county: row['County']
          }
        }
      });
    })
    .on('end', async () => {
      console.log(`Migrating ${customers.length} customers...`);
      
      for (const customer of customers) {
        try {
          await fetch('http://localhost:3001/db/customers/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customer)
          });
        } catch (error) {
          console.error(`Failed to migrate customer ${customer.customer.customerId}:`, error);
        }
      }
      
      console.log('Customer migration complete');
    });
}

// Run migration
migrateCustomers();
```

#### 5.3 Verify Migration

```sql
-- Check counts match
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM jobs;

-- Sample some records
SELECT * FROM customers LIMIT 10;
SELECT * FROM jobs LIMIT 10;
```

#### 5.4 Disable Old Workflow

1. In n8n, deactivate the old Airtable workflow
2. Keep it for 1 week as backup
3. Delete after confirming new workflow is stable

---

### **Phase 6: Monitoring & Observability**

#### 6.1 Create Monitoring Dashboard

Query sync statistics:
```sql
SELECT * FROM sync_statistics;
```

#### 6.2 Set Up Alerts

Create a n8n workflow to monitor failures:

```javascript
// Check for failed syncs in last hour
SELECT * FROM sync_logs 
WHERE status = 'failed' 
  AND started_at > NOW() - INTERVAL '1 hour';
```

If any found, send Slack/email alert.

#### 6.3 Regular Health Checks

```bash
# Cron job to check database health
0 * * * * curl http://localhost:3001/db/sync-logs/statistics | mail -s "Sync Stats" admin@example.com
```

---

## API Endpoint Reference

### **Sync State Management**

```bash
# Get last job pull timestamp
GET /db/sync-state/lastJobPull

# Update sync state
PUT /db/sync-state/lastJobPull
Body: {
  "value": "2025-12-14T12:00:00Z",
  "metadata": { "jobsProcessed": 42 }
}

# Get all sync states
GET /db/sync-state
```

### **Job Management**

```bash
# Upsert single job
POST /db/jobs/upsert
Body: {
  "job": { /* ST job data */ },
  "customer": { /* ST customer data */ }
}

# Batch upsert jobs
POST /db/jobs/upsert-batch
Body: {
  "jobs": [
    { "job": {...}, "customer": {...} },
    { "job": {...}, "customer": {...} }
  ]
}

# Get pending GHL sync jobs
GET /db/jobs/pending-ghl-sync?businessUnitId=1314&limit=100

# Update job GHL sync status
PATCH /db/jobs/:stJobId/ghl-sync
Body: {
  "status": "synced",
  "opportunityId": "GHL-123",
  "error": null
}

# Get specific job
GET /db/jobs/:stJobId
```

### **Customer Management**

```bash
# Get customer
GET /db/customers/:stCustomerId

# Update customer GHL sync status
PATCH /db/customers/:stCustomerId/ghl-sync
Body: {
  "status": "synced",
  "contactId": "GHL-CONTACT-456"
}
```

### **Sync Logging**

```bash
# Create sync log
POST /db/sync-logs
Body: {
  "syncType": "job_pull",
  "status": "completed",
  "recordsProcessed": 50,
  "recordsSucceeded": 48,
  "recordsFailed": 2,
  "workflowExecutionId": "n8n-exec-123",
  "durationMs": 15000
}

# Get sync logs
GET /db/sync-logs?syncType=job_pull&status=completed&limit=20

# Get sync statistics
GET /db/sync-logs/statistics
```

### **Business Units**

```bash
# Get all business units
GET /db/business-units

# Get enabled business units only
GET /db/business-units?syncEnabled=true

# Get specific business unit
GET /db/business-units/:stBusinessUnitId
```

---

## Workflow Diagram (Visual)

```
┌─────────────────────┐
│  Schedule Trigger   │  Every 5 minutes
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get Sync State (DB) │  Get lastJobPull timestamp
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Get Jobs from ST   │  ?createdOnOrAfter={lastJobPull}
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│     Split Jobs      │  Process each job individually
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Get Customer (ST)  │  Fetch full customer details
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Get Location (ST)  │  Fetch location/address details
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Merge Job Data    │  Combine job + customer + location
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Upsert to Database │  Store in PostgreSQL
└──────────┬──────────┘
           │
           ├─────────────────┬─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐     ┌──────────┐
    │Filter: S&S│      │Filter:   │     │Filter:   │
    │   (1314) │      │  Install │     │  Pool    │
    └─────┬────┘      │(54670601)│     │  (4622)  │
          │           └─────┬────┘     └─────┬────┘
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐     ┌──────────┐
    │Push to   │      │Push to   │     │Push to   │
    │GHL: S&S  │      │GHL:Install│     │GHL: Pool │
    └─────┬────┘      └─────┬────┘     └─────┬────┘
          │                 │                 │
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐     ┌──────────┐
    │Mark      │      │Mark      │     │Mark      │
    │Synced    │      │Synced    │     │Synced    │
    └─────┬────┘      └─────┬────┘     └─────┬────┘
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │Prepare Sync State     │
                │Update (get latest     │
                │job timestamp)         │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │Update Sync State (DB) │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │Log Sync Completion    │
                │(audit trail)          │
                └───────────────────────┘
```

---

## Troubleshooting

### **Jobs not syncing**

```bash
# Check sync state
curl http://localhost:3001/db/sync-state/lastJobPull

# Check for errors in sync logs
curl http://localhost:3001/db/sync-logs?status=failed
```

### **Database connection errors**

```bash
# Test database connectivity
docker-compose exec servicetitan-api node -e "
  import db from './src/services/database.js';
  db.testConnection().then(console.log);
"

# Check PostgreSQL logs
docker-compose logs postgres
```

### **GHL webhook failures**

```sql
-- Find jobs that failed to sync to GHL
SELECT * FROM jobs 
WHERE ghl_sync_status = 'failed' 
ORDER BY updated_at DESC 
LIMIT 20;
```

### **Duplicate jobs**

Jobs cannot be duplicated due to UNIQUE constraint on `st_job_id`. If you see errors about duplicates, the upsert will handle it gracefully.

---

## Next Steps

1. ✅ **Implement Phase 1-6** following this guide
2. ✅ **Monitor for 1 week** to ensure stability
3. ✅ **Add additional business units** as needed
4. ✅ **Extend sync to other entities** (estimates, invoices, appointments)
5. ✅ **Build admin dashboard** to visualize sync health

---

## Files Created

1. `job-sync-schema.sql` - PostgreSQL schema
2. `db-sync.routes.js` - API routes for database sync
3. `database.service.js` - Database connection service
4. `get-jobs-modernized-v2.json` - n8n workflow
5. `IMPLEMENTATION_GUIDE.md` - This file
