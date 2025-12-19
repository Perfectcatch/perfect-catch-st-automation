# Sync Engine Specification – Perfect Catch Pricebook

## Document Purpose

This document defines the **exact algorithm** for bidirectional synchronization between ServiceTitan and our local database. This is the most critical piece of the entire system – it must be bulletproof.

---

## 🎯 Sync Goals

1. **Keep Local DB in Sync with ServiceTitan** – ST is source of truth
2. **Allow Local Modifications** – Users can edit in Retool
3. **Detect Conflicts** – When same item edited in both places
4. **Never Auto-Resolve Conflicts** – Require human decision
5. **Preserve Vendor Data** – Local vendor prices persist through sync
6. **Audit Everything** – Every sync logged, every conflict tracked

---

## 📊 Sync Metadata (Every Entity)

Every table has these columns:

```sql
-- Sync tracking
sync_status TEXT, -- 'synced', 'pending_push', 'pending_pull', 'conflict'
sync_direction TEXT, -- 'from_st', 'to_st', 'bidirectional'
last_synced_at TIMESTAMP,
st_modified_on TIMESTAMP, -- ST's modifiedOn timestamp
local_modified_at TIMESTAMP, -- Our last edit timestamp

-- Conflict resolution
has_conflict BOOLEAN DEFAULT FALSE,
conflict_data JSONB, -- { st_version: {...}, local_version: {...}, detected_at: '...' }
conflict_resolved_at TIMESTAMP,
conflict_resolution TEXT, -- 'use_st', 'use_local', 'merged'
resolved_by TEXT, -- User who resolved

-- Soft delete
deleted_at TIMESTAMP,
deleted_in_st BOOLEAN DEFAULT FALSE,
```

---

## 🔄 Sync Types

### 1. Full Sync

**When to Run:**
- Initial setup
- After extended downtime
- When incremental sync fails repeatedly
- Manual trigger by admin

**What It Does:**
1. Fetch ALL entities from ST (paginated)
2. Compare with local DB
3. Detect new, modified, deleted items
4. Flag conflicts (modified in both places)
5. Sync non-conflicting items
6. Store conflict data for manual resolution

**Expected Duration:**
- 1,000 items: ~2 minutes
- 10,000 items: ~15 minutes
- 50,000 items: ~60 minutes

**Endpoint:** `POST /api/sync/pricebook/full`

---

### 2. Incremental Sync

**When to Run:**
- Every 15 minutes (cron job)
- After user saves in Retool (trigger immediately)
- Via n8n webhook (when external change detected)

**What It Does:**
1. Fetch only items modified since last sync
2. Use ST's `modifiedOnOrAfter` parameter
3. Compare with local records
4. Sync deltas only

**Expected Duration:**
- Typically <30 seconds
- Handles 99% of syncs

**Endpoint:** `POST /api/sync/pricebook/incremental`

---

### 3. Single-Entity Sync

**When to Run:**
- After user saves a specific service/material
- To verify sync of single item

**What It Does:**
1. Fetch single entity from ST
2. Compare with local version
3. Sync or flag conflict

**Expected Duration:** <2 seconds

**Endpoint:** `POST /api/sync/pricebook/entity/:type/:id`

---

## 🧮 Sync Algorithm (Incremental)

### Input Parameters

```typescript
interface SyncParams {
  entityType: 'services' | 'materials' | 'equipment' | 'categories'
  sinceTimestamp?: string // ISO 8601
  dryRun?: boolean // Preview changes without applying
}
```

### Algorithm Steps

```typescript
async function incrementalSync(params: SyncParams) {
  const { entityType, sinceTimestamp } = params
  
  // Step 1: Determine sync window
  const lastSync = await getLastSyncTimestamp(entityType)
  const syncSince = sinceTimestamp || lastSync
  
  // Step 2: Fetch from ServiceTitan
  const stItems = await fetchFromST(entityType, { 
    modifiedOnOrAfter: syncSince 
  })
  
  // Step 3: Fetch corresponding local items
  const localItems = await fetchLocalItems(entityType, {
    ids: stItems.map(i => i.id)
  })
  
  // Step 4: Build comparison map
  const comparison = compareVersions(stItems, localItems)
  
  // Step 5: Categorize items
  const changes = {
    newInST: [],        // Items in ST but not local → CREATE local
    deletedInST: [],    // Items deleted in ST → DELETE local
    modifiedInSTOnly: [],  // Changed in ST only → UPDATE local
    modifiedLocalOnly: [], // Changed locally only → PUSH to ST
    conflicts: [],      // Changed in BOTH → FLAG for manual resolution
    noChange: []        // Identical → SKIP
  }
  
  for (const item of comparison) {
    const category = categorizeChange(item)
    changes[category].push(item)
  }
  
  // Step 6: Apply non-conflicting changes
  await applyChanges(changes)
  
  // Step 7: Store conflicts for manual review
  await storeConflicts(changes.conflicts)
  
  // Step 8: Update sync metadata
  await updateSyncMetadata(entityType, {
    lastSyncedAt: new Date(),
    itemsSynced: changes.newInST.length + changes.modifiedInSTOnly.length,
    itemsPushed: changes.modifiedLocalOnly.length,
    conflictsDetected: changes.conflicts.length
  })
  
  return {
    success: true,
    summary: changes,
    conflicts: changes.conflicts.length,
    syncedAt: new Date()
  }
}
```

---

## 🔍 Change Categorization Logic

```typescript
function categorizeChange(item: ComparisonItem): ChangeCategory {
  const { stVersion, localVersion } = item
  
  // Case 1: New in ServiceTitan
  if (stVersion && !localVersion) {
    return 'newInST'
  }
  
  // Case 2: Deleted in ServiceTitan
  if (!stVersion && localVersion && !localVersion.deleted_at) {
    return 'deletedInST'
  }
  
  // Case 3: No change
  if (versionsIdentical(stVersion, localVersion)) {
    return 'noChange'
  }
  
  // Case 4: Modified in ST only
  if (stVersion.modifiedOn > localVersion.st_modified_on &&
      localVersion.local_modified_at <= localVersion.last_synced_at) {
    return 'modifiedInSTOnly'
  }
  
  // Case 5: Modified locally only
  if (localVersion.local_modified_at > localVersion.last_synced_at &&
      stVersion.modifiedOn <= localVersion.st_modified_on) {
    return 'modifiedLocalOnly'
  }
  
  // Case 6: CONFLICT – Modified in both places
  if (stVersion.modifiedOn > localVersion.st_modified_on &&
      localVersion.local_modified_at > localVersion.last_synced_at) {
    return 'conflict'
  }
  
  return 'noChange'
}
```

---

## ⚠️ Conflict Detection

A conflict occurs when:

```typescript
// Timestamps for a material with id=9404
{
  st_modified_on: '2024-12-10T14:30:00Z',      // ST last edit
  local_modified_at: '2024-12-10T15:00:00Z',   // Our last edit
  last_synced_at: '2024-12-10T10:00:00Z'       // Last successful sync
}

// Both timestamps are AFTER last sync → CONFLICT
```

**What We Store:**

```typescript
interface ConflictData {
  detectedAt: string
  entityType: 'service' | 'material' | 'equipment'
  entityId: number
  
  stVersion: {
    modifiedOn: string
    data: object // Full ST object
  }
  
  localVersion: {
    modifiedAt: string
    data: object // Full local object
  }
  
  diff: {
    fields: string[] // Which fields differ
    stValues: object // ST values for those fields
    localValues: object // Local values for those fields
  }
}
```

---

## 🛠️ Conflict Resolution

### Manual Resolution Options

1. **Use ServiceTitan Version** (`use_st`)
   - Overwrites local changes
   - Updates `local_modified_at` to match ST
   - Sets `sync_status = 'synced'`

2. **Use Local Version** (`use_local`)
   - Pushes local changes to ST via API
   - Updates `st_modified_on` after successful push
   - Sets `sync_status = 'synced'`

3. **Merge** (`merged`)
   - User manually picks fields from each version
   - Creates hybrid object
   - Pushes merged version to ST
   - Sets `sync_status = 'synced'`

### Resolution Workflow

```typescript
// User resolves conflict in Retool
POST /api/sync/pricebook/resolve-conflict/:id
{
  resolution: 'use_st' | 'use_local' | 'merged',
  mergedData?: object // Only if resolution='merged'
}

// Backend applies resolution
async function resolveConflict(conflictId, resolution, mergedData?) {
  const conflict = await getConflict(conflictId)
  
  switch (resolution) {
    case 'use_st':
      await updateLocalFromST(conflict.stVersion)
      break
    
    case 'use_local':
      await pushLocalToST(conflict.localVersion)
      break
    
    case 'merged':
      await updateLocalFromMerge(mergedData)
      await pushMergedToST(mergedData)
      break
  }
  
  // Mark conflict as resolved
  await markConflictResolved(conflictId, resolution, userId)
  
  // Log resolution
  await logConflictResolution({
    conflictId,
    resolution,
    resolvedBy: userId,
    resolvedAt: new Date()
  })
}
```

---

## 🔐 Special Cases

### 1. Vendor Pricing Data (Local-Only)

Vendor prices are stored in a separate table and NEVER synced to ST:

```sql
CREATE TABLE vendor_prices (
  id UUID PRIMARY KEY,
  material_id BIGINT REFERENCES pricebook_materials(id),
  vendor TEXT,
  vendor_sku TEXT,
  price DECIMAL(10,2),
  -- NO sync metadata
)
```

**Why?** ST doesn't have vendor pricing fields. This is our enhancement.

---

### 2. Soft Deletes

When ST deletes an item:

```typescript
// Don't hard delete from local DB
await prisma.pricebook_materials.update({
  where: { id: materialId },
  data: {
    deleted_at: new Date(),
    deleted_in_st: true,
    sync_status: 'synced'
  }
})
```

**Why?** Preserve vendor pricing history even if material deleted.

---

### 3. Materials in Services (Bundling)

Services store materials as JSONB:

```json
{
  "materials_included": [
    { "materialId": 9404, "quantity": 2 },
    { "materialId": 8203, "quantity": 1 }
  ]
}
```

**Sync Rule:** Treat `materials_included` as a single field. If it differs → conflict.

---

### 4. Category Hierarchy

Categories have `parent_id` (ST) and `category_uuid` (local):

```typescript
// When syncing categories, rebuild hierarchy
async function syncCategories() {
  const stCategories = await fetchSTCategories()
  
  // Build tree structure
  const tree = buildCategoryTree(stCategories)
  
  // Sync from root to leaves (preserve parent relationships)
  for (const level of tree) {
    await syncCategoryLevel(level)
  }
}
```

---

## 📈 Sync Performance Optimization

### Batch Operations

```typescript
// Bad: One query per item
for (const item of items) {
  await updateItem(item)
}

// Good: Single bulk update
await prisma.pricebook_materials.updateMany({
  data: items.map(i => ({ where: { id: i.id }, data: i }))
})
```

### Pagination

```typescript
// Fetch ST data in chunks
async function fetchAllFromST(entityType) {
  let page = 1
  let allItems = []
  
  while (true) {
    const response = await stApi.getPricebook(entityType, { 
      page, 
      pageSize: 500 
    })
    
    allItems.push(...response.data)
    
    if (!response.hasNext) break
    page++
  }
  
  return allItems
}
```

### Parallel Processing

```typescript
// Sync multiple entity types in parallel
await Promise.all([
  syncEntityType('services'),
  syncEntityType('materials'),
  syncEntityType('equipment')
])
```

---

## 📊 Sync Status Dashboard (Retool)

### Key Metrics to Display

```typescript
interface SyncStatus {
  lastFullSync: Date
  lastIncrementalSync: Date
  nextScheduledSync: Date
  
  services: {
    total: number
    synced: number
    pending: number
    conflicts: number
  }
  
  materials: {
    total: number
    synced: number
    pending: number
    conflicts: number
  }
  
  equipment: {
    total: number
    synced: number
    pending: number
    conflicts: number
  }
  
  recentErrors: SyncError[]
}
```

### UI Components

1. **Sync Status Card**
   - Green/Yellow/Red indicator
   - "Last synced: 5 minutes ago"
   - "Next sync: in 10 minutes"

2. **Conflict Table**
   - List all conflicts
   - Click to view side-by-side diff
   - Resolve buttons

3. **Sync Logs**
   - Scrollable log of recent syncs
   - Filter by entity type, status
   - Export to CSV

---

## 🚨 Error Handling

### Retry Logic

```typescript
async function syncWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000
      await sleep(delay)
    }
  }
}
```

### Error Categories

1. **Network Errors** → Retry
2. **ST Rate Limit** → Backoff and retry
3. **Validation Errors** → Log and skip item
4. **Conflict Detected** → Store for manual resolution

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
describe('Sync Engine', () => {
  it('detects new items in ST', async () => {
    const stItems = [{ id: 1, name: 'New Service' }]
    const localItems = []
    
    const result = await incrementalSync({ 
      stItems, 
      localItems 
    })
    
    expect(result.newInST).toHaveLength(1)
  })
  
  it('detects conflicts', async () => {
    const stItem = { 
      id: 1, 
      modifiedOn: '2024-12-10T15:00:00Z' 
    }
    
    const localItem = {
      id: 1,
      local_modified_at: '2024-12-10T14:30:00Z',
      last_synced_at: '2024-12-10T10:00:00Z'
    }
    
    const result = await incrementalSync({ 
      stItems: [stItem], 
      localItems: [localItem] 
    })
    
    expect(result.conflicts).toHaveLength(1)
  })
})
```

### Integration Tests

```typescript
describe('End-to-End Sync', () => {
  it('syncs 1000 services from ST', async () => {
    const result = await fullSync({ entityType: 'services' })
    
    expect(result.itemsSynced).toBe(1000)
    expect(result.conflicts).toBe(0)
  })
})
```

---

## 📅 Sync Schedule (Production)

```yaml
# Cron schedule
incremental_sync:
  schedule: "*/15 * * * *"  # Every 15 minutes
  entities: ['services', 'materials', 'equipment', 'categories']

full_sync:
  schedule: "0 2 * * *"  # Daily at 2am
  entities: ['services', 'materials', 'equipment', 'categories']

vendor_price_sync:
  schedule: "0 3 * * *"  # Daily at 3am (after full sync)
  vendors: ['ced', 'pool360', 'homedepot']
```

---

## ✅ Success Criteria

A sync is successful when:

- [ ] All non-conflicting changes applied
- [ ] Conflicts stored for manual resolution
- [ ] No data loss
- [ ] Sync metadata updated
- [ ] Logs written
- [ ] No errors thrown (or retried successfully)

---

*This algorithm is the foundation of the entire system. Test thoroughly before production.*
