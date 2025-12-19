# Perfect Catch Pricebook Builder – Complete Documentation Package

## 📦 What's in This Package

This is the **complete documentation set** for building a production-grade ServiceTitan Pricebook management system. Everything you need to deploy this system from scratch is included.

---

## 📁 File Structure

```
pricebook-docs/
├── README.md (this file)
│
├── MASTER_DEPLOYMENT_GUIDE.md
│   └── High-level overview, architecture, phase-by-phase deployment
│
├── windsurf-prompts/
│   ├── WINDSURF_MASTER_PROMPT.md
│   │   └── Complete prompt for Windsurf to build entire frontend
│   └── WINDSURF_UI_REPLICATION_PROMPT.md
│       └── Detailed UI replication guide with code examples
│
├── architecture/
│   ├── SYNC_ENGINE_SPEC.md
│   │   └── Exact algorithm for bidirectional sync
│   └── VENDOR_INTEGRATION.md
│       └── How vendor pricing flows through the system
│
└── api-specs/
    └── (Your existing API_REFERENCE.md should be placed here)
```

---

## 🚀 Quick Start Guide

### For AI Agents (Windsurf / Claude / Cursor)

**Step 1:** Read this order:
1. `MASTER_DEPLOYMENT_GUIDE.md` – Get overall context
2. `API_REFERENCE.md` – Understand all endpoints
3. `WINDSURF_MASTER_PROMPT.md` – Detailed implementation guide

**Step 2:** Copy this prompt to Windsurf:

```
I'm building a production ServiceTitan Pricebook management system.

Context:
- React + TypeScript frontend
- Existing Node.js API backend (all endpoints documented)
- Must replicate ServiceTitan UI exactly
- Integrate vendor pricing automation
- Handle bidirectional sync with conflict resolution

I have complete documentation:
1. MASTER_DEPLOYMENT_GUIDE.md – Architecture overview
2. API_REFERENCE.md – All endpoints
3. WINDSURF_MASTER_PROMPT.md – Step-by-step implementation
4. Service_HTML – Exact UI to replicate
5. SYNC_ENGINE_SPEC.md – Sync logic
6. VENDOR_INTEGRATION.md – Vendor pricing

Let's start with project setup. Ready?
```

Then paste the contents of each file when requested.

### For Human Developers

**Day 1:** Infrastructure
1. Read `MASTER_DEPLOYMENT_GUIDE.md` (1 hour)
2. Read `API_REFERENCE.md` (30 min)
3. Setup database, API server, n8n (see guide)
4. Test all `/health`, `/pricebook/*` endpoints

**Day 2-3:** Frontend
1. Read `WINDSURF_MASTER_PROMPT.md`
2. Follow project setup section
3. Build core pages (services, materials)
4. Integrate with API

**Day 4-5:** Sync & Vendor Pricing
1. Read `SYNC_ENGINE_SPEC.md`
2. Implement sync dashboard in Retool
3. Read `VENDOR_INTEGRATION.md`
4. Setup vendor price workflows

**Day 6-7:** Testing & Polish
1. End-to-end testing
2. Fix edge cases
3. User acceptance testing
4. Deploy to production

---

## 🎯 Key Concepts

### 1. ServiceTitan is Source of Truth

All pricebook data lives in ServiceTitan. Our system:
- **Mirrors** ST data locally (for speed, vendor pricing)
- **Syncs bidirectionally** (changes in either place)
- **Detects conflicts** (requires manual resolution)
- **Never auto-overwrites** ST data

### 2. Three-Layer Architecture

```
Frontend (React/Retool)
    ↓ REST API
Backend (Node.js + Express)
    ↓ ServiceTitan SDK
ServiceTitan API
```

All business logic in backend. Frontend just renders & triggers.

### 3. Vendor Pricing is Additive

ServiceTitan doesn't have vendor pricing fields. We add this via:
- Separate `vendor_prices` table
- Links to `pricebook_materials` by ID
- Displayed side-by-side in UI
- Updated automatically via n8n + invoice OCR

### 4. Conflict Resolution is Manual

When same item edited in both ST and locally:
1. System detects conflict (compares timestamps)
2. Stores both versions in `conflict_data` JSONB
3. Shows side-by-side diff in Retool
4. User chooses: "Use ST", "Use Local", or "Merge"
5. Audit log records decision

---

## 📊 Data Flow Examples

### Creating a New Service

```
User fills form in Retool
    ↓
POST /pricebook/services
    ↓
Backend validates, calls ST API
    ↓
ST creates service, returns ID
    ↓
Backend stores in local DB with sync metadata
    ↓
Returns to frontend
    ↓
Retool shows success, refetches list
```

### Vendor Price Update

```
Invoice arrives (email/upload)
    ↓
n8n receives webhook
    ↓
Sends PDF to Claude AI for OCR
    ↓
Returns pipe-delimited: Name | Code | Price
    ↓
n8n calls /api/vendor-prices/import
    ↓
Backend matches to materials (hierarchical matching)
    ↓
Stores in vendor_prices table
    ↓
Retool price dashboard shows new prices
    ↓
User reviews, clicks "Update ST"
    ↓
PATCH /pricebook/materials/:id { cost: vendor_price }
    ↓
ST updated, audit logged
```

### Incremental Sync (Every 15 min)

```
Cron triggers POST /api/sync/pricebook/incremental
    ↓
Backend fetches ST changes since last sync
    ↓
Compares with local DB
    ↓
Categorizes: new, modified, deleted, conflicts
    ↓
Updates non-conflicting items
    ↓
Stores conflicts for manual review
    ↓
Returns summary
```

---

## 🔐 Environment Setup

### Required Environment Variables

```bash
# .env
NODE_ENV=development
PORT=3000

# ServiceTitan OAuth
ST_CLIENT_ID=your_client_id
ST_CLIENT_SECRET=your_client_secret
ST_TENANT_ID=your_tenant_id
ST_APP_KEY=your_app_key

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pricebook
DIRECT_URL=postgresql://user:pass@localhost:5432/pricebook

# n8n
N8N_WEBHOOK_URL=http://localhost:5678/webhook

# Claude AI
ANTHROPIC_API_KEY=sk-ant-...

# Vendor APIs (if available)
CED_API_KEY=optional
POOL360_API_KEY=optional
```

### Database Setup

```bash
# Install PostgreSQL with pgvector
docker-compose up -d postgres

# Run migrations
cd api
npx prisma migrate deploy

# Seed initial data
npx prisma db seed
```

---

## 🧪 Testing Strategy

### Unit Tests
- All sync engine functions
- Material matching algorithm
- Price normalization logic

### Integration Tests
- Full sync flow (ST → Local → Retool)
- Vendor price import → match → update ST
- Conflict creation → resolution

### E2E Tests
- Create service in Retool → Verify in ST
- Modify material in ST → Sync → Verify in Retool
- Import vendor prices → Match → Update → Audit

### Load Tests
- Sync 10,000 materials
- 100 concurrent API requests
- Search with 50,000 embeddings

---

## 📚 Additional Resources

### ServiceTitan Documentation
- API Docs: https://developer.servicetitan.io/
- Pricebook API: https://developer.servicetitan.io/apis/pricebook/v2

### Tech Stack Docs
- React Query: https://tanstack.com/query/latest
- Prisma: https://www.prisma.io/docs
- n8n: https://docs.n8n.io/
- Retool: https://docs.retool.com/

### Our Custom Packages
- @xapp/stentor-service-servicetitan: NPM package for ST integration
- Deployed at: https://www.npmjs.com/package/@xapp/stentor-service-servicetitan

---

## 🚨 Common Issues & Solutions

### Issue: "ServiceTitan rate limit exceeded"
**Solution:** Implement exponential backoff in API client. Max 120 req/min.

### Issue: "Sync creates duplicate materials"
**Solution:** Check `sync_status` before creating. Use upsert pattern.

### Issue: "Vendor prices not matching materials"
**Solution:** Lower fuzzy match threshold from 0.85 to 0.80. Review queue manually.

### Issue: "Conflicts not detected"
**Solution:** Verify `last_synced_at` timestamps updating correctly. Check sync cron.

### Issue: "Retool query times out"
**Solution:** Add pagination to API. Use `page` and `pageSize` params.

---

## 🎓 Learning Path

### For Backend Developers
1. Read `API_REFERENCE.md`
2. Understand ServiceTitan API patterns
3. Study `SYNC_ENGINE_SPEC.md`
4. Implement one entity type (materials)
5. Expand to all entity types

### For Frontend Developers
1. Read `WINDSURF_UI_REPLICATION_PROMPT.md`
2. Study Service_HTML structure
3. Build one page (services list)
4. Connect to API with React Query
5. Add loading/error states

### For Integrations Engineers
1. Read `VENDOR_INTEGRATION.md`
2. Study existing n8n workflows
3. Add new vendor (follow CED pattern)
4. Improve matching algorithm
5. Build price analytics

---

## ✅ Project Milestones

### Phase 1: Foundation (Week 1)
- [ ] Database setup with pgvector
- [ ] API server running
- [ ] All `/pricebook/*` proxies working
- [ ] Basic Retool apps created

### Phase 2: Core CRUD (Week 2-3)
- [ ] Full CRUD for services, materials, equipment
- [ ] Category hierarchy working
- [ ] Materials/equipment bundling in services
- [ ] UI matches ServiceTitan 95%+

### Phase 3: Sync Engine (Week 4-5)
- [ ] Full sync implemented
- [ ] Incremental sync working (15 min cron)
- [ ] Conflict detection accurate
- [ ] Manual resolution UI complete

### Phase 4: Vendor Pricing (Week 6-7)
- [ ] Invoice OCR working (CED, Pool360, HD)
- [ ] Material matching 90%+ accurate
- [ ] Price dashboard in Retool
- [ ] Auto-update flow tested

### Phase 5: Production (Week 8-10)
- [ ] All tests passing
- [ ] Performance optimized
- [ ] User training complete
- [ ] Deployed to production
- [ ] Monitoring setup

---

## 🏆 Success Criteria

This project is **production-ready** when:

- ✅ Pricebook data 99%+ accurate (compared to ST)
- ✅ Sync completes in <5 minutes for full sync
- ✅ 90%+ vendor prices auto-matched
- ✅ Zero data loss in 30 days
- ✅ All conflicts resolved within 24 hours
- ✅ UI response time <2 seconds
- ✅ No manual ST editing required
- ✅ 80%+ user adoption

---

## 📞 Support

- **Repository:** perfect-catch-st-automation
- **Owner:** Yanni Ramos
- **Email:** yanni@perfectcatch.app
- **Slack:** #pricebook-automation

---

## 📝 Version History

- **v1.0** (2024-12-13): Initial documentation package
  - Master deployment guide
  - Complete Windsurf prompts
  - Architecture specs
  - API reference integration

---

**Next Steps:**

1. Read `MASTER_DEPLOYMENT_GUIDE.md` for context
2. Setup development environment
3. Copy `WINDSURF_MASTER_PROMPT.md` to Windsurf
4. Start building!

*This is a living document. Update as the system evolves.*
