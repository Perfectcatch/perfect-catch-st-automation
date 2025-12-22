# Fetch Workers & Merge Logic Documentation

## Overview

This document describes the two-layer data sync architecture:
1. **Fetch Workers** - Pull data from ServiceTitan API into raw tables
2. **Merge Workers** - Combine raw tables into dashboard-ready main tables

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICETITAN API                                    │
│  /customers  /contacts  /locations  /jobs  /invoices  /technicians  etc.   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FETCH WORKERS                                      │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ CustomersFetcher │  │ JobsFetcher      │  │ InvoicesFetcher  │   ...    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  Each fetcher:                                                               │
│  1. Calls one API endpoint                                                   │
│  2. Transforms response to match raw table schema                            │
│  3. Upserts into corresponding raw_st_* table                               │
│  4. Updates sync state in raw_sync_state table                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RAW TABLES                                        │
│                                                                              │
│  raw_st_customers         raw_st_jobs              raw_st_invoices          │
│  raw_st_customer_contacts raw_st_appointments      raw_st_payments          │
│  raw_st_locations         raw_st_job_types         raw_st_technicians       │
│  raw_st_location_contacts raw_st_estimates         raw_st_business_units    │
│  ...                                                                         │
│                                                                              │
│  Each table:                                                                 │
│  - Mirrors ONE API endpoint exactly                                         │
│  - Has st_id (ServiceTitan ID), fetched_at, full_data (JSONB)              │
│  - No business logic or transformations                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MERGE WORKERS                                      │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ CustomerMergeWorker                                                  │   │
│  │   Reads: raw_st_customers + raw_st_customer_contacts +               │   │
│  │          raw_st_locations                                            │   │
│  │   Writes: st_customers (with email, phone, address merged)          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ JobMergeWorker                                                       │   │
│  │   Reads: raw_st_jobs + raw_st_appointments +                         │   │
│  │          raw_st_appointment_assignments + raw_st_technicians         │   │
│  │   Writes: st_jobs (with technician_name, scheduled times)           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN TABLES (Dashboard-Ready)                       │
│                                                                              │
│  st_customers    - Complete customer with contacts and primary location     │
│  st_jobs         - Jobs with technician info and appointment times          │
│  st_invoices     - Invoices with payment summary                            │
│  st_locations    - Locations with contact info                              │
│  st_technicians  - Technicians with computed stats                          │
│  st_estimates    - Estimates with line items                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fetch Workers

### Location
```
src/workers/servicetitan-sync/fetchers/
├── base-fetcher.js          # Base class with common functionality
├── crm-fetchers.js          # CustomersFetcher, CustomerContactsFetcher, etc.
├── jpm-fetchers.js          # JobsFetcher, AppointmentsFetcher, JobTypesFetcher
├── accounting-fetchers.js   # InvoicesFetcher, PaymentsFetcher
├── settings-fetchers.js     # TechniciansFetcher, EmployeesFetcher, etc.
├── other-fetchers.js        # Dispatch, Marketing, Equipment, Sales
├── pricebook-fetchers.js    # PricebookMaterialsFetcher, etc.
└── index.js                 # Exports all fetchers + syncAllRaw()
```

### Usage

```javascript
import { syncAllRaw, CustomersFetcher } from './fetchers/index.js';

// Sync all raw tables
await syncAllRaw();

// Or sync specific tables
const fetcher = new CustomersFetcher();
await fetcher.fullSync();       // Full sync
await fetcher.incrementalSync(); // Only modified since last sync
```

### Fetcher → Raw Table Mapping

| Fetcher | Raw Table | API Endpoint |
|---------|-----------|--------------|
| `CustomersFetcher` | `raw_st_customers` | `GET /crm/v2/tenant/{tenant}/customers` |
| `CustomerContactsFetcher` | `raw_st_customer_contacts` | `GET /crm/v2/tenant/{tenant}/customers/contacts` |
| `LocationsFetcher` | `raw_st_locations` | `GET /crm/v2/tenant/{tenant}/locations` |
| `LocationContactsFetcher` | `raw_st_location_contacts` | `GET /crm/v2/tenant/{tenant}/locations/contacts` |
| `JobsFetcher` | `raw_st_jobs` | `GET /jpm/v2/tenant/{tenant}/jobs` |
| `AppointmentsFetcher` | `raw_st_appointments` | `GET /jpm/v2/tenant/{tenant}/appointments` |
| `JobTypesFetcher` | `raw_st_job_types` | `GET /jpm/v2/tenant/{tenant}/job-types` |
| `InvoicesFetcher` | `raw_st_invoices` | `GET /accounting/v2/tenant/{tenant}/invoices` |
| `PaymentsFetcher` | `raw_st_payments` | `GET /accounting/v2/tenant/{tenant}/payments` |
| `TechniciansFetcher` | `raw_st_technicians` | `GET /settings/v2/tenant/{tenant}/technicians` |
| `EmployeesFetcher` | `raw_st_employees` | `GET /settings/v2/tenant/{tenant}/employees` |
| `BusinessUnitsFetcher` | `raw_st_business_units` | `GET /settings/v2/tenant/{tenant}/business-units` |
| `TagTypesFetcher` | `raw_st_tag_types` | `GET /settings/v2/tenant/{tenant}/tag-types` |
| `AppointmentAssignmentsFetcher` | `raw_st_appointment_assignments` | `GET /dispatch/v2/tenant/{tenant}/appointment-assignments` |
| `TeamsFetcher` | `raw_st_teams` | `GET /dispatch/v2/tenant/{tenant}/teams` |
| `ZonesFetcher` | `raw_st_zones` | `GET /dispatch/v2/tenant/{tenant}/zones` |
| `CampaignsFetcher` | `raw_st_campaigns` | `GET /marketing/v2/tenant/{tenant}/campaigns` |
| `InstalledEquipmentFetcher` | `raw_st_installed_equipment` | `GET /equipmentsystems/v2/tenant/{tenant}/installed-equipment` |
| `EstimatesFetcher` | `raw_st_estimates` | `GET /sales/v2/tenant/{tenant}/estimates` |
| `PricebookMaterialsFetcher` | `raw_st_pricebook_materials` | `GET /pricebook/v2/tenant/{tenant}/materials` |
| `PricebookServicesFetcher` | `raw_st_pricebook_services` | `GET /pricebook/v2/tenant/{tenant}/services` |
| `PricebookEquipmentFetcher` | `raw_st_pricebook_equipment` | `GET /pricebook/v2/tenant/{tenant}/equipment` |
| `PricebookCategoriesFetcher` | `raw_st_pricebook_categories` | `GET /pricebook/v2/tenant/{tenant}/categories` |

---

## Merge Workers

Merge workers combine data from multiple raw tables into the main dashboard-ready tables.

### 1. Customer Merge Worker

**Purpose:** Create complete customer records with contact info and primary location.

**Source Tables:**
- `raw_st_customers` - Base customer data
- `raw_st_customer_contacts` - Email and phone contacts
- `raw_st_locations` - Location/address info

**Target Table:** `st_customers`

**Merge Logic:**
```sql
-- Pseudo-SQL for merge logic
SELECT
    c.st_id,
    c.name,
    c.type,
    c.active,
    c.do_not_mail,
    c.do_not_service,
    c.balance,
    c.tag_type_ids,
    c.custom_fields,
    c.st_created_on,
    c.st_modified_on,

    -- From raw_st_customer_contacts (primary email)
    (SELECT value FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type = 'Email'
     ORDER BY st_modified_on DESC LIMIT 1) AS email,

    -- From raw_st_customer_contacts (primary phone)
    (SELECT value FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type IN ('Phone', 'MobilePhone')
     ORDER BY
       CASE WHEN type = 'MobilePhone' THEN 0 ELSE 1 END,
       st_modified_on DESC
     LIMIT 1) AS phone,

    -- All phone numbers as JSON array
    (SELECT jsonb_agg(jsonb_build_object(
        'type', type,
        'value', value,
        'doNotText', phone_settings->>'doNotText'
     ))
     FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type IN ('Phone', 'MobilePhone')
    ) AS phone_numbers,

    -- All email addresses as JSON array
    (SELECT jsonb_agg(value)
     FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type = 'Email'
    ) AS email_addresses,

    -- From raw_st_locations (primary location address)
    l.address->>'street' AS address_line1,
    l.address->>'unit' AS address_line2,
    l.address->>'city' AS city,
    l.address->>'state' AS state,
    l.address->>'zip' AS zip,
    l.address->>'country' AS country,
    l.st_id AS location_id

FROM raw_st_customers c
LEFT JOIN raw_st_locations l ON l.customer_id = c.st_id AND l.active = true
```

**Fields Merged:**

| Target Field | Source | Logic |
|--------------|--------|-------|
| `email` | `raw_st_customer_contacts` | First Email type contact |
| `phone` | `raw_st_customer_contacts` | First MobilePhone, fallback to Phone |
| `phone_numbers` | `raw_st_customer_contacts` | All phone contacts as JSON array |
| `email_addresses` | `raw_st_customer_contacts` | All email contacts as JSON array |
| `address_line1` | `raw_st_locations` | Primary location street |
| `city`, `state`, `zip` | `raw_st_locations` | Primary location address |
| `location_id` | `raw_st_locations` | Primary location ST ID |

---

### 2. Job Merge Worker

**Purpose:** Create complete job records with technician info and appointment times.

**Source Tables:**
- `raw_st_jobs` - Base job data
- `raw_st_appointments` - Appointment times
- `raw_st_appointment_assignments` - Technician assignments
- `raw_st_technicians` - Technician names

**Target Table:** `st_jobs`

**Merge Logic:**
```sql
SELECT
    j.st_id,
    j.job_number,
    j.customer_id,
    j.location_id,
    j.business_unit_id,
    j.job_type_id,
    j.campaign_id,
    j.job_status,
    j.priority,
    j.summary,
    j.total,
    j.tag_type_ids,
    j.custom_fields,
    j.st_created_on,
    j.st_modified_on,

    -- From raw_st_appointments
    a.start_time AS scheduled_start,
    a.end_time AS scheduled_end,
    j.completed_on,

    -- From raw_st_technicians via raw_st_appointment_assignments
    t.st_id AS technician_id,
    t.name AS technician_name

FROM raw_st_jobs j
LEFT JOIN raw_st_appointments a ON a.job_id = j.st_id
    AND a.st_id = j.last_appointment_id
LEFT JOIN raw_st_appointment_assignments aa ON aa.appointment_id = a.st_id
LEFT JOIN raw_st_technicians t ON t.st_id = aa.technician_id
```

**Fields Merged:**

| Target Field | Source | Logic |
|--------------|--------|-------|
| `scheduled_start` | `raw_st_appointments` | Last appointment start time |
| `scheduled_end` | `raw_st_appointments` | Last appointment end time |
| `technician_id` | `raw_st_appointment_assignments` → `raw_st_technicians` | Primary assigned technician |
| `technician_name` | `raw_st_technicians` | Technician's name |

---

### 3. Location Merge Worker

**Purpose:** Add contact info to locations.

**Source Tables:**
- `raw_st_locations` - Base location data
- `raw_st_location_contacts` - Location contacts

**Target Table:** `st_locations`

**Fields Merged:**

| Target Field | Source | Logic |
|--------------|--------|-------|
| `email` | `raw_st_location_contacts` | First Email type contact |
| `phone` | `raw_st_location_contacts` | First Phone/MobilePhone contact |

---

### 4. Invoice Merge Worker

**Purpose:** Add payment summary to invoices.

**Source Tables:**
- `raw_st_invoices` - Base invoice data
- `raw_st_payments` - Payment records

**Target Table:** `st_invoices`

**Fields Merged:**

| Target Field | Source | Logic |
|--------------|--------|-------|
| `paid_amount` | `raw_st_payments` | Sum of payments applied to invoice |
| `payment_count` | `raw_st_payments` | Count of payments |
| `paid_on` | `raw_st_payments` | Date of last payment |

---

### 5. Technician Merge Worker

**Purpose:** Add computed statistics to technicians.

**Source Tables:**
- `raw_st_technicians` - Base technician data
- `raw_st_jobs` - For job counts
- `raw_st_invoices` - For revenue totals

**Target Table:** `st_technicians`

**Fields Merged:**

| Target Field | Source | Logic |
|--------------|--------|-------|
| `total_jobs` | `raw_st_jobs` | Count of jobs assigned |
| `completed_jobs` | `raw_st_jobs` | Count of completed jobs |
| `total_revenue` | `raw_st_invoices` | Sum of invoice totals |

---

## Sync Schedule Recommendations

### Full Sync (Daily at 2 AM)
```javascript
await syncAllRaw({ includePricebook: true });
await runAllMergeWorkers();
```

### Incremental Sync (Every 15 minutes)
```javascript
// Only sync tables that change frequently
await new CustomerContactsFetcher().incrementalSync();
await new JobsFetcher().incrementalSync();
await new AppointmentsFetcher().incrementalSync();
await new InvoicesFetcher().incrementalSync();

// Then run merge workers
await runCustomerMergeWorker();
await runJobMergeWorker();
```

### Reference Data Sync (Every 4 hours)
```javascript
await syncAllSettings();  // business units, job types, tags
```

---

## Debugging

### Check raw data
```sql
-- See what the API returned for a customer
SELECT full_data FROM raw_st_customers WHERE st_id = 12345;

-- See all contacts for a customer
SELECT type, value, phone_settings
FROM raw_st_customer_contacts
WHERE customer_id = 12345;
```

### Check sync status
```sql
SELECT
    table_name,
    last_full_sync,
    last_incremental_sync,
    records_count,
    sync_status,
    last_error
FROM raw_sync_state
ORDER BY last_full_sync DESC;
```

### Compare raw vs merged
```sql
-- Compare raw contacts with merged customer
SELECT
    c.st_id,
    c.name,
    merged.email AS merged_email,
    merged.phone AS merged_phone,
    (SELECT jsonb_agg(value) FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type = 'Email') AS raw_emails,
    (SELECT jsonb_agg(value) FROM raw_st_customer_contacts
     WHERE customer_id = c.st_id AND type IN ('Phone', 'MobilePhone')) AS raw_phones
FROM raw_st_customers c
JOIN st_customers merged ON merged.st_id = c.st_id
WHERE merged.email IS NULL AND EXISTS (
    SELECT 1 FROM raw_st_customer_contacts
    WHERE customer_id = c.st_id AND type = 'Email'
);
```

---

## File Locations

| Component | Path |
|-----------|------|
| Raw table migration | `prisma/migrations/20251221_raw_tables/migration.sql` |
| Fetch workers | `src/workers/servicetitan-sync/fetchers/` |
| Merge workers | `src/workers/servicetitan-sync/mergers/` |
| Architecture docs | `docs/architecture/` |

---

## Merge Workers

### Location
```
src/workers/servicetitan-sync/mergers/
├── base-merger.js          # Base class with common merge functionality
├── customer-merger.js      # CustomerMerger - combines customers + contacts + locations
├── job-merger.js           # JobMerger - combines jobs + appointments + technicians
├── location-merger.js      # LocationMerger - combines locations + location contacts
├── invoice-merger.js       # InvoiceMerger - combines invoices + payments
├── technician-merger.js    # TechnicianMerger - adds job/revenue stats
├── simple-copiers.js       # Simple copiers for reference data tables
└── index.js                # Exports all + runAllMergeWorkers()
```

### Usage

```javascript
import { runAllMergeWorkers, runCustomerMerge } from './mergers/index.js';

// Merge all tables (full)
await runAllMergeWorkers();

// Merge all tables (incremental - last 24 hours)
await runAllMergeWorkers({ incremental: true });

// Merge specific tables
await runCustomerMerge();
await runJobMerge();

// Convenience functions
await runCRMMerge();      // customers + locations
await runJobsMerge();     // jobs + appointments + estimates + invoices
await runCoreMerges();    // core tables only (skip reference data)
```

### Merger → Target Table Mapping

| Merger | Target Table | Source Raw Tables |
|--------|--------------|-------------------|
| `CustomerMerger` | `st_customers` | `raw_st_customers` + `raw_st_customer_contacts` + `raw_st_locations` |
| `LocationMerger` | `st_locations` | `raw_st_locations` + `raw_st_location_contacts` |
| `TechnicianMerger` | `st_technicians` | `raw_st_technicians` + job/invoice stats |
| `JobMerger` | `st_jobs` | `raw_st_jobs` + `raw_st_appointments` + `raw_st_appointment_assignments` |
| `InvoiceMerger` | `st_invoices` | `raw_st_invoices` + `raw_st_payments` |
| `AppointmentsCopier` | `st_appointments` | `raw_st_appointments` + `raw_st_appointment_assignments` |
| `EstimatesCopier` | `st_estimates` | `raw_st_estimates` |
| `PaymentsCopier` | `st_payments` | `raw_st_payments` |
| `BusinessUnitsCopier` | `st_business_units` | `raw_st_business_units` |
| `CampaignsCopier` | `st_campaigns` | `raw_st_campaigns` |
| `JobTypesCopier` | `st_job_types` | `raw_st_job_types` |
| `TagTypesCopier` | `st_tag_types` | `raw_st_tag_types` |
| `InstalledEquipmentCopier` | `st_installed_equipment` | `raw_st_installed_equipment` |

---

## Complete Sync Pipeline

### Full Sync (Daily at 2 AM)
```javascript
import { syncAllRaw } from './fetchers/index.js';
import { runAllMergeWorkers } from './mergers/index.js';

// Step 1: Fetch all raw data from ServiceTitan API
await syncAllRaw({ includePricebook: true });

// Step 2: Merge raw tables into main tables
await runAllMergeWorkers();
```

### Incremental Sync (Every 15 minutes)
```javascript
import { CustomersFetcher, JobsFetcher, InvoicesFetcher } from './fetchers/index.js';
import { runCRMMerge, runJobsMerge } from './mergers/index.js';

// Step 1: Fetch only recently modified records
await new CustomersFetcher().incrementalSync();
await new JobsFetcher().incrementalSync();
await new InvoicesFetcher().incrementalSync();

// Step 2: Merge the updated data
await runCRMMerge({ incremental: true });
await runJobsMerge({ incremental: true });
```
