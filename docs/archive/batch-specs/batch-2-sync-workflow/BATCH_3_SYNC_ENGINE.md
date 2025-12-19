# 🔄 BATCH 3: SERVICETITAN SYNC ENGINE

## Overview

Populate all 15 ServiceTitan tables with real data from the ST API. Supports full sync (initial load) and incremental sync (every 5 minutes).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Sync Orchestrator                           │
│  Coordinates all sync operations, manages order & deps      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────┴─────────────────┐
         │                                    │
         ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│  Reference Data  │              │  Transactional   │
│  (First)         │              │  Data (Second)   │
├──────────────────┤              ├──────────────────┤
│ • Business Units │              │ • Customers      │
│ • Technicians    │              │ • Locations      │
│ • Job Types      │              │ • Jobs           │
│ • Call Reasons   │              │ • Estimates      │
│ • Campaigns      │              │ • Appointments   │
│ • Tag Types      │              │ • Invoices       │
│ • Custom Fields  │              │ • Payments       │
└──────────────────┘              │ • Equipment      │
                                  └──────────────────┘
```

---

## Files to Create

### 1. sync-orchestrator.js (Core Controller)

```javascript
/**
 * Orchestrates all sync operations
 * Handles order of execution and dependencies
 */

import { syncReferenceData } from './sync-reference-data.js';
import { syncCustomers } from './sync-customers.js';
import { syncJobs } from './sync-jobs.js';
import { syncEstimates } from './sync-estimates.js';
import { syncAppointments } from './sync-appointments.js';
import { syncInvoices } from './sync-invoices.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

export async function runFullSync() {
  const startTime = Date.now();
  logger.info('Starting full ServiceTitan sync...');

  try {
    // Phase 1: Reference data (no dependencies)
    logger.info('Phase 1: Syncing reference data...');
    await syncReferenceData();

    // Phase 2: Customers (required by everything else)
    logger.info('Phase 2: Syncing customers...');
    const customerStats = await syncCustomers({ full: true });
    logger.info(`Customers synced: ${customerStats.created} created, ${customerStats.updated} updated`);

    // Phase 3: Jobs (required by estimates, appointments, invoices)
    logger.info('Phase 3: Syncing jobs...');
    const jobStats = await syncJobs({ full: true });
    logger.info(`Jobs synced: ${jobStats.created} created, ${jobStats.updated} updated`);

    // Phase 4: Related entities (parallel)
    logger.info('Phase 4: Syncing related entities...');
    const [estimateStats, appointmentStats, invoiceStats] = await Promise.all([
      syncEstimates({ full: true }),
      syncAppointments({ full: true }),
      syncInvoices({ full: true })
    ]);

    const duration = Date.now() - startTime;
    
    logger.info('Full sync completed', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      customers: customerStats,
      jobs: jobStats,
      estimates: estimateStats,
      appointments: appointmentStats,
      invoices: invoiceStats
    });

    return {
      success: true,
      duration,
      stats: {
        customers: customerStats,
        jobs: jobStats,
        estimates: estimateStats,
        appointments: appointmentStats,
        invoices: invoiceStats
      }
    };

  } catch (error) {
    logger.error('Full sync failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

export async function runIncrementalSync() {
  const startTime = Date.now();
  logger.info('Starting incremental sync...');

  try {
    // Get last sync time for each module
    const lastSyncTimes = await getLastSyncTimes();

    // Sync only records modified since last sync
    const [customerStats, jobStats, estimateStats, appointmentStats, invoiceStats] = await Promise.all([
      syncCustomers({ since: lastSyncTimes.customers }),
      syncJobs({ since: lastSyncTimes.jobs }),
      syncEstimates({ since: lastSyncTimes.estimates }),
      syncAppointments({ since: lastSyncTimes.appointments }),
      syncInvoices({ since: lastSyncTimes.invoices })
    ]);

    const duration = Date.now() - startTime;

    logger.info('Incremental sync completed', {
      duration: `${(duration / 1000).toFixed(2)}s`,
      totalRecords: customerStats.updated + jobStats.updated + estimateStats.updated + 
                    appointmentStats.updated + invoiceStats.updated
    });

    return {
      success: true,
      duration,
      stats: { customers: customerStats, jobs: jobStats, estimates: estimateStats, 
               appointments: appointmentStats, invoices: invoiceStats }
    };

  } catch (error) {
    logger.error('Incremental sync failed', { error: error.message });
    throw error;
  }
}

async function getLastSyncTimes() {
  const modules = ['customers', 'jobs', 'estimates', 'appointments', 'invoices'];
  const times = {};

  for (const module of modules) {
    const lastSync = await prisma.st_sync_log.findFirst({
      where: { module, status: 'completed' },
      orderBy: { completed_at: 'desc' }
    });

    times[module] = lastSync?.completed_at || new Date(0);
  }

  return times;
}
```

**Key Points:**
- Orchestrates sync order (reference data → customers → jobs → everything else)
- Supports full sync (all data) and incremental sync (only changes)
- Parallel execution where possible (estimates + appointments + invoices)
- Complete logging and error handling
- Returns detailed stats

---

### 2. sync-customers.js (Customer Sync)

```javascript
/**
 * Sync customers from ServiceTitan
 */

import { stClient } from '../stClient.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

export async function syncCustomers({ full = false, since = null }) {
  const syncId = await startSyncLog('customers', full ? 'full' : 'incremental');
  
  let stats = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    // Build query parameters
    const params = {
      pageSize: 500,
      includeTotal: true
    };

    if (since) {
      params.modifiedOnOrAfter = since.toISOString();
    }

    // Paginate through all customers
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await stClient.customers.list({ ...params, page });
      
      stats.fetched += response.data.length;

      for (const customer of response.data) {
        try {
          await upsertCustomer(customer);
          
          // Determine if created or updated
          const existing = await prisma.st_customers.findUnique({
            where: { st_id: BigInt(customer.id) }
          });
          
          if (existing) {
            stats.updated++;
          } else {
            stats.created++;
          }

        } catch (error) {
          logger.error('Failed to upsert customer', { 
            customerId: customer.id, 
            error: error.message 
          });
          stats.failed++;
        }
      }

      // Check if more pages
      hasMore = response.hasMore;
      page++;

      // Rate limiting - small delay between pages
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await completeSyncLog(syncId, stats);
    return stats;

  } catch (error) {
    await failSyncLog(syncId, error);
    throw error;
  }
}

async function upsertCustomer(customer) {
  return prisma.st_customers.upsert({
    where: { st_id: BigInt(customer.id) },
    create: {
      st_id: BigInt(customer.id),
      tenant_id: BigInt(customer.tenantId),
      name: customer.name,
      type: customer.type,
      email: customer.email,
      phone: customer.phoneNumbers?.[0]?.number,
      phone_numbers: customer.phoneNumbers || [],
      email_addresses: customer.emails || [],
      address_line1: customer.address?.street,
      city: customer.address?.city,
      state: customer.address?.state,
      zip: customer.address?.zip,
      country: customer.address?.country,
      addresses: customer.addresses || [],
      balance: customer.balance || 0,
      active: customer.active !== false,
      do_not_service: customer.doNotService || false,
      do_not_mail: customer.doNotMail || false,
      tag_type_ids: customer.tagTypeIds || [],
      tags: customer.tags || [],
      custom_fields: customer.customFields || {},
      st_created_on: customer.createdOn ? new Date(customer.createdOn) : null,
      st_modified_on: customer.modifiedOn ? new Date(customer.modifiedOn) : null,
      full_data: customer
    },
    update: {
      name: customer.name,
      type: customer.type,
      email: customer.email,
      phone: customer.phoneNumbers?.[0]?.number,
      phone_numbers: customer.phoneNumbers || [],
      email_addresses: customer.emails || [],
      address_line1: customer.address?.street,
      city: customer.address?.city,
      state: customer.address?.state,
      zip: customer.address?.zip,
      balance: customer.balance || 0,
      active: customer.active !== false,
      st_modified_on: customer.modifiedOn ? new Date(customer.modifiedOn) : null,
      full_data: customer,
      local_synced_at: new Date()
    }
  });
}

async function startSyncLog(module, type) {
  const log = await prisma.st_sync_log.create({
    data: {
      module,
      sync_type: type,
      status: 'started',
      triggered_by: 'scheduled'
    }
  });
  return log.id;
}

async function completeSyncLog(id, stats) {
  await prisma.st_sync_log.update({
    where: { id },
    data: {
      status: 'completed',
      records_fetched: stats.fetched,
      records_created: stats.created,
      records_updated: stats.updated,
      records_failed: stats.failed,
      completed_at: new Date(),
      duration_ms: Date.now() - new Date().getTime()
    }
  });
}

async function failSyncLog(id, error) {
  await prisma.st_sync_log.update({
    where: { id },
    data: {
      status: 'failed',
      error_message: error.message,
      completed_at: new Date()
    }
  });
}
```

**Key Points:**
- Pagination through all customers (500 per page)
- Upsert logic (create if new, update if exists)
- Stores complete API response in `full_data` JSONB field
- Tracks sync progress in `st_sync_log` table
- Rate limiting between pages
- Comprehensive error handling

---

### 3. sync-scheduler.js (Cron Scheduler)

```javascript
/**
 * Schedule automatic syncs
 */

import cron from 'node-cron';
import { runIncrementalSync, runFullSync } from './sync-orchestrator.js';
import { logger } from '../../config/logger.js';

// Incremental sync every 5 minutes
export function startIncrementalSyncScheduler() {
  logger.info('Starting incremental sync scheduler (every 5 minutes)...');
  
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.info('Running scheduled incremental sync...');
      await runIncrementalSync();
    } catch (error) {
      logger.error('Scheduled incremental sync failed', { error: error.message });
    }
  });
}

// Full sync daily at 2 AM
export function startFullSyncScheduler() {
  logger.info('Starting full sync scheduler (daily at 2 AM)...');
  
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Running scheduled full sync...');
      await runFullSync();
    } catch (error) {
      logger.error('Scheduled full sync failed', { error: error.message });
    }
  });
}
```

---

### 4. scripts/run-initial-sync.js (One-Time Setup)

```javascript
#!/usr/bin/env node

/**
 * Run initial full sync to populate database
 * Usage: node scripts/run-initial-sync.js
 */

import { runFullSync } from '../src/services/sync/sync-orchestrator.js';
import { logger } from '../src/config/logger.js';

async function main() {
  logger.info('='.repeat(60));
  logger.info('INITIAL SERVICETITAN SYNC');
  logger.info('='.repeat(60));
  logger.info('This will sync ALL data from ServiceTitan.');
  logger.info('Estimated time: 10-30 minutes depending on data volume.');
  logger.info('='.repeat(60));

  try {
    const result = await runFullSync();
    
    logger.info('');
    logger.info('✅ SYNC COMPLETED SUCCESSFULLY');
    logger.info('');
    logger.info('Summary:');
    logger.info(`- Duration: ${(result.duration / 1000).toFixed(2)}s`);
    logger.info(`- Customers: ${result.stats.customers.created} created, ${result.stats.customers.updated} updated`);
    logger.info(`- Jobs: ${result.stats.jobs.created} created, ${result.stats.jobs.updated} updated`);
    logger.info(`- Estimates: ${result.stats.estimates.created} created, ${result.stats.estimates.updated} updated`);
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Verify data: psql -d servicetitan_mirror -c "SELECT COUNT(*) FROM st_customers;"');
    logger.info('2. Start incremental sync: npm run sync:incremental');
    logger.info('3. Enable workflow engine: npm run worker:workflows');
    
    process.exit(0);

  } catch (error) {
    logger.error('❌ SYNC FAILED', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

main();
```

---

## Additional Files

You'll need similar implementations for:
- `sync-jobs.js` - Job sync (follows same pattern as customers)
- `sync-estimates.js` - Estimate sync
- `sync-appointments.js` - Appointment sync
- `sync-invoices.js` - Invoice sync
- `sync-reference-data.js` - Sync business units, techs, job types, etc.

**Each follows the same pattern:**
1. Fetch from ST API with pagination
2. Upsert to database
3. Track stats
4. Log progress

---

## NPM Scripts to Add

Add to `package.json`:

```json
{
  "scripts": {
    "sync:initial": "node scripts/run-initial-sync.js",
    "sync:incremental": "node -e 'import(\"./src/services/sync/sync-orchestrator.js\").then(m => m.runIncrementalSync())'",
    "sync:full": "node -e 'import(\"./src/services/sync/sync-orchestrator.js\").then(m => m.runFullSync())'",
    "worker:sync": "node src/services/sync/sync-scheduler.js"
  }
}
```

---

## Usage

### Initial Setup (One Time)
```bash
npm run sync:initial
```

### Start Automatic Sync (Background)
```bash
npm run worker:sync
# Runs incremental sync every 5 minutes
# Runs full sync daily at 2 AM
```

### Manual Sync (On Demand)
```bash
npm run sync:incremental  # Quick sync of changes
npm run sync:full         # Complete re-sync
```

---

## Testing

After initial sync:

```sql
-- Verify customer data
SELECT COUNT(*) FROM st_customers;
-- Should show ~5,000+ customers

-- Verify jobs
SELECT COUNT(*) FROM st_jobs;
-- Should show ~10,000+ jobs

-- View recent sync logs
SELECT * FROM st_sync_log ORDER BY started_at DESC LIMIT 10;

-- Check for errors
SELECT * FROM st_sync_log WHERE status = 'failed';
```

---

## Error Handling

### Automatic Retry
- Failed records are logged but don't stop sync
- Next incremental sync will retry

### Rate Limiting
- 100ms delay between pages
- Respects ST API limits (10 requests/second)

### Recovery
- Each module syncs independently
- Failure in one doesn't affect others
- Resume from where it left off

---

## Performance

**Expected sync times:**
- Initial full sync: 10-30 minutes (depending on data volume)
- Incremental sync: 10-30 seconds
- Reference data: <5 seconds

**Database growth:**
- ~100 MB initially
- ~5-10 MB per month

---

## Next Steps

After Batch 3 deployed:
1. Run initial sync
2. Verify data in database
3. Enable incremental sync scheduler
4. Move to Batch 4 (Workflow Engine)

---

**Ready to deploy Batch 3?**
