# Job Sync Workflow Comparison: Old vs New

## Executive Summary

**Objective:** Replace Airtable with PostgreSQL for ServiceTitan → GoHighLevel job synchronization

**Benefits:**
- 💰 **Cost Savings:** Eliminate Airtable subscription ($20-50/month)
- 🚀 **Performance:** Faster database operations vs API calls
- 📊 **Audit Trail:** Complete sync history and statistics
- 🔄 **Idempotency:** Safe re-runs without duplicates
- 🎯 **Single Source of Truth:** All data in one PostgreSQL database

---

## Architecture Comparison

### **OLD WORKFLOW** (Current - Airtable-based)

```
┌──────────────┐
│   Schedule   │ Every 1 minute
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│  n8n Data Table         │ ❌ Proprietary format
│  Get "lastJobPull"      │ ❌ Limited to n8n
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  ServiceTitan API       │
│  GET /jobs              │
│  ?createdOnOrAfter=...  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Split Out              │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Airtable Search        │ ❌ External API call
│  Find customer by ID    │ ❌ Rate limits
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Airtable Upsert        │ ❌ Another API call
│  Create/Update job      │ ❌ No versioning
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  JavaScript Code        │
│  Merge customer data    │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  IF: Business Unit      │ Hardcoded IDs:
│                         │ • 1314 (Sales & Service)
│                         │ • 54670601 (Install)
│                         │ • 4622 (Pool)
│                         │ • 26143 (Plumbing)
└──────┬──────────────────┘
       │
       ├──────────────┬──────────────┐
       │              │              │
       ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│GHL: S&S  │   │GHL:Install│   │GHL: Pool │
└──────────┘   └──────────┘   └──────────┘

❌ No sync status tracking
❌ No retry mechanism
❌ No audit logging
❌ Manual conflict resolution
```

**Issues:**
1. ❌ **3 External Dependencies:** n8n DataTable + Airtable (2 calls) + GHL
2. ❌ **No Audit Trail:** Can't track which jobs synced when
3. ❌ **No Sync Status:** Don't know if GHL sync succeeded
4. ❌ **Rate Limits:** Airtable API has rate limits
5. ❌ **Cost:** Airtable subscription fees
6. ❌ **Scattered Data:** Customer data in multiple places
7. ❌ **Hardcoded Logic:** Business units hardcoded in workflow
8. ❌ **No Idempotency:** Re-running could cause issues

---

### **NEW WORKFLOW** (Proposed - PostgreSQL-based)

```
┌──────────────┐
│   Schedule   │ Every 5 minutes
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│  PostgreSQL             │ ✅ Database query
│  GET /db/sync-state/    │ ✅ Instant response
│  lastJobPull            │ ✅ Version tracked
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  ServiceTitan API       │
│  GET /jobs              │
│  ?createdOnOrAfter=...  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Split Out              │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  ServiceTitan API       │ ✅ Rich customer data
│  GET /customers/{id}    │ ✅ Single source
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  ServiceTitan API       │ ✅ Complete address
│  GET /locations/{id}    │ ✅ All location fields
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Merge Data             │
│  job + customer + loc   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  PostgreSQL             │ ✅ Atomic upsert
│  POST /db/jobs/upsert   │ ✅ Conflict resolution
│                         │ ✅ Customer auto-created
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│  PostgreSQL             │ ✅ Database-driven
│  Filter by business_    │ ✅ Configurable
│  units.sync_enabled     │ ✅ Dynamic pipelines
└──────┬──────────────────┘
       │
       ├──────────────┬──────────────┐
       │              │              │
       ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│GHL: S&S  │   │GHL:Install│   │GHL: Pool │
└─────┬────┘   └─────┬────┘   └─────┬────┘
      │              │              │
      ▼              ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐
│Mark      │   │Mark      │   │Mark      │
│Synced    │   │Synced    │   │Synced    │
└─────┬────┘   └─────┬────┘   └─────┬────┘
      │              │              │
      └──────────────┴──────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │ Update Sync State   │ ✅ Latest timestamp
          │ (new lastJobPull)   │ ✅ Metadata saved
          └──────────┬──────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │  Log Sync           │ ✅ Complete audit
          │  Completion         │ ✅ Statistics
          └─────────────────────┘

✅ Full audit trail
✅ GHL sync status per job
✅ Retry-safe (idempotent)
✅ Database-driven configuration
```

**Improvements:**
1. ✅ **Single External Dependency:** Only ServiceTitan + GHL (no Airtable)
2. ✅ **Complete Audit Trail:** Every sync logged with statistics
3. ✅ **Sync Status Tracking:** Know exactly which jobs synced to GHL
4. ✅ **No Rate Limits:** PostgreSQL = no external API limits
5. ✅ **Zero Extra Cost:** No Airtable subscription
6. ✅ **Centralized Data:** All job/customer data in PostgreSQL
7. ✅ **Database-Driven Config:** Business units configurable in DB
8. ✅ **Idempotent:** Safe to re-run at any time

---

## Data Flow Comparison

### **OLD: Scattered Data**

```
ServiceTitan
     │
     ├─→ n8n DataTable (sync state)
     │
     ├─→ Airtable (customers)
     │
     ├─→ Airtable (jobs)
     │
     └─→ GoHighLevel (opportunities)

❌ 4 different data stores
❌ No central source of truth
❌ Reconciliation nightmares
```

### **NEW: Centralized Data**

```
ServiceTitan (source)
     │
     ├─→ PostgreSQL (everything)
     │   ├─ sync_state
     │   ├─ customers
     │   ├─ jobs
     │   ├─ sync_logs
     │   └─ business_units
     │
     └─→ GoHighLevel (opportunities)

✅ Single source of truth (PostgreSQL)
✅ Easy reconciliation
✅ Complete history
```

---

## Database Schema (New)

### **Tables Created**

1. **sync_state** - Key-value store for sync timestamps
   - `lastJobPull` → Latest job creation timestamp
   - Metadata tracking (jobs processed, execution ID, etc.)

2. **customers** - Customer master records
   - ST customer ID (unique)
   - Contact info (name, email, phone)
   - Address details
   - GHL sync status and contact ID

3. **jobs** - Job master records
   - ST job ID (unique)
   - Business unit, job type, status
   - Customer relationship (FK)
   - Appointments, invoices, estimates
   - GHL sync status and opportunity ID

4. **sync_logs** - Audit trail for all syncs
   - Sync type (job_pull, customer_sync, ghl_push)
   - Records processed/succeeded/failed
   - Error details
   - Duration metrics
   - n8n execution ID

5. **business_units** - Business unit configuration
   - ST business unit ID
   - GHL pipeline mapping
   - Sync enabled flag

### **Smart Functions**

- `update_sync_state()` - Atomic sync state updates
- `get_last_job_pull()` - Get last pull timestamp
- `upsert_job_from_st()` - Intelligent job+customer upsert
  - Creates customer if not exists
  - Updates customer if exists
  - Creates job if not exists
  - Updates job if exists
  - All in single transaction

### **Helpful Views**

- `jobs_pending_ghl_sync` - Jobs that need GHL sync
- `sync_statistics` - Aggregated sync metrics

---

## API Endpoints Created

### **Sync State**
```
GET    /db/sync-state/:key
GET    /db/sync-state
PUT    /db/sync-state/:key
```

### **Jobs**
```
POST   /db/jobs/upsert
POST   /db/jobs/upsert-batch
GET    /db/jobs/pending-ghl-sync
PATCH  /db/jobs/:stJobId/ghl-sync
GET    /db/jobs/:stJobId
```

### **Customers**
```
GET    /db/customers/:stCustomerId
PATCH  /db/customers/:stCustomerId/ghl-sync
```

### **Sync Logs**
```
POST   /db/sync-logs
GET    /db/sync-logs
GET    /db/sync-logs/statistics
```

### **Business Units**
```
GET    /db/business-units
GET    /db/business-units/:stBusinessUnitId
```

---

## Performance Comparison

### **Airtable Workflow (OLD)**

```
Average sync time per job:
├─ Get customer from Airtable:  ~200-500ms (API call)
├─ Upsert job to Airtable:      ~300-700ms (API call)
├─ JavaScript processing:       ~50ms
└─ Total per job:               ~550-1250ms

For 100 jobs:  55-125 seconds
Rate limits:   5 requests/second (Airtable)
```

### **PostgreSQL Workflow (NEW)**

```
Average sync time per job:
├─ Get customer from ST:        ~100-200ms (cached)
├─ Get location from ST:        ~100-200ms (cached)
├─ Upsert to PostgreSQL:        ~10-50ms (local DB)
├─ Mark synced:                 ~5-10ms (local DB)
└─ Total per job:               ~215-460ms

For 100 jobs:  21-46 seconds
Rate limits:   None (local PostgreSQL)

🚀 ~2-3x faster per job
```

---

## Cost Analysis

### **Monthly Costs**

| Service | OLD (Airtable) | NEW (PostgreSQL) | Savings |
|---------|----------------|------------------|---------|
| Airtable Pro | $20-50/month | $0 | $20-50 |
| PostgreSQL | $0 (bundled) | $0 (bundled) | $0 |
| **Total** | **$20-50** | **$0** | **$20-50** |

**Annual Savings:** $240-600

---

## Migration Risk Assessment

| Risk | Mitigation |
|------|------------|
| **Data loss during migration** | Keep old workflow running in parallel for 1 week |
| **Database connection issues** | Health checks + automatic reconnection in code |
| **Schema changes needed** | Migrations are reversible (PostgreSQL transactions) |
| **n8n workflow bugs** | Test workflow before going live, monitor sync_logs |
| **GHL webhook failures** | Retry logic + sync status tracking for manual retry |

**Risk Level:** 🟢 **LOW** - All changes are additive, old system remains intact

---

## Rollback Plan

If issues arise:

1. **Immediate:** Reactivate old Airtable workflow in n8n
2. **Short-term:** Keep both workflows running, compare results
3. **Long-term:** Fix issues in new workflow, validate, switch back

**Data Loss Risk:** None - PostgreSQL maintains complete history

---

## Success Metrics

After 1 week of production:

✅ **Performance**
- [ ] Average sync time < 30 seconds per 100 jobs
- [ ] Zero rate limit errors

✅ **Reliability**
- [ ] >99% successful job upserts
- [ ] >95% successful GHL syncs
- [ ] Zero data loss incidents

✅ **Observability**
- [ ] sync_logs table shows complete history
- [ ] sync_statistics view shows trends
- [ ] Failed syncs are identifiable and retriable

✅ **Cost**
- [ ] Airtable subscription cancelled
- [ ] Zero new infrastructure costs

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1: Setup** | 1 hour | Run schema, deploy code, configure .env |
| **Phase 2: Testing** | 2 hours | Test endpoints, import workflow, dry run |
| **Phase 3: Parallel** | 1 week | Run both workflows, compare results |
| **Phase 4: Cutover** | 1 hour | Disable old workflow, monitor new one |
| **Phase 5: Cleanup** | 1 hour | Archive Airtable data, cancel subscription |

**Total Time to Production:** 1 week (mostly passive monitoring)

---

## Conclusion

**Recommendation:** ✅ **PROCEED WITH MIGRATION**

The new PostgreSQL-based workflow offers:
- Better performance (2-3x faster)
- Lower cost ($20-50/month savings)
- Better observability (complete audit trail)
- Better reliability (no rate limits)
- Better maintainability (centralized data)

Risk is low, rollback is easy, and benefits are immediate.
