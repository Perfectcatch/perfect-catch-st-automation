# Integration Isolation Architecture

*Last Updated: 2025-12-20*

## Overview

This document defines the boundaries between integrations to prevent cross-contamination.

## Schema Ownership

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ servicetitan │  │ integrations │  │  automation  │  │  salesforce  │ │
│  │    schema    │  │    schema    │  │    schema    │  │    schema    │ │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────┤ │
│  │ st_customers │  │ ghl_contacts │  │ workflow_*   │  │ sync_log     │ │
│  │ st_jobs      │  │ ghl_opps     │  │ messaging_*  │  │ (future)     │ │
│  │ st_estimates │  │              │  │              │  │              │ │
│  │ st_invoices  │  │              │  │              │  │              │ │
│  │ st_appts     │  │              │  │              │  │              │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│        ▲                  ▲                 ▲                 │         │
│        │                  │                 │                 │         │
│   READ ONLY          READ ONLY         READ ONLY          READ/WRITE    │
│   by others          by others         by others          (isolated)    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Integration Boundaries

### ServiceTitan Sync (st-sync-worker)
- **Owns**: `servicetitan.*` tables
- **Writes to**: `servicetitan.st_*` tables only
- **Reads from**: ServiceTitan API
- **DO NOT**: Modify from other integrations

### GHL Integration (st-workflow-worker)
- **Owns**: `integrations.ghl_*` tables
- **Writes to**: `integrations.ghl_contacts`, `integrations.ghl_opportunities`
- **Reads from**: `servicetitan.st_estimates`, `servicetitan.st_customers`
- **DO NOT**: Write to servicetitan schema

### Salesforce Integration (API routes)
- **Owns**: `salesforce.*` tables, Redis `salesforce:*` keys
- **Writes to**: Salesforce CRM (external), `salesforce.*` tables
- **Reads from**: `servicetitan.st_customers` (READ ONLY)
- **DO NOT**: Write to servicetitan or integrations schemas

### Workflow Engine (st-workflow-worker)
- **Owns**: `automation.*` tables
- **Writes to**: `automation.workflow_*`, `automation.messaging_*`
- **Reads from**: `servicetitan.*`, `integrations.*`
- **DO NOT**: Modify source data

## Data Flow Rules

### Rule 1: One-Way Data Flow
```
ServiceTitan API
       │
       ▼ (sync)
servicetitan.* tables ────────────────────────────────────┐
       │                                                   │
       ├──────────────────┐                               │
       │                  │                               │
       ▼                  ▼                               ▼
   GHL API         Salesforce API               Workflow Engine
       │                  │                               │
       ▼                  ▼                               ▼
integrations.ghl_*   salesforce.*                 automation.*
```

### Rule 2: Never Modify Upstream
- Salesforce integration MUST NOT modify `servicetitan.*` tables
- GHL integration MUST NOT modify `servicetitan.*` tables
- Workflows MUST NOT modify source entity tables

### Rule 3: Use External IDs for Linking
```sql
-- GHL uses st_customer_id to link back
SELECT * FROM integrations.ghl_contacts WHERE st_customer_id = 12345;

-- Salesforce uses ServiceTitan_Customer_ID__c field
-- stored in Salesforce, not in our DB
```

### Rule 4: Separate Token Storage
```
Redis Keys:
├── salesforce:tokens:default    ← Salesforce OAuth tokens
├── ghl:tokens:*                 ← GHL tokens (if needed)
└── session:*                    ← User sessions
```

## Safe Development Practices

### When Adding Salesforce Features:

1. **Create tables in salesforce schema only**
   ```sql
   CREATE TABLE salesforce.my_table (...);
   ```

2. **Read from servicetitan schema, never write**
   ```javascript
   // GOOD - Read only
   const customers = await pool.query('SELECT * FROM servicetitan.st_customers');

   // BAD - Never do this
   await pool.query('UPDATE servicetitan.st_customers SET ...');
   ```

3. **Store Salesforce-specific data in Salesforce schema**
   ```sql
   INSERT INTO salesforce.sync_log (st_customer_id, salesforce_contact_id) ...
   ```

4. **Use Redis for temporary state**
   ```javascript
   await redis.set('salesforce:sync:progress', JSON.stringify(state));
   ```

### When Adding GHL Features:

1. **Create tables in integrations schema**
2. **Read from servicetitan schema, never write**
3. **Store GHL-specific data in integrations schema**

## Testing Isolation

Before deploying any integration changes, verify:

```bash
# Check no writes to servicetitan schema
grep -r "UPDATE servicetitan\." src/integrations/salesforce/
grep -r "INSERT INTO servicetitan\." src/integrations/salesforce/
grep -r "DELETE FROM servicetitan\." src/integrations/salesforce/

# Should return nothing for a properly isolated integration
```

## Worker Separation

| Worker | Responsibility | Schemas Modified |
|--------|---------------|------------------|
| st-sync-worker | ST → DB sync | servicetitan.* |
| st-workflow-worker | Events, GHL sync | integrations.*, automation.* |
| st-monitoring-agent | Health checks | None (read-only) |
| API Server | Salesforce routes | salesforce.* |

## Emergency Isolation

If an integration misbehaves, you can disable it without affecting others:

```bash
# Disable Salesforce only
SALESFORCE_SYNC_ENABLED=false

# Disable GHL only
GHL_SYNC_ENABLED=false

# Workers continue running unaffected
```

## Summary

| Integration | Can Read | Can Write | Token Storage |
|-------------|----------|-----------|---------------|
| ST Sync | ST API | servicetitan.* | .env |
| GHL | servicetitan.* | integrations.*, GHL API | .env |
| Salesforce | servicetitan.* | salesforce.*, SF API | Redis |
| Workflows | servicetitan.*, integrations.* | automation.* | N/A |

**Golden Rule**: Each integration writes ONLY to its own schema and external API.
