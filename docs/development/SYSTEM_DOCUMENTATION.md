# Perfect Catch ST Automation - Complete System Documentation

**Version:** 2.0.0  
**Last Updated:** December 15, 2025  
**Container:** `perfect-catch-st-automation`  
**Port:** 3001  

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [API Modules & Endpoints](#api-modules--endpoints)
4. [Databases](#databases)
5. [Pricebook Sync Engine](#pricebook-sync-engine)
6. [AI Chat Agent](#ai-chat-agent)
7. [n8n Integration & Job Sync](#n8n-integration--job-sync)
8. [Docker Configuration](#docker-configuration)
9. [Environment Variables](#environment-variables)
10. [Scripts & Utilities](#scripts--utilities)

---

## System Overview

**Perfect Catch ST Automation** is a comprehensive ServiceTitan API proxy and automation server that provides:

- **372+ API Endpoints** proxying ServiceTitan's API across 19 modules
- **Pricebook Sync Engine** for bidirectional sync between local PostgreSQL and ServiceTitan
- **AI Chat Agent** for conversational pricebook management and estimate building
- **Job Sync Workflow** for syncing jobs to GoHighLevel (GHL) CRM
- **Customer Enrichment** for fetching customer data from ServiceTitan
- **n8n Integration** for workflow automation
- **VAPI Integration** for voice AI real-time availability

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | Express.js 4.21 |
| Database ORM | Prisma 5.22 |
| Database | PostgreSQL (2 databases) |
| Cache | Redis (ioredis) |
| AI | OpenAI GPT-4 |
| Logging | Pino |
| Validation | Zod |
| Testing | Vitest |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Perfect Catch ST Automation                       │
│                         (Port 3001)                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   Express    │  │   Prisma     │  │   AI Chat    │               │
│  │   Router     │  │   ORM        │  │   Agent      │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                 │                 │                        │
│  ┌──────▼─────────────────▼─────────────────▼───────┐               │
│  │              Route Handlers (19 modules)          │               │
│  │  jobs, customers, estimates, pricebook, etc.      │               │
│  └──────────────────────┬────────────────────────────┘               │
│                         │                                            │
│  ┌──────────────────────▼────────────────────────────┐               │
│  │              ServiceTitan Client                   │               │
│  │  - Token Manager (auto-refresh)                    │               │
│  │  - Rate Limiting                                   │               │
│  │  - Error Handling                                  │               │
│  └──────────────────────┬────────────────────────────┘               │
│                         │                                            │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   ServiceTitan API    │
              │   api.servicetitan.io │
              └───────────────────────┘
```

### File Structure

```
perfect-catch-st-automation/
├── src/
│   ├── app.js                    # Express app configuration
│   ├── server.js                 # Server entry point
│   ├── config/
│   │   ├── index.js              # Configuration loader
│   │   └── env.schema.js         # Zod validation schema
│   ├── routes/                   # API route handlers (19 modules)
│   │   ├── index.js              # Route aggregator
│   │   ├── jobs.routes.js
│   │   ├── customers.routes.js
│   │   ├── pricebook.routes.js
│   │   ├── db-sync.routes.js     # PostgreSQL job sync
│   │   └── ... (16 more)
│   ├── controllers/              # Business logic
│   ├── services/
│   │   ├── stClient.js           # ServiceTitan API client
│   │   ├── tokenManager.js       # OAuth token management
│   │   ├── database.js           # PostgreSQL connection (pg)
│   │   └── imageDownloader.js
│   ├── lib/
│   │   ├── stEndpoints.js        # 200+ endpoint URL builders
│   │   ├── logger.js             # Pino logger
│   │   └── errors.js             # Custom error classes
│   ├── chat/                     # AI Chat Agent
│   │   ├── pricebook-chat.agent.js
│   │   ├── intent-classifier.js
│   │   ├── entity-extractor.js
│   │   ├── context-manager.js
│   │   └── validation-handler.js
│   ├── sync/pricebook/           # Pricebook Sync Engine
│   │   ├── pricebook-sync.engine.js
│   │   ├── sync-scheduler.js
│   │   ├── conflict-resolver.js
│   │   ├── fetchers/             # ST data fetchers
│   │   ├── comparators/          # Diff detection
│   │   └── appliers/             # Change appliers
│   ├── integrations/n8n/         # n8n webhook handlers
│   ├── middleware/
│   └── db/
│       └── prisma.js             # Prisma client
├── prisma/
│   └── schema.prisma             # Pricebook database schema
├── docs/
│   ├── n8n Internal base/        # n8n workflow files
│   │   ├── get-jobs-optimized-v4.2.json
│   │   ├── job-sync-schema.sql
│   │   └── README.md
│   └── SYSTEM_DOCUMENTATION.md   # This file
├── tests/
├── scripts/
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## API Modules & Endpoints

The server exposes **372+ endpoints** across **19 modules**, all proxying to ServiceTitan's API.

### Core Modules

| Module | Base Path | Endpoints | Description |
|--------|-----------|-----------|-------------|
| **Jobs** | `/jobs` | 4 | Job management (list, get, notes, history) |
| **Customers** | `/customers` | 5 | Customer CRUD + contacts |
| **Estimates** | `/estimates` | 9 | Estimate management + items |
| **Opportunities** | `/opportunities` | 3 | Sales opportunities |
| **Pricebook** | `/pricebook` | 40 | Categories, materials, services, equipment |
| **Accounting** | `/accounting` | 54 | AP bills, invoices, payments, GL accounts |
| **Dispatch** | `/dispatch` | 36 | Appointments, teams, technician shifts |
| **Settings** | `/settings` | 20 | Employees, technicians, business units |
| **Payroll** | `/payroll` | 34 | Timesheets, gross pay, adjustments |
| **Equipment** | `/equipment` | 8 | Installed equipment |
| **Inventory** | `/inventory` | 47 | POs, receipts, vendors, warehouses |
| **Marketing** | `/marketing` | 19 | Campaigns, costs, suppressions |
| **Marketing Ads** | `/marketing-ads` | 7 | Attribution, performance |
| **Forms** | `/forms` | 5 | Form submissions |
| **Reporting** | `/reporting` | 5 | Report categories, dynamic values |
| **Task Management** | `/task-management` | 5 | Tasks |
| **Telecom** | `/telecom` | 10 | Calls, opt-in/out |
| **Timesheets** | `/timesheets` | 12 | Activities, categories |
| **JBCE** | `/jbce` | 1 | Call reasons |

### Special Modules

| Module | Base Path | Description |
|--------|-----------|-------------|
| **Chat** | `/chat` | AI-powered pricebook chat agent |
| **Images** | `/images` | Image proxy for ST images |
| **Scrapers** | `/scrapers` | Vendor price scraping |
| **VAPI** | `/vapi` | Voice AI integration |
| **DB Sync** | `/db` | PostgreSQL job sync (replaces Airtable) |

### DB Sync Endpoints (Job Sync)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/db/sync-state/:key` | GET | Get sync state (e.g., lastJobPull) |
| `/db/sync-state/:key` | PUT | Update sync state |
| `/db/jobs/upsert` | POST | Upsert single job |
| `/db/jobs/upsert-batch` | POST | Batch upsert jobs |
| `/db/jobs/pending-ghl-sync` | GET | Get jobs pending GHL sync |
| `/db/jobs/:id/ghl-sync` | PATCH | Update job GHL sync status |
| `/db/customers/:id/enrich` | GET | Fetch customer data from ST |
| `/db/jobs/enrich-batch` | POST | Batch enrich jobs with customer data |
| `/db/business-units` | GET | List business units |
| `/db/sync-logs` | POST | Log sync events |

---

## Databases

The system uses **two PostgreSQL databases**:

### 1. Pricebook Database (Prisma)

**Connection:** Via Prisma ORM  
**Schema:** `prisma/schema.prisma`

#### Tables (Prisma-managed)

| Table | Description |
|-------|-------------|
| `pricebook_categories` | Pricebook categories with sync metadata |
| `pricebook_materials` | Materials with pricing, vendor, sync status |
| `pricebook_services` | Services with labor rates, included items |
| `pricebook_equipment` | Equipment with warranty, pricing |
| `pricebook_sync_log` | Sync job history |
| `pricebook_sync_conflicts` | Detected conflicts between ST and local |
| `pricebook_changes` | Audit log of all changes |
| `pricebook_webhook_subscriptions` | Webhook configurations |
| `chat_sessions` | AI chat session context |

#### Key Features

- **Bidirectional Sync:** Sync from ST → local and local → ST
- **Conflict Detection:** Tracks when both sides modified same record
- **Audit Trail:** Full history of all changes
- **AI Embeddings:** Vector storage for semantic search (planned)

### 2. Job Sync Database (Raw PostgreSQL)

**Connection:** Via `pg` library  
**Database:** `perfectcatch_automation`  
**Schema:** `docs/n8n Internal base/job-sync-schema.sql`

#### Tables

| Table | Records | Description |
|-------|---------|-------------|
| `sync_state` | 1 | Stores lastJobPull timestamp |
| `jobs` | 4 | Jobs synced from ServiceTitan |
| `customers` | 4 | Customer records |
| `business_units` | 6 | Business unit → GHL pipeline mapping |
| `sync_logs` | - | Sync event logs |

#### Current Business Units

| ST ID | Name | GHL Pipeline |
|-------|------|--------------|
| 1314 | Electrical - Sales | Sales |
| 4622 | Pool - Sales | Sales |
| 1308 | Electrical - Install | Install |
| 4623 | Pool - Install | Install |
| 54670601 | Electrical - Service | Service |
| 26143 | Pool - Service | Service |

#### Jobs Table Schema

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    st_job_id BIGINT UNIQUE NOT NULL,
    st_job_number VARCHAR(50) NOT NULL,
    st_customer_id BIGINT NOT NULL,
    st_location_id BIGINT,
    business_unit_id BIGINT NOT NULL,
    job_type_id BIGINT,
    job_type_name VARCHAR(255),
    job_status VARCHAR(50),
    priority VARCHAR(50),
    summary TEXT,
    description TEXT,
    created_on TIMESTAMPTZ,
    completed_on TIMESTAMPTZ,
    modified_on TIMESTAMPTZ,
    -- GHL sync fields
    ghl_opportunity_id VARCHAR(100),
    ghl_pipeline VARCHAR(100),
    ghl_synced_at TIMESTAMPTZ,
    ghl_sync_status VARCHAR(50) DEFAULT 'pending',
    ghl_sync_error TEXT,
    -- Metadata
    st_raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Pricebook Sync Engine

Located in `src/sync/pricebook/`

### Components

| Component | File | Description |
|-----------|------|-------------|
| **Sync Engine** | `pricebook-sync.engine.js` | Main orchestrator |
| **Scheduler** | `sync-scheduler.js` | Cron-based scheduling |
| **Conflict Resolver** | `conflict-resolver.js` | Handles sync conflicts |
| **Fetchers** | `fetchers/*.js` | Fetch data from ST |
| **Comparators** | `comparators/*.js` | Detect differences |
| **Appliers** | `appliers/*.js` | Apply changes to ST/local |

### Sync Types

1. **Full Sync:** Fetches all records from ST
2. **Incremental Sync:** Only records modified since last sync
3. **Push Sync:** Push local changes to ST

### Sync Flow

```
1. Fetch from ServiceTitan (via fetchers)
2. Compare with local database (via comparators)
3. Detect conflicts (if both modified)
4. Apply changes (via appliers)
5. Log results (to pricebook_sync_log)
6. Notify via webhooks (if configured)
```

---

## AI Chat Agent

Located in `src/chat/`

### Components

| Component | File | Description |
|-----------|------|-------------|
| **Main Agent** | `pricebook-chat.agent.js` | Orchestrates conversation |
| **Intent Classifier** | `intent-classifier.js` | Classifies user intent via GPT-4 |
| **Entity Extractor** | `entity-extractor.js` | Extracts entities from text |
| **Context Manager** | `context-manager.js` | Manages session state |
| **Validation Handler** | `validation-handler.js` | Validates required fields |

### Supported Intents

| Intent | Description | Example |
|--------|-------------|---------|
| `query_category` | List items in category | "Show me pool pumps" |
| `query_item` | Get specific item | "What's the price of PB-PUMP-001?" |
| `create_item` | Create new item | "Add a new chlorinator for $299" |
| `update_item` | Update existing item | "Change price to $350" |
| `set_job` | Start estimate for job | "Start estimate for job 12345" |
| `add_items` | Add items to estimate | "Add PB-PUMP-001 and chlorinator" |
| `show_estimate` | Display current estimate | "Show my estimate" |
| `create_estimate` | Push to ServiceTitan | "Create the estimate" |
| `remove_item` | Remove from estimate | "Remove the transformer" |
| `clear_estimate` | Reset estimate | "Clear estimate" |

### API Endpoint

```
POST /chat/message
{
  "sessionId": "user-123",
  "message": "Show me pool pumps under $500"
}
```

---

## n8n Integration & Job Sync

### Workflow: Get Jobs (v4.2 - Customer Enrichment)

**Location:** `docs/n8n Internal base/get-jobs-optimized-v4.2.json`  
**Schedule:** Every 5 minutes

### Workflow Flow

```
Schedule Trigger (Every 5 min)
    ↓
Get Last Pull Timestamp
    GET /db/sync-state/lastJobPull
    ↓
Get Jobs from ServiceTitan
    GET /jobs?createdOnOrAfter={timestamp}
    ↓
Prepare Batch Upsert
    (Transforms ST response to batch format)
    ↓
Has Jobs? ──NO──→ Log No Jobs
    ↓ YES
Batch Upsert to Database
    POST /db/jobs/upsert-batch
    ↓
Get Pending GHL Sync Jobs
    GET /db/jobs/pending-ghl-sync?limit=500
    ↓
Prepare Jobs for Enrichment
    ↓
Enrich with Customer Data
    POST /db/jobs/enrich-batch
    (Fetches name, email, phone, address from ST)
    ↓
Split Enriched Jobs
    ↓
Switch: Route to GHL Pipeline
    ├── Sales (BU: 1314, 4622) → Push to GHL Sales
    ├── Install (BU: 1308, 4623) → Push to GHL Install
    └── Service (BU: 54670601, 26143) → Push to GHL Service
                ↓
        Mark Synced
            PATCH /db/jobs/{id}/ghl-sync
                ↓
        Update Sync State
            PUT /db/sync-state/lastJobPull
                ↓
        Log Completion
            POST /db/sync-logs
```

### Customer Enrichment

The workflow fetches customer data from ServiceTitan before pushing to GHL:

**Before enrichment:**
```json
{
  "jobId": "62371100",
  "customerId": "53927837",
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": ""
}
```

**After enrichment:**
```json
{
  "jobId": "62371100",
  "customerId": "53927837",
  "firstName": "Tim",
  "lastName": "Damewood",
  "email": "tim.damewood@gmail.com",
  "phone": "4044777935",
  "street": "230 145th Avenue",
  "city": "Madeira Beach",
  "state": "FL",
  "zip": "33708"
}
```

---

## Docker Configuration

### docker-compose.yml

```yaml
services:
  st-automation:
    build: .
    container_name: perfect-catch-st-automation
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
    networks:
      default:
      databasestack_default:
      n8n:
        aliases:
          - st-automation-api  # n8n uses this hostname

networks:
  databasestack_default:
    external: true
  n8n:
    external: true
```

### Network Aliases

| Network | Alias | Purpose |
|---------|-------|---------|
| `n8n` | `st-automation-api` | n8n workflow accesses API via this hostname |
| `databasestack_default` | - | Access to PostgreSQL |

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3001` |
| `ST_CLIENT_ID` | ServiceTitan OAuth client ID | `cid.xxx` |
| `ST_CLIENT_SECRET` | ServiceTitan OAuth secret | `cs1.xxx` |
| `ST_APP_KEY` | ServiceTitan app key | `ak1.xxx` |
| `ST_TENANT_ID` | ServiceTitan tenant ID | `123456` |
| `ST_API_BASE_URL` | ST API base URL | `https://api.servicetitan.io` |
| `DATABASE_URL` | Prisma database URL | `postgresql://...` |
| `DATABASE_MAX_CONNECTIONS` | Max DB connections | `20` |
| `OPENAI_API_KEY` | OpenAI API key for chat | `sk-xxx` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `N8N_WEBHOOK_URL` | n8n webhook base URL | `https://n8n.example.com` |

---

## Scripts & Utilities

| Script | Command | Description |
|--------|---------|-------------|
| Start server | `npm start` | Production start |
| Dev mode | `npm run dev` | Watch mode with auto-reload |
| Run tests | `npm test` | Run Vitest tests |
| Smoke test | `npm run smoke` | Quick API health check |
| DB generate | `npm run db:generate` | Generate Prisma client |
| DB push | `npm run db:push` | Push schema to database |
| DB migrate | `npm run db:migrate` | Run migrations |
| Full sync | `npm run sync:full` | Full pricebook sync |
| Incremental sync | `npm run sync:incremental` | Incremental sync |

### Utility Scripts

| Script | Description |
|--------|-------------|
| `scripts/smoke-test.js` | Quick API health verification |
| `scripts/get-recent-customers.js` | Fetch recent customers |
| `scripts/download-pricebook-images.js` | Download pricebook images |
| `scripts/populate-pricebook-db.js` | Populate local pricebook DB |
| `scripts/parse-openapi.js` | Parse ST OpenAPI specs |

---

## Health Check

```bash
# Check API health
curl http://localhost:3001/health

# Response
{
  "status": "ok",
  "timestamp": "2025-12-15T04:00:00.000Z",
  "version": "2.0.0",
  "uptime": 3600
}
```

---

## Quick Reference

### Test Customer Enrichment

```bash
curl http://localhost:3001/db/customers/53927837/enrich
```

### Test Batch Enrichment

```bash
curl -X POST http://localhost:3001/db/jobs/enrich-batch \
  -H "Content-Type: application/json" \
  -d '{"jobs": [{"jobId": "123", "customerId": "53927837"}]}'
```

### Get Pending Jobs for GHL

```bash
curl http://localhost:3001/db/jobs/pending-ghl-sync?limit=10
```

### Get Business Units

```bash
curl http://localhost:3001/db/business-units
```

---

## Summary

**Perfect Catch ST Automation** is a comprehensive automation platform that:

1. **Proxies 372+ ServiceTitan API endpoints** across 19 modules
2. **Syncs pricebook data** bidirectionally with conflict detection
3. **Provides AI chat interface** for natural language pricebook management
4. **Syncs jobs to GoHighLevel** with customer enrichment
5. **Integrates with n8n** for workflow automation
6. **Supports voice AI** via VAPI integration

The system runs in Docker, connects to PostgreSQL for data persistence, and uses Redis for caching. It's designed for production deployment with proper logging, error handling, and monitoring capabilities.
