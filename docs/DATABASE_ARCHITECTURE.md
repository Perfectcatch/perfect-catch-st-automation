# Perfect Catch Database Architecture

> **Last Updated:** December 16, 2025  
> **Status:** Consolidated from 5 → 3 PostgreSQL instances

## Overview

The Perfect Catch ST Automation platform uses a consolidated PostgreSQL architecture with **schema-based separation** for logical organization within a single primary database.

## Database Instances (3 Total)

| Instance | Container | Port | Database | Purpose |
|----------|-----------|------|----------|---------|
| **Primary** | `postgres` | 6432 | `perfectcatch_automation` | Core business data (ST + Pricebook + GHL) |
| **RAG** | `docling-postgres` | 5432 | `docling` | Document processing / RAG |
| **Workflows** | `n8n-postgres-1` | internal | `n8n` | n8n workflow engine |

## Primary Database Schema Organization

```
perfectcatch_automation
├── servicetitan (schema)
│   ├── st_jobs (3,232 rows)
│   ├── st_customers (1,684 rows)
│   ├── st_invoices (3,379 rows)
│   ├── st_estimates (1,221 rows)
│   ├── st_employees (14 rows)
│   ├── st_appointments
│   ├── st_business_units
│   ├── st_technicians
│   ├── st_locations
│   ├── st_payments
│   ├── st_campaigns
│   ├── st_job_types
│   ├── st_call_reasons
│   ├── st_tag_types
│   ├── st_custom_fields
│   ├── st_installed_equipment
│   └── st_sync_log
│
├── pricebook (schema)
│   ├── pricebook_materials (2,620 rows)
│   ├── pricebook_services (2,115 rows)
│   ├── pricebook_equipment (205 rows)
│   ├── pricebook_categories (1,160 rows)
│   ├── pricebook_changes (31,210 rows)
│   ├── pricebook_sync_log
│   ├── pricebook_sync_conflicts
│   ├── pricebook_webhook_subscriptions
│   ├── chat_sessions
│   ├── pb_categories
│   ├── pb_materials
│   ├── pb_services
│   ├── pb_equipment
│   ├── pb_vendors
│   ├── pb_labor
│   ├── pb_material_vendors
│   ├── pb_service_materials
│   ├── pb_service_labor
│   └── pb_service_equipment
│
├── automation (schema)
│   ├── workflow_definitions (2 rows)
│   ├── workflow_instances
│   ├── workflow_step_executions
│   ├── messaging_templates (5 rows)
│   └── messaging_log
│
├── integrations (schema)
│   ├── ghl_contacts (90 rows)
│   ├── ghl_opportunities (201 rows)
│   ├── ghl_sync_log (3 rows)
│   ├── callrail_calls
│   └── callrail_conversion_log
│
└── public (schema)
    ├── business_units
    ├── customers
    ├── jobs
    ├── sync_logs
    ├── sync_state
    └── customer_communication_preferences
```

## Connection Configuration

### Environment Variables

```bash
# Primary Database (REQUIRED)
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:6432/perfectcatch_automation

# Schema names for application code
ST_SCHEMA=servicetitan
PRICEBOOK_SCHEMA=pricebook
AUTOMATION_SCHEMA=automation
INTEGRATIONS_SCHEMA=integrations

# Other databases
DOCLING_DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/docling
# n8n manages its own connection internally
```

### Application Usage

```javascript
import db from './db/schema-connection.js';

// Query ServiceTitan data
const jobs = await db.servicetitan.query(
  'SELECT * FROM st_jobs WHERE status = $1', 
  ['Completed']
);

// Query Pricebook data
const materials = await db.pricebook.getMaterials('active = true');

// Query GHL data
const contacts = await db.integrations.getGhlContacts('LIMIT 100');

// Search across pricebook items
const results = await db.pricebook.searchItems('copper pipe', 50);

// Check connection health
const status = await db.checkConnection();
```

## Backup Strategy

```bash
# Full backup of primary database
docker exec postgres pg_dump -U postgres -d perfectcatch_automation > backup_full.sql

# Schema-specific backups
docker exec postgres pg_dump -U postgres -d perfectcatch_automation --schema=servicetitan > backup_st.sql
docker exec postgres pg_dump -U postgres -d perfectcatch_automation --schema=pricebook > backup_pb.sql
docker exec postgres pg_dump -U postgres -d perfectcatch_automation --schema=integrations > backup_int.sql
```

## Decommissioned Containers

The following containers have been stopped and can be removed after 1 week verification:

| Container | Port | Status | Data Location |
|-----------|------|--------|---------------|
| `perfect-catch-db` | 5433 | **STOPPED** | Migrated to `integrations` schema |
| `st-pricebook-postgres` | 5451 | **STOPPED** | Migrated to `pricebook` schema |

### To Remove (after verification period):

```bash
# Remove containers
docker rm perfect-catch-db
docker rm st-pricebook-postgres

# Remove volumes (PERMANENT - only after full verification)
docker volume ls | grep -E "perfect-catch|pricebook"
docker volume rm <volume_name>
```

## Migration History

| Date | Change | Details |
|------|--------|---------|
| 2025-12-16 | Initial consolidation | Merged 5 postgres → 3, organized into schemas |

## Troubleshooting

### Check schema availability
```sql
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name IN ('servicetitan', 'pricebook', 'automation', 'integrations');
```

### Check table counts per schema
```sql
SELECT schemaname, count(*) as tables
FROM pg_stat_user_tables 
GROUP BY schemaname
ORDER BY schemaname;
```

### Query with explicit schema
```sql
SET search_path TO servicetitan, public;
SELECT * FROM st_jobs LIMIT 10;

-- Or use fully qualified names
SELECT * FROM servicetitan.st_jobs LIMIT 10;
SELECT * FROM pricebook.pricebook_materials LIMIT 10;
SELECT * FROM integrations.ghl_contacts LIMIT 10;
```
