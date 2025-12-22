# ServiceTitan Sync Workers - Development Reference

Use this prompt when asking AI to modify or create sync workers.

---

## Architecture Overview

```
ServiceTitan API
       ↓
   [FETCHERS] - Fetch raw data from ST API endpoints
       ↓
   raw_st_* tables (23 tables) - Mirror of API data
       ↓
   [MERGERS] - Combine/transform raw tables
       ↓
   st_* tables (16 tables) - Dashboard-ready data
```

---

## File Locations

### Fetchers (API → Raw Tables)
```
src/workers/servicetitan-sync/fetchers/
├── base-fetcher.js          # Base class with pagination, upsert, sync state
├── crm-fetchers.js           # Customers, Contacts, Locations
├── jpm-fetchers.js           # Jobs, Appointments, Job Types
├── accounting-fetchers.js    # Invoices, Payments
├── settings-fetchers.js      # Technicians, Employees, Business Units, Tags
├── pricebook-fetchers.js     # Materials, Services, Equipment, Categories
├── other-fetchers.js         # Estimates, Campaigns, Installed Equipment, etc.
└── index.js                  # Exports all fetchers + syncAllRaw()
```

### Mergers (Raw Tables → Main Tables)
```
src/workers/servicetitan-sync/mergers/
├── base-merger.js            # Base class with merge logic
├── customer-merger.js        # raw_st_customers + contacts → st_customers
├── location-merger.js        # raw_st_locations + contacts → st_locations
├── job-merger.js             # raw_st_jobs + related → st_jobs
├── invoice-merger.js         # raw_st_invoices → st_invoices
├── technician-merger.js      # raw_st_technicians → st_technicians
├── simple-copiers.js         # Direct copy for reference tables
└── index.js                  # Exports all mergers + runAllMergeWorkers()
```

### Database Config
```
src/config/index.js           # config.database.url
prisma/schema.prisma          # Prisma schema (auto-generated from DB)
```

---

## Current Tables

### Raw Tables (23) - Direct API Mirror
| Table | Description | Key Columns |
|-------|-------------|-------------|
| `raw_st_customers` | Customer accounts | st_id, name, type, address, balance |
| `raw_st_customer_contacts` | Customer contact info | st_id, customer_id, type, value |
| `raw_st_locations` | Service locations | st_id, customer_id, address |
| `raw_st_location_contacts` | Location contact info | st_id, location_id, type, value |
| `raw_st_jobs` | Jobs/work orders | st_id, customer_id, location_id, job_status |
| `raw_st_appointments` | Scheduled appointments | st_id, job_id, start_time, end_time, status |
| `raw_st_invoices` | Invoices | st_id, job_id, customer_id, total, balance |
| `raw_st_payments` | Payments | st_id, invoice_id, amount, payment_type |
| `raw_st_estimates` | Estimates/quotes | st_id, job_id, customer_id, total |
| `raw_st_technicians` | Technicians | st_id, name, email, phone, business_unit_id |
| `raw_st_employees` | All employees | st_id, name, role, email |
| `raw_st_business_units` | Business units | st_id, name, trade, division |
| `raw_st_job_types` | Job type definitions | st_id, name, duration, priority |
| `raw_st_tag_types` | Tag definitions | st_id, name, code, color |
| `raw_st_campaigns` | Marketing campaigns | st_id, name, active |
| `raw_st_installed_equipment` | Customer equipment | st_id, location_id, name, model |
| `raw_st_teams` | Dispatch teams | st_id, name, active |
| `raw_st_zones` | Service zones | st_id, name, active |
| `raw_st_appointment_assignments` | Tech assignments | st_id, appointment_id, technician_id |
| `raw_st_pricebook_materials` | Pricebook materials | st_id, code, display_name, price, cost |
| `raw_st_pricebook_services` | Pricebook services | st_id, code, display_name, price |
| `raw_st_pricebook_equipment` | Pricebook equipment | st_id, code, display_name, price, cost |
| `raw_st_pricebook_categories` | Pricebook categories | st_id, name, parent_id |

### Merged Tables (16) - Dashboard Ready
| Table | Source Tables | Purpose |
|-------|--------------|---------|
| `st_customers` | raw_st_customers + raw_st_customer_contacts | Customer with primary phone/email |
| `st_locations` | raw_st_locations + raw_st_location_contacts | Location with contact info |
| `st_jobs` | raw_st_jobs + lookups | Jobs with customer/location names |
| `st_appointments` | raw_st_appointments | Appointments with job info |
| `st_invoices` | raw_st_invoices | Invoices with customer info |
| `st_payments` | raw_st_payments | Payments |
| `st_estimates` | raw_st_estimates | Estimates |
| `st_technicians` | raw_st_technicians | Technicians |
| `st_employees` | raw_st_employees | Employees |
| `st_business_units` | raw_st_business_units | Business units |
| `st_job_types` | raw_st_job_types | Job types |
| `st_tag_types` | raw_st_tag_types | Tags |
| `st_campaigns` | raw_st_campaigns | Campaigns |
| `st_installed_equipment` | raw_st_installed_equipment | Installed equipment |
| `st_call_reasons` | - | Call reasons |
| `st_custom_fields` | - | Custom field definitions |

### Sync State
| Table | Purpose |
|-------|---------|
| `raw_sync_state` | Tracks last sync time per raw table |

---

## How to Create a New Fetcher

```javascript
// src/workers/servicetitan-sync/fetchers/my-fetchers.js

import { BaseFetcher } from './base-fetcher.js';

export class MyEntityFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_my_entity',           // Target raw table
      endpoint: '/module/v2/tenant/{tenant}/my-entity',  // ST API endpoint
    });
  }

  // Define columns to insert/update
  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'active',
      // ... other columns matching your raw table
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',      // Always include for raw JSON storage
    ];
  }

  // If you have PostgreSQL array columns (BIGINT[], TEXT[])
  getPgArrayColumns() {
    return ['tag_type_ids'];  // These won't be JSON-stringified
  }

  // Transform API response to database row
  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      active: record.active ?? true,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,  // Store full API response
    };
  }
}
```

---

## How to Create a New Merger

```javascript
// src/workers/servicetitan-sync/mergers/my-merger.js

import { BaseMerger } from './base-merger.js';

export class MyEntityMerger extends BaseMerger {
  constructor() {
    super({
      name: 'MyEntityMerger',
      targetTable: 'st_my_entity',  // Target merged table
      batchSize: 500,
    });
  }

  // SQL query that joins/transforms raw tables
  getMergeQuery() {
    return `
      SELECT
        r.st_id,
        r.name,
        r.active,
        -- Join with other tables for enrichment
        bu.name as business_unit_name,
        -- Aggregate contacts
        (SELECT value FROM raw_st_my_contacts
         WHERE entity_id = r.st_id AND type = 'Phone' LIMIT 1) as primary_phone
      FROM raw_st_my_entity r
      LEFT JOIN raw_st_business_units bu ON bu.st_id = r.business_unit_id
      WHERE r.active = true
    `;
  }

  // Columns to insert into target table
  getTargetColumns() {
    return [
      'st_id',
      'name',
      'active',
      'business_unit_name',
      'primary_phone',
      'local_created_at',
      'local_synced_at',
    ];
  }

  // Optional: custom row transformation
  transformRow(row) {
    return {
      ...row,
      local_created_at: new Date(),
      local_synced_at: new Date(),
    };
  }
}
```

---

## Database Connection

```javascript
import pg from 'pg';
import config from '../config/index.js';

const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 5,
});
```

---

## Running Workers

```javascript
// Run all fetchers (sync raw tables from API)
import { syncAllRaw } from './src/workers/servicetitan-sync/fetchers/index.js';
await syncAllRaw({ includePricebook: true });

// Run all mergers (populate st_* from raw_st_*)
import { runAllMergeWorkers } from './src/workers/servicetitan-sync/mergers/index.js';
await runAllMergeWorkers();

// Run specific fetcher
import { CustomersFetcher } from './src/workers/servicetitan-sync/fetchers/index.js';
const fetcher = new CustomersFetcher();
await fetcher.fullSync();
await fetcher.close();

// Run specific merger
import { CustomerMerger } from './src/workers/servicetitan-sync/mergers/index.js';
const merger = new CustomerMerger();
await merger.fullMerge();
await merger.close();
```

---

## Common Patterns

### Extracting Primary Contact from Contacts Table
```sql
-- Get primary phone
(SELECT value FROM raw_st_customer_contacts
 WHERE customer_id = c.st_id AND type = 'Phone'
 ORDER BY st_id LIMIT 1) as primary_phone

-- Get primary email
(SELECT value FROM raw_st_customer_contacts
 WHERE customer_id = c.st_id AND type = 'Email'
 ORDER BY st_id LIMIT 1) as primary_email
```

### Joining with Lookup Tables
```sql
SELECT
  j.*,
  jt.name as job_type_name,
  bu.name as business_unit_name,
  c.name as customer_name
FROM raw_st_jobs j
LEFT JOIN raw_st_job_types jt ON jt.st_id = j.job_type_id
LEFT JOIN raw_st_business_units bu ON bu.st_id = j.business_unit_id
LEFT JOIN raw_st_customers c ON c.st_id = j.customer_id
```

### Handling Arrays
```javascript
// In fetcher - mark as PG array (won't be JSON stringified)
getPgArrayColumns() {
  return ['tag_type_ids', 'zone_ids'];
}

// In transformer
tag_type_ids: record.tagTypeIds || [],
```

---

## ServiceTitan API Modules

| Module | Endpoints | Raw Tables |
|--------|-----------|------------|
| CRM | /crm/v2/tenant/{tenant}/customers | raw_st_customers, raw_st_customer_contacts |
| CRM | /crm/v2/tenant/{tenant}/locations | raw_st_locations, raw_st_location_contacts |
| JPM | /jpm/v2/tenant/{tenant}/jobs | raw_st_jobs |
| JPM | /jpm/v2/tenant/{tenant}/appointments | raw_st_appointments |
| JPM | /jpm/v2/tenant/{tenant}/job-types | raw_st_job_types |
| Accounting | /accounting/v2/tenant/{tenant}/invoices | raw_st_invoices |
| Accounting | /accounting/v2/tenant/{tenant}/payments | raw_st_payments |
| Settings | /settings/v2/tenant/{tenant}/technicians | raw_st_technicians |
| Settings | /settings/v2/tenant/{tenant}/employees | raw_st_employees |
| Settings | /settings/v2/tenant/{tenant}/business-units | raw_st_business_units |
| Pricebook | /pricebook/v2/tenant/{tenant}/materials | raw_st_pricebook_materials |
| Pricebook | /pricebook/v2/tenant/{tenant}/services | raw_st_pricebook_services |
| Pricebook | /pricebook/v2/tenant/{tenant}/equipment | raw_st_pricebook_equipment |

---

## Example Prompt for AI

```
I need to [create/modify] a [fetcher/merger] for [entity].

The data should come from:
- API endpoint: /module/v2/tenant/{tenant}/entity
- Raw table: raw_st_entity

It should merge with:
- raw_st_other_table (for field X)
- raw_st_contacts (for primary phone/email)

The final st_entity table should have:
- field1 (from raw_st_entity.field1)
- field2 (joined from raw_st_other)
- primary_phone (extracted from contacts)

Please follow the patterns in the existing fetchers/mergers.
```
