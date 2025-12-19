# Perfect Catch Pricebook Builder – Master Deployment Guide

## Document Purpose

This is the **master deployment guide** for building a ServiceTitan-equivalent Pricebook management system. This document orchestrates all other documentation and provides the complete deployment roadmap.

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Stack](#architecture-stack)
3. [Repository Structure](#repository-structure)
4. [Phase-by-Phase Deployment](#phase-by-phase-deployment)
5. [Integration Points](#integration-points)
6. [Testing Strategy](#testing-strategy)
7. [Rollout & Migration](#rollout--migration)

---

## System Overview

### What We're Building

A **production-grade Pricebook management platform** that replicates ServiceTitan's core functionality with enhanced automation and pricing intelligence:

- **Services Management** – Create, edit, categorize labor services
- **Materials Management** – Track parts, consumables, vendor pricing
- **Equipment Management** – Manage installed equipment catalog
- **Category Hierarchy** – Nested category trees for organization
- **Bundling System** – Link materials & equipment to services
- **Vendor Pricing Sync** – Automated price updates from CED, Pool360, Home Depot
- **AI-Powered Search** – Semantic search across entire pricebook
- **Conflict Resolution** – Bidirectional sync with manual override

### Core Principles

1. **ServiceTitan API is Source of Truth** – We mirror, not replace
2. **No Business Logic in UI** – All transforms in backend
3. **Vendor Pricing is Additive** – Enhances ST data, doesn't override
4. **AI Assists, Humans Decide** – All pricing changes require approval
5. **Audit Everything** – Full change tracking and conflict logs

---

## Architecture Stack

### Frontend Layer
- **Retool** – Primary UI (dashboards, forms, tables)
- **React + TypeScript** – Custom components when Retool insufficient
- **Tailwind CSS** – Consistent styling system

### Backend Layer
- **Node.js + Express** – API server
- **@xapp/stentor-service-servicetitan** – ServiceTitan SDK
- **Prisma** – Database ORM
- **PostgreSQL** – Primary data store
- **pgvector** – Embedding storage for AI search

### Automation Layer
- **n8n** – Workflow automation (invoice OCR, price sync)
- **Claude AI** – Document extraction, semantic search
- **Crawl4AI** – Vendor website scraping

### Infrastructure
- **Docker** – Containerization
- **Docker Compose** – Local orchestration
- **PM2** – Production process management
- **PostgreSQL 15+** – Database with vector extension

---

## Repository Structure

```
perfect-catch-st-automation/
├── api/                          # Backend API server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── pricebook.js      # ST proxy routes
│   │   │   ├── sync.js           # Sync engine routes
│   │   │   ├── chat.js           # AI endpoints
│   │   │   └── n8n.js            # Webhook handlers
│   │   ├── services/
│   │   │   ├── serviceTitan.js   # ST API wrapper
│   │   │   ├── syncEngine.js     # Bidirectional sync logic
│   │   │   ├── conflictResolver.js
│   │   │   └── embeddingService.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── validation.js
│   │   │   └── errorHandler.js
│   │   └── server.js
│   ├── prisma/
│   │   └── schema.prisma         # Database schema
│   ├── package.json
│   └── Dockerfile
│
├── retool/                       # Retool app exports
│   ├── apps/
│   │   ├── pricebook-services.json
│   │   ├── pricebook-materials.json
│   │   └── pricebook-dashboard.json
│   └── queries/                  # Reusable queries
│
├── n8n/                          # Automation workflows
│   ├── workflows/
│   │   ├── invoice-ocr-sync.json
│   │   ├── vendor-price-crawl.json
│   │   └── conflict-notification.json
│   └── credentials.json
│
├── docs/                         # All documentation
│   ├── QUICKSTART.md
│   ├── DEPLOYMENT.md
│   ├── API_REFERENCE.md          # Your canonical API doc
│   ├── INTEGRATION.md
│   └── TROUBLESHOOTING.md
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Phase-by-Phase Deployment

### Phase 0: Infrastructure Setup (Week 1)

**Goal:** Get all base services running locally

#### Tasks:
1. **Database Setup**
   ```bash
   docker-compose up -d postgres
   ```
   - Install pgvector extension
   - Run Prisma migrations
   - Seed with test data

2. **API Server**
   ```bash
   cd api
   npm install
   npm run dev
   ```
   - Configure ServiceTitan OAuth
   - Test health endpoints
   - Verify ST proxy works

3. **n8n Setup**
   ```bash
   docker-compose up -d n8n
   ```
   - Import base workflows
   - Configure credentials
   - Test webhook connectivity

#### Success Criteria:
- ✅ All containers running
- ✅ `/health` returns 200
- ✅ Can fetch services from ST via `/pricebook/services`
- ✅ n8n accessible at localhost:5678

---

### Phase 1: Core Pricebook CRUD (Week 2-3)

**Goal:** Full CRUD operations for Services, Materials, Equipment

#### API Implementation:
- Complete all `/pricebook/*` proxy endpoints
- Add request validation middleware
- Implement pagination (ST uses `page` and `pageSize`)
- Add error handling for ST rate limits

#### Retool Apps:
1. **Services Manager**
   - List view with search/filter
   - Detail form (create/edit)
   - Category dropdown (hierarchical)
   - Materials/Equipment bundling UI

2. **Materials Manager**
   - Grid view with inline edit
   - Vendor picker
   - Price history tracking
   - Bulk import form

3. **Equipment Manager**
   - Card/grid view
   - Category assignment
   - Image upload support

#### Testing:
- Create 10 test services
- Link materials to services
- Verify ST reflects changes immediately
- Test error states (network failures, validation)

#### Success Criteria:
- ✅ Can create/edit/delete all entity types
- ✅ Changes sync to ST within 2 seconds
- ✅ UI shows proper error messages
- ✅ No data loss on network interruption

---

### Phase 2: Sync Engine & Conflict Resolution (Week 4-5)

**Goal:** Bidirectional sync with conflict detection

#### Database Enhancements:
Add sync metadata to all tables:
```sql
ALTER TABLE pricebook_services ADD COLUMN sync_status TEXT;
ALTER TABLE pricebook_services ADD COLUMN last_synced_at TIMESTAMP;
ALTER TABLE pricebook_services ADD COLUMN has_conflict BOOLEAN DEFAULT FALSE;
ALTER TABLE pricebook_services ADD COLUMN conflict_data JSONB;
```

#### Sync Engine Logic:
1. **Full Sync** (`POST /api/sync/pricebook/full`)
   - Fetch all ST entities
   - Compare with local DB
   - Detect conflicts (modified in both places)
   - Store conflict data, don't auto-resolve

2. **Incremental Sync** (`POST /api/sync/pricebook/incremental`)
   - Use `modifiedOnOrAfter` parameter
   - Only sync entities changed since last sync
   - Faster for scheduled runs

3. **Conflict Resolution** (`POST /api/sync/pricebook/resolve-conflict/:id`)
   - Manual override: choose ST or local version
   - Log resolution decision
   - Update sync metadata

#### Retool Conflict UI:
- Conflict dashboard showing all pending conflicts
- Side-by-side diff view
- "Use ServiceTitan" / "Use Local" / "Merge" buttons
- Audit log of all resolutions

#### Success Criteria:
- ✅ Sync detects changes made in ST
- ✅ Sync detects changes made locally
- ✅ Conflicts flagged, not auto-resolved
- ✅ Can resolve 100 conflicts in <5 minutes

---

### Phase 3: Vendor Pricing Integration (Week 6-7)

**Goal:** Automated vendor price updates

#### Vendor Scrapers:
Use existing n8n workflows for:
- **CED** – Electrical supplies
- **Pool360** – Pool equipment/chemicals
- **Home Depot** – General materials

#### Price Normalization:
Handle different pricing formats:
```javascript
// CED: per-100 pricing
ced_price = 45.00  // per 100
unit_price = ced_price / 100 = 0.45

// Pool360: per-pack pricing
pool_price = 89.99  // per 6-pack
unit_price = pool_price / 6 = 14.998

// Home Depot: unit pricing
hd_price = 12.47  // each
unit_price = hd_price
```

#### Material Matching:
Use hierarchical matching:
1. Exact product code match
2. Vendor part number match
3. Exact name match
4. Fuzzy name match (85% threshold)
5. Manual review if no match

#### Database Schema:
```sql
CREATE TABLE vendor_prices (
  id UUID PRIMARY KEY,
  material_id BIGINT REFERENCES pricebook_materials(id),
  vendor TEXT,
  vendor_sku TEXT,
  price DECIMAL(10,2),
  price_unit TEXT, -- 'each', 'per-100', 'per-pack'
  pack_quantity INTEGER,
  scraped_at TIMESTAMP,
  is_active BOOLEAN
);
```

#### Retool Price Dashboard:
- Show all materials with vendor prices
- Highlight price changes >10%
- "Update ST Price" button (calls API)
- Price history chart

#### Success Criteria:
- ✅ 90%+ materials matched to vendor SKUs
- ✅ Prices update nightly via n8n
- ✅ No accidental price overwrites
- ✅ Audit log of all price changes

---

### Phase 4: AI-Powered Search (Week 8)

**Goal:** Semantic search across entire pricebook

#### Embedding Generation:
```javascript
// For each material/service/equipment
const text = `${item.name} ${item.description} ${item.code}`;
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: text
});

await prisma.pricebook_materials.update({
  where: { id: item.id },
  data: { embedding: embedding.data[0].embedding }
});
```

#### Search Endpoint:
```javascript
POST /chat/pricebook
{
  "query": "1.5 inch PVC pipe connector",
  "limit": 20
}

// Returns:
{
  "results": [
    {
      "type": "material",
      "id": 9404,
      "name": "PVC Coupling 1.5\"",
      "similarity": 0.92
    }
  ]
}
```

#### Retool Integration:
- Search bar at top of all pages
- Instant results as you type
- Jump to detail page on click

#### Success Criteria:
- ✅ Search responds in <500ms
- ✅ Finds relevant items with misspellings
- ✅ Works across all entity types
- ✅ Better than ST's native search

---

### Phase 5: Advanced Features (Week 9-10)

**Goal:** Power user features

#### Bulk Operations:
- Import materials from CSV
- Batch price updates
- Duplicate service with variations
- Archive unused items

#### Analytics:
- Most-used services dashboard
- Price trend analysis
- Category distribution charts
- Vendor spend analysis

#### Automation:
- Auto-categorize new materials (AI)
- Price alert webhooks to Slack
- Weekly price sync reports
- Low-stock alerts (future integration)

---

## Integration Points

### ServiceTitan API
- **Authentication:** OAuth 2.0 via @xapp/stentor-service-servicetitan
- **Rate Limits:** 120 requests/minute
- **Pagination:** Max 500 items per page
- **Webhooks:** Not available (use polling)

### n8n Workflows
- **Invoice OCR:** Trigger via webhook, return structured data
- **Vendor Scraper:** Scheduled daily, outputs JSON
- **Conflict Alerts:** Email/Slack when conflicts detected

### Retool
- **API Base URL:** `https://api.perfectcatch.app`
- **Auth:** Bearer token (service account)
- **Query Pattern:** One endpoint per query, manual trigger
- **Error Handling:** Show notification on failure

---

## Testing Strategy

### Unit Tests
- All sync engine functions
- Material matching algorithm
- Price normalization logic

### Integration Tests
- Full sync flow (ST → Local)
- Conflict creation and resolution
- Vendor price import

### E2E Tests
- Create service in Retool → Verify in ST
- Modify material in ST → Sync to local → Verify in Retool
- Import vendor prices → Match materials → Update ST

### Load Tests
- 10,000 materials sync performance
- 100 concurrent API requests
- Search with 50,000 embeddings

---

## Rollout & Migration

### Pre-Launch Checklist
- [ ] All Phase 1-3 features complete
- [ ] Sync runs successfully 10 times
- [ ] No unresolved conflicts in test data
- [ ] Retool apps tested by 3 users
- [ ] Backup ServiceTitan data (export all pricebooks)

### Launch Day
1. Run full sync at 2am (low activity)
2. Verify no conflicts
3. Enable Retool for power users (5 people)
4. Monitor error logs for 24 hours
5. Collect feedback

### Week 1 Post-Launch
- Fix any critical bugs
- Adjust UI based on feedback
- Tune sync frequency (daily? hourly?)

### Week 2+
- Roll out to all users
- Deprecate direct ST pricebook editing
- Enable vendor pricing automation
- Launch AI search

---

## Success Metrics

- **Pricebook Accuracy:** 99%+ match with ST
- **Sync Performance:** <5 minutes for full sync
- **User Adoption:** 80% of pricebook edits via Retool
- **Vendor Price Coverage:** 90%+ materials have vendor data
- **Search Quality:** 95%+ relevant results in top 5

---

## Related Documents

- `API_REFERENCE.md` – Complete API endpoint documentation
- `RETOOL_PATTERNS.md` – UI component best practices
- `SYNC_ENGINE_SPEC.md` – Detailed sync algorithm
- `VENDOR_INTEGRATION.md` – Scraper setup and matching logic
- `TROUBLESHOOTING.md` – Common issues and fixes

---

## Contact & Support

- **Primary Owner:** Yanni Ramos
- **Repo:** `perfect-catch-st-automation`
- **Slack:** #pricebook-automation
- **Docs:** This repository

---

*Last Updated: 2024-12-13*
*Version: 1.0*
