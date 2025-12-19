# PostgreSQL Database Consolidation Report

**Generated:** December 16, 2025  
**Status:** Analysis Complete - Ready for Consolidation

---

## 1. Current Infrastructure Inventory

### PostgreSQL Instances

| Container | Port | Database | Size | Purpose | Status |
|-----------|------|----------|------|---------|--------|
| `perfect-catch-db` | 5433 | `pricebook` | 47 MB | Mixed (pricebook + stale ST data) | ⚠️ Needs cleanup |
| `postgres` | 6432 | `perfectcatch_automation` | 65 MB | Main automation (fresh ST data) | ✅ Active |
| `st-pricebook-postgres` | 5451 | `pricebook` | 119 MB | Pricebook sync engine | ✅ Active |
| `docling-postgres` | 5432 | `docling_rag` | 8 MB | PDF/RAG processing | ✅ Separate service |
| `n8n-postgres-1` | internal | `n8n` | 296 MB | n8n workflows | ✅ Separate service |
| `perfectcatch-dashboard-db` | internal | `dashboard` | 9 MB | PHP Dashboard | ✅ Separate service |
| `supabase-db` | internal | various | - | Supabase | ✅ Separate service |

### Data Freshness Comparison

| Table | perfect-catch-db (5433) | postgres (6432) | st-pricebook (5451) | **Winner** |
|-------|-------------------------|-----------------|---------------------|------------|
| `st_jobs` | 0 | **3,232** | - | 6432 |
| `st_customers` | 1,682 | **1,684** | - | 6432 |
| `st_estimates` | 0 | **1,221** | - | 6432 |
| `st_invoices` | 0 | **3,379** | - | 6432 |
| `st_employees` | 6 | **14** | - | 6432 |
| `ghl_contacts` | **90** | 0 | - | 5433 |
| `ghl_opportunities` | **201** | 0 | - | 5433 |
| `pricebook_materials` | 2,620 | - | **2,620** | Both same |
| `pricebook_services` | 2,115 | - | **2,115** | Both same |
| `pricebook_equipment` | 205 | - | **205** | Both same |
| `pricebook_categories` | 12 | - | **1,160** | 5451 |
| `pb_materials` | - | - | 2,263 | 5451 (new schema) |
| `pb_categories` | - | - | 262 | 5451 (new schema) |

---

## 2. Consolidation Decision

### Target Architecture

**Keep 3 separate databases** (not consolidate into one) because:
1. Different services own different data
2. Isolation prevents accidental cross-contamination
3. Easier backup/restore per domain

```
┌─────────────────────────────────────────────────────────────────┐
│                    POSTGRES INSTANCES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ st-pricebook-postgres│  │      postgres        │             │
│  │     Port: 5451       │  │     Port: 6432       │             │
│  │                      │  │                      │             │
│  │  PRICEBOOK DATA      │  │  AUTOMATION DATA     │             │
│  │  ─────────────       │  │  ───────────────     │             │
│  │  • pricebook_*       │  │  • st_* (synced)     │             │
│  │  • pb_* (new schema) │  │  • workflow_*        │             │
│  │  • chat_sessions     │  │  • messaging_*       │             │
│  │                      │  │  • ghl_* (migrate)   │             │
│  │                      │  │  • callrail_*        │             │
│  └──────────────────────┘  └──────────────────────┘             │
│                                                                  │
│  ┌──────────────────────┐                                       │
│  │   perfect-catch-db   │  ← TO BE DECOMMISSIONED               │
│  │     Port: 5433       │                                       │
│  │                      │                                       │
│  │  STALE/DUPLICATE     │                                       │
│  │  • st_* (empty)      │  → DELETE                             │
│  │  • pricebook_* (dup) │  → Already in 5451                    │
│  │  • ghl_* (migrate)   │  → MIGRATE to 6432                    │
│  │  • workflow_* (dup)  │  → Already in 6432                    │
│  └──────────────────────┘                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Migration Actions Required

### Phase 1: Migrate GHL Data (5433 → 6432)

The `ghl_contacts` (90 rows) and `ghl_opportunities` (201 rows) tables have data in 5433 but are empty in 6432.

```bash
# Export from perfect-catch-db
docker exec perfect-catch-db pg_dump -U postgres -d pricebook \
  --data-only -t ghl_contacts -t ghl_opportunities -t ghl_sync_log \
  > /tmp/ghl_data.sql

# Import to postgres (automation)
docker exec -i postgres psql -U postgres -d perfectcatch_automation < /tmp/ghl_data.sql
```

### Phase 2: Cleanup perfect-catch-db (5433)

After GHL migration, drop all tables from `perfect-catch-db` since:
- `st_*` tables are empty (stale)
- `pricebook_*` tables are duplicates of 5451
- `workflow_*` and `messaging_*` are duplicates of 6432

### Phase 3: Decommission perfect-catch-db

Stop and remove the container after verification period.

---

## 4. Application Connection Updates

### Current .env Configuration (WRONG)
```env
# Points to wrong/mixed database
DATABASE_URL=postgresql://postgres:xxx@localhost:5433/pricebook
```

### Correct .env Configuration
```env
# Pricebook data (for pricebook sync engine)
PRICEBOOK_DATABASE_URL=postgresql://pricebook_admin:xxx@localhost:5451/pricebook

# Automation data (for ST sync, workflows, messaging)
SERVICETITAN_DATABASE_URL=postgresql://postgres:Catchadmin@2025@localhost:6432/perfectcatch_automation

# Legacy alias (point to automation for backward compat)
DATABASE_URL=postgresql://postgres:Catchadmin@2025@localhost:6432/perfectcatch_automation
```

---

## 5. Safety Measures to Implement

### Database Connection Validator

Add to application startup to prevent wrong database connections:

```javascript
// src/db/connection-validator.js
async function validateDatabaseConnection(pool, expectedTables) {
  const result = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tables = result.rows.map(r => r.table_name);
  
  for (const expected of expectedTables) {
    if (!tables.includes(expected)) {
      throw new Error(`Database validation failed: missing table '${expected}'`);
    }
  }
  
  // Warn if unexpected tables exist
  const unexpected = tables.filter(t => !expectedTables.includes(t));
  if (unexpected.length > 0) {
    console.warn(`Warning: Unexpected tables in database: ${unexpected.join(', ')}`);
  }
}

// For pricebook database
export const PRICEBOOK_TABLES = [
  'pricebook_categories', 'pricebook_materials', 'pricebook_services',
  'pricebook_equipment', 'pricebook_sync_log', 'pricebook_changes'
];

// For automation database  
export const AUTOMATION_TABLES = [
  'st_jobs', 'st_customers', 'st_estimates', 'st_invoices',
  'workflow_definitions', 'messaging_templates'
];
```

---

## 6. Verification Checklist

After consolidation:

- [ ] GHL data migrated to 6432 (90 contacts, 201 opportunities)
- [ ] perfect-catch-db tables dropped
- [ ] Application .env updated
- [ ] Application connects to correct databases
- [ ] Pricebook sync works (5451)
- [ ] ST sync works (6432)
- [ ] Workflows execute correctly
- [ ] n8n connections updated if needed
- [ ] Backup of old data exists
- [ ] perfect-catch-db container stopped (keep for 1 week)
- [ ] perfect-catch-db container removed (after verification)

---

## 7. Rollback Plan

If issues occur:

1. Restart `perfect-catch-db` container
2. Revert .env to old DATABASE_URL
3. Restart application
4. Investigate and fix before retrying

---

## Summary

| Action | Source | Target | Data |
|--------|--------|--------|------|
| **MIGRATE** | 5433 | 6432 | ghl_contacts, ghl_opportunities |
| **DELETE** | 5433 | - | All st_*, workflow_*, messaging_* tables |
| **KEEP** | 5451 | - | All pricebook_*, pb_* tables |
| **KEEP** | 6432 | - | All st_*, workflow_*, messaging_* tables |
| **DECOMMISSION** | 5433 | - | perfect-catch-db container |
