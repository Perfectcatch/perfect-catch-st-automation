# Implementation Checklist – Perfect Catch Pricebook Builder

## 📋 Purpose

This is your **step-by-step checklist** for building the entire Pricebook system. Check off each item as you complete it. Estimated timeline: **8-10 weeks**.

---

## 🏗️ Phase 0: Infrastructure Setup (Week 1)

### Database Setup
- [ ] Install PostgreSQL 15+
- [ ] Install pgvector extension
- [ ] Create database: `pricebook`
- [ ] Configure connection string in `.env`
- [ ] Test connection: `psql -U user pricebook`

### Prisma Setup
- [ ] Install Prisma: `npm install prisma @prisma/client`
- [ ] Create `prisma/schema.prisma` (see SYNC_ENGINE_SPEC.md for schema)
- [ ] Add core tables:
  - [ ] `pricebook_services`
  - [ ] `pricebook_materials`
  - [ ] `pricebook_equipment`
  - [ ] `pricebook_categories`
  - [ ] `vendor_prices`
  - [ ] `sync_logs`
  - [ ] `conflict_resolutions`
- [ ] Run migration: `npx prisma migrate dev`
- [ ] Generate client: `npx prisma generate`
- [ ] Test query: `npx prisma studio`

### API Server Setup
- [ ] Create `api/` directory
- [ ] Initialize Node.js: `npm init -y`
- [ ] Install dependencies:
  ```bash
  npm install express cors dotenv
  npm install @xapp/stentor-service-servicetitan
  npm install @prisma/client
  npm install zod
  npm install -D typescript @types/node @types/express
  npm install -D nodemon ts-node
  ```
- [ ] Create `api/src/server.ts`
- [ ] Setup TypeScript: `npx tsc --init`
- [ ] Configure CORS for Retool domain
- [ ] Create `.env` from `.env.example`
- [ ] Test server: `npm run dev` → `http://localhost:3000/health`

### ServiceTitan OAuth Setup
- [ ] Create ServiceTitan app (developer.servicetitan.io)
- [ ] Get credentials:
  - [ ] Client ID
  - [ ] Client Secret
  - [ ] Tenant ID
  - [ ] App Key
- [ ] Add to `.env`
- [ ] Test connection:
  ```bash
  curl http://localhost:3000/pricebook/services?page=1&pageSize=10
  ```
- [ ] Verify data returned

### n8n Setup
- [ ] Install n8n: `docker-compose up -d n8n`
- [ ] Access: `http://localhost:5678`
- [ ] Create credentials:
  - [ ] ServiceTitan OAuth
  - [ ] PostgreSQL
  - [ ] Anthropic API (Claude)
- [ ] Import existing workflows:
  - [ ] Invoice OCR with Price Book Sync
  - [ ] Vendor Price Crawler
- [ ] Test webhook: `curl -X POST http://localhost:5678/webhook-test`

### Docker Compose Verification
- [ ] All containers running:
  ```bash
  docker-compose ps
  # postgres   ✓
  # n8n        ✓
  # api        ✓ (if dockerized)
  ```
- [ ] Logs clean (no errors):
  ```bash
  docker-compose logs --tail=50
  ```

---

## 🔌 Phase 1: Core API Proxies (Week 2)

### Services Endpoints
- [ ] `GET /pricebook/services` (list with pagination)
- [ ] `GET /pricebook/services/:id` (single service)
- [ ] `POST /pricebook/services` (create)
- [ ] `PATCH /pricebook/services/:id` (update)
- [ ] `DELETE /pricebook/services/:id` (soft delete)
- [ ] Test all endpoints in Postman
- [ ] Verify sync to ServiceTitan
- [ ] Add request validation (Zod schemas)
- [ ] Add error handling middleware
- [ ] Test rate limiting (120 req/min)

### Materials Endpoints
- [ ] `GET /pricebook/materials`
- [ ] `GET /pricebook/materials/:id`
- [ ] `POST /pricebook/materials`
- [ ] `PATCH /pricebook/materials/:id`
- [ ] `DELETE /pricebook/materials/:id`
- [ ] Test all endpoints
- [ ] Verify vendor pricing fields preserved

### Equipment Endpoints
- [ ] `GET /pricebook/equipment`
- [ ] `GET /pricebook/equipment/:id`
- [ ] `POST /pricebook/equipment`
- [ ] `PATCH /pricebook/equipment/:id`
- [ ] `DELETE /pricebook/equipment/:id`
- [ ] Test all endpoints

### Categories Endpoints
- [ ] `GET /pricebook/categories` (hierarchical tree)
- [ ] `POST /pricebook/categories`
- [ ] `PATCH /pricebook/categories/:id`
- [ ] `DELETE /pricebook/categories/:id`
- [ ] Test parent-child relationships
- [ ] Verify tree structure correct

### Pagination & Filtering
- [ ] All list endpoints support `page` & `pageSize`
- [ ] Support `search` query parameter
- [ ] Support `categoryId` filter (for materials/services)
- [ ] Support `isActive` filter
- [ ] Return `hasNext` and `totalCount` in responses
- [ ] Test with 1000+ records

---

## 🎨 Phase 2: Retool Apps (Week 3)

### Services Manager App
- [ ] Create new Retool app: "Pricebook - Services"
- [ ] Add table component:
  - [ ] Columns: Name, Code, Category, Price, Status
  - [ ] Search bar above table
  - [ ] Pagination controls
- [ ] Add "New Service" button
- [ ] Create modal form for new/edit:
  - [ ] Name (text input)
  - [ ] Code (text input)
  - [ ] Category (hierarchical select)
  - [ ] Description (textarea)
  - [ ] Price (currency input)
  - [ ] Labor Cost (currency input)
  - [ ] Duration (number + unit dropdown)
  - [ ] Is Active (toggle)
- [ ] Add materials table (inline):
  - [ ] Search materials
  - [ ] Add to service
  - [ ] Set quantity
  - [ ] Remove button
- [ ] Add equipment table (inline)
- [ ] Save button → PATCH /pricebook/services/:id
- [ ] Cancel button → Close modal
- [ ] Test create flow
- [ ] Test edit flow
- [ ] Test delete flow

### Materials Manager App
- [ ] Create new Retool app: "Pricebook - Materials"
- [ ] Add table with columns:
  - [ ] Name, Code, Vendor, Cost, Vendor Price, Diff %
- [ ] Add search & filter
- [ ] Add "New Material" button
- [ ] Create form modal:
  - [ ] All material fields
  - [ ] Vendor pricing section (read-only, from vendor_prices)
- [ ] Add inline edit for quantity fields
- [ ] Test CRUD operations

### Equipment Manager App
- [ ] Create new Retool app: "Pricebook - Equipment"
- [ ] Similar to Materials app
- [ ] Card/grid view option
- [ ] Image upload support
- [ ] Test CRUD

### Category Management
- [ ] Add category tree component (drag-drop reorder)
- [ ] Create/edit/delete categories
- [ ] Move categories (change parent)
- [ ] Test hierarchy updates in ST

---

## 🔄 Phase 3: Sync Engine (Week 4-5)

### Database Sync Metadata
- [ ] Add columns to all tables:
  ```sql
  sync_status TEXT
  sync_direction TEXT
  last_synced_at TIMESTAMP
  st_modified_on TIMESTAMP
  local_modified_at TIMESTAMP
  has_conflict BOOLEAN
  conflict_data JSONB
  conflict_resolved_at TIMESTAMP
  conflict_resolution TEXT
  resolved_by TEXT
  deleted_at TIMESTAMP
  deleted_in_st BOOLEAN
  ```
- [ ] Run migration
- [ ] Create indexes on sync fields

### Full Sync Implementation
- [ ] Create `api/src/services/syncEngine.ts`
- [ ] Implement `fullSync()`:
  - [ ] Fetch all items from ST (paginated)
  - [ ] Fetch all items from local DB
  - [ ] Compare versions
  - [ ] Categorize changes (new, modified, deleted, conflict)
  - [ ] Apply non-conflicting changes
  - [ ] Store conflicts
- [ ] Test with 100 services
- [ ] Test with 1000 materials
- [ ] Measure performance

### Incremental Sync Implementation
- [ ] Implement `incrementalSync()`:
  - [ ] Use `modifiedOnOrAfter` parameter
  - [ ] Only fetch changed items
  - [ ] Same comparison logic as full sync
- [ ] Test with recent changes only
- [ ] Verify faster than full sync

### Conflict Detection
- [ ] Implement timestamp comparison:
  ```typescript
  if (stModifiedOn > localStModifiedOn && 
      localModifiedAt > lastSyncedAt) {
    // CONFLICT
  }
  ```
- [ ] Store conflict data:
  ```json
  {
    "st_version": {...},
    "local_version": {...},
    "diff": {
      "fields": ["price", "name"],
      "st_values": {...},
      "local_values": {...}
    }
  }
  ```
- [ ] Test conflict creation
- [ ] Verify no auto-resolution

### Conflict Resolution Endpoints
- [ ] `GET /api/sync/pricebook/conflicts` (list all)
- [ ] `GET /api/sync/pricebook/conflicts/:id` (single conflict)
- [ ] `POST /api/sync/pricebook/resolve-conflict/:id`:
  - [ ] Accept `resolution: 'use_st' | 'use_local' | 'merged'`
  - [ ] If `use_st`: overwrite local with ST version
  - [ ] If `use_local`: push local to ST via API
  - [ ] If `merged`: use provided merged data
  - [ ] Log resolution
  - [ ] Mark conflict as resolved
- [ ] Test all resolution methods

### Sync Scheduling
- [ ] Create cron job for incremental sync (every 15 min)
- [ ] Create cron job for full sync (daily at 2am)
- [ ] Log all sync runs
- [ ] Alert on sync failures (email/Slack)

### Retool Sync Dashboard
- [ ] Create "Sync Status" app
- [ ] Show metrics:
  - [ ] Last full sync
  - [ ] Last incremental sync
  - [ ] Items synced (services, materials, equipment)
  - [ ] Pending conflicts
  - [ ] Recent errors
- [ ] "Run Full Sync Now" button
- [ ] Sync logs table (paginated)

### Retool Conflict Resolution UI
- [ ] Add to Sync Dashboard
- [ ] Table of all conflicts:
  - [ ] Entity type
  - [ ] Entity name
  - [ ] Fields in conflict
  - [ ] Detected at
- [ ] Click row → Side-by-side diff modal:
  - [ ] ST version (left)
  - [ ] Local version (right)
  - [ ] Highlight differences
  - [ ] Resolution buttons:
    - [ ] "Use ServiceTitan"
    - [ ] "Use Local"
    - [ ] "Merge" (manual field picker)
- [ ] Test resolving conflicts

---

## 💰 Phase 4: Vendor Pricing (Week 6-7)

### Vendor Price Schema
- [ ] Create `vendor_prices` table (if not exists)
- [ ] Columns:
  - [ ] id, material_id, vendor, vendor_sku, vendor_name
  - [ ] raw_price, price_unit, pack_quantity, unit_price
  - [ ] scraped_at, scraped_from, is_active
  - [ ] previous_price, price_changed_at
- [ ] Create indexes
- [ ] Test inserts/queries

### n8n Invoice OCR Workflow
- [ ] Verify existing workflow works
- [ ] Test with sample CED invoice
- [ ] Test with sample Pool360 invoice
- [ ] Test with sample Home Depot invoice
- [ ] Verify pipe-delimited output:
  ```
  Name | Product Code | Cost
  ```
- [ ] Fix any extraction errors

### Price Normalization Service
- [ ] Create `api/src/services/priceNormalization.ts`
- [ ] Implement `detectPriceUnit(text)`:
  - [ ] Detect "each", "per-100", "per-1000", "per-pack"
  - [ ] Extract pack quantity if needed
- [ ] Implement `normalizeToUnitPrice(rawPrice, unit, packQty)`:
  - [ ] Convert all to "per each" pricing
- [ ] Write unit tests (10+ test cases)
- [ ] Verify accuracy 100%

### Material Matching Engine
- [ ] Create `api/src/services/materialMatching.ts`
- [ ] Implement hierarchical matching:
  1. [ ] Exact product code match
  2. [ ] Vendor part number match
  3. [ ] Exact name match (case-insensitive)
  4. [ ] Fuzzy name match (≥85% similarity)
  5. [ ] Manual review queue
- [ ] Use Levenshtein distance for fuzzy matching
- [ ] Return confidence score (0.0-1.0)
- [ ] Test with 100 vendor items
- [ ] Measure accuracy (target: 90%+)

### Vendor Price Import Endpoint
- [ ] `POST /api/vendor-prices/import`
- [ ] Accept pipe-delimited text or JSON array
- [ ] Parse items
- [ ] Normalize prices
- [ ] Match to materials
- [ ] Store in `vendor_prices` table
- [ ] Return summary:
  ```json
  {
    "total": 50,
    "matched": 45,
    "unmatched": 5,
    "requiresReview": [...]
  }
  ```
- [ ] Test import flow end-to-end

### Retool Price Dashboard
- [ ] Create "Vendor Pricing" app
- [ ] Table showing all materials with vendor prices:
  - [ ] Material Name
  - [ ] ST Cost
  - [ ] CED Price
  - [ ] Pool360 Price
  - [ ] Home Depot Price
  - [ ] Best Price
  - [ ] Diff %
  - [ ] Last Updated
- [ ] Highlight rows with >10% difference
- [ ] "Update ST Price" button:
  - [ ] Show confirmation dialog
  - [ ] PATCH /pricebook/materials/:id
  - [ ] Log change in audit table
- [ ] Filter by vendor
- [ ] Filter by price change threshold

### Unmatched Items Queue
- [ ] Add tab to Price Dashboard
- [ ] Table of unmatched vendor items:
  - [ ] Vendor, SKU, Name, Price
  - [ ] Attempted matches (show similar materials)
  - [ ] Confidence scores
- [ ] Actions:
  - [ ] "Link to Existing Material" (dropdown search)
  - [ ] "Create New Material"
  - [ ] "Ignore"
- [ ] Test resolution workflow

### Price Change Alerts
- [ ] Create alert service
- [ ] Check for price changes >10% daily
- [ ] Send Slack notification:
  ```
  🚨 Price Alert: PVC Coupling 1.5"
  Old: $2.47 → New: $3.12 (+26%)
  Vendor: CED
  [Update in ST]
  ```
- [ ] Test alert flow

### Vendor Price History
- [ ] Store price changes in `vendor_price_history` table
- [ ] Add chart to Material detail page
- [ ] Show trend over time (last 90 days)
- [ ] Test with fluctuating prices

---

## 🤖 Phase 5: AI Search (Week 8)

### Embedding Generation
- [ ] Install OpenAI SDK: `npm install openai`
- [ ] Create `api/src/services/embeddingService.ts`
- [ ] Implement `generateEmbedding(text)`:
  - [ ] Use `text-embedding-3-small` model
  - [ ] Return 1536-dim vector
- [ ] Add `embedding` column to tables (type: `vector(1536)`)
- [ ] Create migration
- [ ] Generate embeddings for all materials:
  ```typescript
  for (const material of materials) {
    const text = `${material.name} ${material.description} ${material.code}`
    const embedding = await generateEmbedding(text)
    await prisma.material.update({
      where: { id: material.id },
      data: { embedding }
    })
  }
  ```
- [ ] Test embedding generation

### Semantic Search Endpoint
- [ ] `POST /chat/pricebook`
- [ ] Accept `{ query: string, limit: number }`
- [ ] Generate query embedding
- [ ] Search using cosine similarity:
  ```sql
  SELECT *, 
    1 - (embedding <=> $queryEmbedding) AS similarity
  FROM pricebook_materials
  WHERE deleted_at IS NULL
  ORDER BY similarity DESC
  LIMIT $limit
  ```
- [ ] Return results with similarity scores
- [ ] Test search quality:
  - [ ] "1.5 inch PVC pipe" → finds PVC materials
  - [ ] "lighting fixture" → finds lights
  - [ ] Misspellings work (e.g., "lite bulb")

### Retool Search Integration
- [ ] Add search bar to header (global)
- [ ] On keyup (debounced 300ms):
  - [ ] Call `/chat/pricebook` with query
  - [ ] Show dropdown of top 10 results
  - [ ] Display: name, code, similarity %
- [ ] Click result → Navigate to detail page
- [ ] Test search speed (<500ms)

---

## 🚀 Phase 6: Advanced Features (Week 9)

### Bulk Operations
- [ ] Create "Bulk Import" page in Retool
- [ ] Upload CSV of materials
- [ ] Preview import (table with validation)
- [ ] "Import All" button
- [ ] Progress bar
- [ ] Test with 500 materials

### Price Analytics
- [ ] Create "Analytics" dashboard
- [ ] Charts:
  - [ ] Price trend over time
  - [ ] Vendor spend breakdown
  - [ ] Most expensive materials
  - [ ] Category distribution
- [ ] Filters: date range, vendor, category

### Auto-Categorization (AI)
- [ ] Endpoint: `POST /api/materials/auto-categorize`
- [ ] Use Claude to suggest category based on name/description
- [ ] Return top 3 suggestions with confidence
- [ ] User approves/rejects

---

## 🧪 Phase 7: Testing (Week 10)

### Unit Tests
- [ ] Sync engine functions (10+ tests)
- [ ] Material matching (20+ tests)
- [ ] Price normalization (15+ tests)
- [ ] Conflict detection (10+ tests)
- [ ] Test coverage >80%

### Integration Tests
- [ ] Full sync (ST → Local → Verify)
- [ ] Incremental sync
- [ ] Conflict creation and resolution
- [ ] Vendor price import → match → update ST
- [ ] Test with 10,000 records

### E2E Tests (Playwright/Cypress)
- [ ] Create service in Retool → Verify in ST
- [ ] Modify material in ST → Sync → Verify in Retool
- [ ] Import vendor prices → Update ST → Check audit log
- [ ] Search for material → Find correct result

### Load Tests (k6)
- [ ] 100 concurrent API requests
- [ ] Sync 10,000 materials
- [ ] Search with 50,000 embeddings
- [ ] Verify response times <2 seconds

### User Acceptance Testing
- [ ] 5 users test all features
- [ ] Collect feedback
- [ ] Fix critical bugs
- [ ] Retest

---

## 🌐 Phase 8: Deployment (Week 10)

### Production Environment
- [ ] Setup production server (AWS/DigitalOcean)
- [ ] Configure database (managed PostgreSQL)
- [ ] Install pgvector extension
- [ ] Deploy API server
- [ ] Configure environment variables (secrets)
- [ ] Setup SSL certificate
- [ ] Configure reverse proxy (nginx)

### Docker Deployment
- [ ] Create `Dockerfile` for API
- [ ] Create `docker-compose.prod.yml`
- [ ] Build images: `docker-compose build`
- [ ] Push to registry: `docker push`
- [ ] Deploy: `docker-compose up -d`

### Monitoring & Logging
- [ ] Setup logging (Winston/Pino)
- [ ] Setup error tracking (Sentry)
- [ ] Setup uptime monitoring (UptimeRobot)
- [ ] Setup performance monitoring (New Relic/Datadog)
- [ ] Create alerts for:
  - [ ] API errors >10/min
  - [ ] Sync failures
  - [ ] Database connection issues

### Backup & Recovery
- [ ] Automated database backups (daily)
- [ ] Test restore process
- [ ] Document recovery steps

### Security Audit
- [ ] Review authentication (OAuth tokens secure)
- [ ] Review authorization (who can access what)
- [ ] Scan for vulnerabilities: `npm audit`
- [ ] Update dependencies
- [ ] Enable rate limiting
- [ ] Enable CORS (whitelist Retool domain)

### Documentation
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] User manual (for Retool apps)

### Launch Checklist
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Security audit clean
- [ ] Backups tested
- [ ] Monitoring active
- [ ] User training complete
- [ ] Rollback plan documented

---

## 📊 Success Metrics

### Technical Metrics
- [ ] API uptime: 99.9%
- [ ] Sync accuracy: 99%+
- [ ] Sync performance: <5 min full sync
- [ ] API response time: <2 sec (p95)
- [ ] Search quality: 95%+ relevant results
- [ ] Vendor price match rate: 90%+

### Business Metrics
- [ ] User adoption: 80%+ using Retool (vs ST directly)
- [ ] Time saved: 10+ hours/week (vs manual pricebook editing)
- [ ] Cost savings: $X from vendor pricing automation
- [ ] Conflicts resolved: <24 hours average

---

## 🎉 Project Complete!

When all items above are checked, you have successfully built a production-grade ServiceTitan Pricebook management system.

**Congratulations!** 🚀

---

**Next Steps:**
1. Print this checklist
2. Work through Phase 0
3. Check off items as you go
4. Celebrate milestones (each phase completion)

*Update this checklist as requirements evolve.*
