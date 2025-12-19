# Gaps and Recommendations

## Critical Issues

### 1. GHL Tables Not Created

**Issue:** Migration 006 (ghl_and_employees.sql) has not been applied. The GHL integration code exists but cannot function without the database tables.

**Impact:**
- Cannot sync opportunities from GHL
- Cannot sync contacts from GHL
- Cannot push estimates to GHL
- `syncEstimateToGHL()` will fail with "table does not exist"

**Fix:**
```bash
PGPASSWORD='Catchadmin@2025' psql -h localhost -p 6432 -U postgres -d perfectcatch_automation \
  -f src/db/migrations/006_ghl_and_employees.sql
```

**Priority:** 🔴 Critical

---

### 2. Appointments Sync Failing (404)

**Issue:** The appointments sync is returning a 404 error from the ServiceTitan API.

**Root Cause:** Incorrect API endpoint. The current code uses:
```
/dispatch/v2/tenant/{id}/appointments
```

**Possible Fix:** Check ServiceTitan API documentation for correct endpoint. May need:
- Different API version
- Different endpoint path
- Additional query parameters

**Priority:** 🟡 Medium

---

### 3. Technicians Not Syncing

**Issue:** `st_technicians` table has 0 records despite sync-reference-data.js including technician sync.

**Root Cause:** Need to verify:
1. API endpoint is correct
2. Tenant has technicians configured
3. No API errors during sync

**Priority:** 🟡 Medium

---

### 4. Workflow Workers Not Running

**Issue:** The sync scheduler and workflow engine workers are not running as background processes.

**Impact:**
- No automatic incremental syncs
- No automatic workflow execution
- Events detected but not processed continuously

**Fix:**
```bash
# Start with PM2 for production
pm2 start ecosystem.config.cjs

# Or start manually
npm run worker:sync &
npm run worker:workflows &
```

**Priority:** 🔴 Critical

---

### 5. No Workflow Instances Created

**Issue:** Despite 2 workflow definitions being active and events being detected, no workflow instances have been created.

**Possible Causes:**
1. Trigger conditions not matching
2. Estimates don't meet minimum total ($1000)
3. Event detection timing issues

**Debug Steps:**
```sql
-- Check workflow definitions
SELECT name, trigger_event, trigger_conditions FROM workflow_definitions;

-- Check if estimates meet conditions
SELECT COUNT(*) FROM st_estimates WHERE total >= 1000 AND status = 'Open';

-- Check recent events
SELECT * FROM st_sync_log WHERE module = 'estimates' ORDER BY started_at DESC LIMIT 5;
```

**Priority:** 🟡 Medium

---

## Redundancy Issues

### 6. n8n Still Active

**Issue:** Both n8n and the native workflow engine are running. This creates:
- Duplicate processing
- Confusion about which system handles what
- Maintenance overhead

**Current n8n Usage:**
- n8n-n8n-1 container running on port 5678
- n8n-n8n-worker-1 running
- webhook-handler.js still active

**Recommendation:**
1. Audit current n8n workflows
2. Migrate remaining workflows to native engine
3. Disable n8n containers
4. Remove n8n integration code

**Priority:** 🟡 Medium

---

## Missing Features

### 7. No Location Sync

**Issue:** `st_locations` table exists but no sync module populates it.

**Impact:**
- Jobs reference location_id but locations not available
- Address data incomplete

**Fix:** Add location sync to sync-reference-data.js or create sync-locations.js

**Priority:** 🟢 Low

---

### 8. No Payment Sync

**Issue:** `st_payments` table exists but no sync module populates it.

**Impact:**
- Cannot track payment status
- Invoice balance may be stale

**Fix:** Create sync-payments.js module

**Priority:** 🟢 Low

---

### 9. No Equipment Sync

**Issue:** `st_installed_equipment` table exists but no sync module populates it.

**Impact:**
- Cannot track customer equipment
- Missing data for service recommendations

**Fix:** Create sync-equipment.js module

**Priority:** 🟢 Low

---

### 10. No Inbound Message Handling

**Issue:** System can send SMS but cannot receive/process replies.

**Impact:**
- Customer replies not captured
- No two-way conversation
- Opt-out requests not processed

**Fix:**
1. Set up Twilio webhook endpoint
2. Create inbound message handler
3. Process STOP/opt-out keywords
4. Update customer_communication_preferences

**Priority:** 🟡 Medium

---

## Performance Concerns

### 11. Full Sync Takes 18+ Seconds

**Issue:** Full sync duration is acceptable but could be optimized.

**Recommendations:**
1. Increase page size where API allows
2. Parallelize independent syncs
3. Use bulk upserts instead of individual queries
4. Add connection pooling optimization

**Priority:** 🟢 Low

---

### 12. Event Polling Every 30 Seconds

**Issue:** 30-second polling interval means up to 30-second delay in event detection.

**Recommendations:**
1. Consider PostgreSQL LISTEN/NOTIFY for real-time
2. Reduce interval to 10 seconds for critical events
3. Add webhook receivers for immediate notification

**Priority:** 🟢 Low

---

## Security Concerns

### 13. Credentials in .env File

**Issue:** All credentials stored in plain text .env file.

**Recommendations:**
1. Use Docker secrets for production
2. Consider HashiCorp Vault
3. Rotate credentials regularly
4. Audit access to .env file

**Priority:** 🟡 Medium

---

### 14. No API Rate Limiting on Internal Endpoints

**Issue:** Internal API endpoints don't have rate limiting.

**Recommendations:**
1. Add express-rate-limit to all routes
2. Implement per-IP and per-user limits
3. Add request logging

**Priority:** 🟢 Low

---

## Recommendations Summary

### Immediate Actions (This Week)

1. **Apply Migration 006** - Create GHL tables
2. **Start Background Workers** - Enable continuous sync and workflow processing
3. **Fix Appointments Sync** - Correct API endpoint
4. **Test Workflow Triggers** - Create test estimate to verify workflow execution

### Short-Term (Next 2 Weeks)

5. **Migrate n8n Workflows** - Move remaining workflows to native engine
6. **Add Inbound SMS Handler** - Enable two-way messaging
7. **Sync Technicians** - Debug and fix technician sync
8. **Add Location Sync** - Populate st_locations table

### Medium-Term (Next Month)

9. **Add Payment Sync** - Track payment status
10. **Add Equipment Sync** - Track installed equipment
11. **Optimize Sync Performance** - Bulk operations, parallel processing
12. **Implement Real-Time Events** - PostgreSQL NOTIFY or webhooks

### Long-Term (Next Quarter)

13. **Deprecate n8n** - Remove n8n containers and code
14. **Add Comprehensive Monitoring** - Prometheus, Grafana
15. **Implement Secrets Management** - Vault or similar
16. **Add Automated Testing** - Integration tests for all flows

---

## Action Items Checklist

- [ ] Apply migration 006_ghl_and_employees.sql
- [ ] Start sync scheduler worker
- [ ] Start workflow engine worker
- [ ] Fix appointments API endpoint
- [ ] Debug technician sync
- [ ] Create test estimate to trigger workflow
- [ ] Verify GHL sync works after migration
- [ ] Audit n8n workflows for migration
- [ ] Set up PM2 for production workers
- [ ] Add health check endpoints for workers
