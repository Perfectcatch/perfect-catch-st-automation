# Perfect Catch ST Automation - Master Architecture Document

> **Version:** 2.0.0
> **Last Updated:** 2025-12-20
> **Purpose:** Complete system reference for AI agents and developers

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [ServiceTitan API Integration](#2-servicetitan-api-integration)
3. [Exposed API Endpoints](#3-exposed-api-endpoints)
4. [Database Architecture](#4-database-architecture)
5. [Sync Engine](#5-sync-engine)
6. [External Integrations](#6-external-integrations)
7. [MCP Tools (AI Interface)](#7-mcp-tools-ai-interface)
8. [Worker Processes](#8-worker-processes)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Configuration Reference](#10-configuration-reference)

---

## 1. System Overview

### Purpose
Perfect Catch ST Automation is a middleware platform that:
- **Proxies** ServiceTitan API calls with authentication management
- **Syncs** ServiceTitan data to local PostgreSQL for fast queries
- **Integrates** with external systems (GHL, Salesforce, Slack)
- **Exposes** 100+ AI tools via MCP protocol for Claude integration
- **Automates** workflows between systems

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ (ESM) |
| Framework | Express.js 4.21 |
| Database | PostgreSQL 15 + Prisma ORM |
| Cache | Redis (ioredis) |
| Queue | Bull (Redis-backed) |
| Logging | Pino |
| AI SDK | Anthropic SDK, OpenAI SDK |
| Deployment | Docker + docker-compose |

### Container Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                      │
├─────────────────────────────────────────────────────────────┤
│  perfect-catch-st-automation (main API server, port 3001)   │
│  st-sync-worker (scheduled sync jobs)                        │
│  st-workflow-worker (workflow execution)                     │
│  st-monitoring-agent (self-healing)                          │
│  perfect-catch-redis (caching/queues)                        │
│  postgres (external, port 6432)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ServiceTitan API Integration

### Authentication
- **OAuth 2.0 Client Credentials** flow
- Token managed by `src/services/tokenManager.js`
- Auto-refresh before expiry
- Base URL: `https://api.servicetitan.io`

### API Modules (15 modules, 200+ endpoints)

#### Core Modules

| Module | Base Path | Purpose |
|--------|-----------|---------|
| **JPM** | `/jpm/v2` | Jobs, Appointments, Projects |
| **CRM** | `/crm/v2` | Customers, Contacts, Locations |
| **Sales** | `/sales/v2` | Estimates, Quote Items |
| **SalesTech** | `/salestech/v2` | Opportunities, Follow-ups |

#### Extended Modules

| Module | Base Path | Endpoint Count | Purpose |
|--------|-----------|----------------|---------|
| **Accounting** | `/accounting/v2` | 54 | AP/AR, Invoices, GL, Payments |
| **Dispatch** | `/dispatch/v2` | 36 | Technicians, Zones, Capacity |
| **Pricebook** | `/pricebook/v2` | 40 | Services, Materials, Equipment |
| **Settings** | `/settings/v2` | 20 | Employees, Business Units |
| **Payroll** | `/payroll/v2` | 34 | Timesheets, Labor |
| **Inventory** | `/inventory/v2` | 47 | POs, Warehouses, Trucks |
| **Marketing** | `/marketing/v2` | 19 | Campaigns, Attribution |
| **Telecom** | `/telecom/v3` | 10 | Calls, Opt-in/out |
| **Forms** | `/forms/v2` | 5 | Form Submissions |
| **Reporting** | `/reporting/v2` | 5 | Dynamic Reports |
| **Timesheets** | `/timesheets/v2` | 12 | Activity Tracking |

### Endpoint Configuration

**File:** `src/lib/stEndpoints.js`

```javascript
// Example endpoint structure
stEndpoints.jobs.list()      // GET /jpm/v2/tenant/{id}/jobs
stEndpoints.jobs.get(id)     // GET /jpm/v2/tenant/{id}/jobs/{id}
stEndpoints.customers.create() // POST /crm/v2/tenant/{id}/customers
stEndpoints.estimates.sell(id) // POST /sales/v2/tenant/{id}/estimates/{id}/sell
```

### Key ST Endpoints Used

#### Jobs & Appointments
```
GET  /jpm/v2/tenant/{id}/jobs
GET  /jpm/v2/tenant/{id}/jobs/{jobId}
GET  /jpm/v2/tenant/{id}/jobs/{jobId}/notes
GET  /jpm/v2/tenant/{id}/jobs/{jobId}/history
GET  /jpm/v2/tenant/{id}/appointments
POST /jpm/v2/tenant/{id}/appointments
```

#### Customers
```
GET  /crm/v2/tenant/{id}/customers
GET  /crm/v2/tenant/{id}/customers/{customerId}
POST /crm/v2/tenant/{id}/customers
PUT  /crm/v2/tenant/{id}/customers/{customerId}
GET  /crm/v2/tenant/{id}/customers/{customerId}/contacts
GET  /crm/v2/tenant/{id}/export/customers/contacts  (bulk export)
```

#### Estimates
```
GET  /sales/v2/tenant/{id}/estimates
GET  /sales/v2/tenant/{id}/estimates/{estimateId}
POST /sales/v2/tenant/{id}/estimates/{estimateId}/sell
POST /sales/v2/tenant/{id}/estimates/{estimateId}/unsell
```

#### Dispatch
```
GET  /dispatch/v2/tenant/{id}/technicians
GET  /dispatch/v2/tenant/{id}/capacity
GET  /dispatch/v2/tenant/{id}/zones
GET  /dispatch/v2/tenant/{id}/teams
GET  /dispatch/v2/tenant/{id}/arrival-windows
```

#### Pricebook
```
GET  /pricebook/v2/tenant/{id}/categories
GET  /pricebook/v2/tenant/{id}/services
GET  /pricebook/v2/tenant/{id}/materials
GET  /pricebook/v2/tenant/{id}/equipment
```

---

## 3. Exposed API Endpoints

### Route Structure

**Base URL:** `http://localhost:3001`

### Health & Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Component-level health |
| `/health/workers` | GET | Worker process status |
| `/health/ghl` | GET | GHL sync status |
| `/api/monitor/events` | GET | SSE real-time sync events |

### ServiceTitan Proxy Routes

These routes proxy directly to ServiceTitan API with authentication:

| Route | ST Module | Purpose |
|-------|-----------|---------|
| `/jobs` | JPM | Job CRUD, notes, history |
| `/customers` | CRM | Customer CRUD, contacts |
| `/estimates` | Sales | Estimate management |
| `/opportunities` | SalesTech | Sales pipeline |
| `/accounting` | Accounting | Financial data |
| `/dispatch` | Dispatch | Technicians, zones |
| `/pricebook` | Pricebook | Pricing catalog |
| `/settings` | Settings | Configuration |
| `/equipment` | EquipmentSystems | Installed equipment |
| `/inventory` | Inventory | Stock management |
| `/payroll` | Payroll | Labor/timesheets |
| `/marketing` | Marketing | Campaigns |
| `/forms` | Forms | Form submissions |
| `/telecom` | Telecom | Call records |
| `/timesheets` | Timesheets | Activity logs |

### Database Sync Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/db/sync-state` | GET | All sync state records |
| `/db/sync-state/:key` | GET/PUT | Specific sync state |
| `/db/jobs/upsert` | POST | Upsert job with customer |
| `/db/jobs/upsert-batch` | POST | Batch upsert jobs |
| `/db/jobs/pending-ghl-sync` | GET | Jobs needing GHL sync |
| `/db/jobs/:stJobId` | GET | Get job by ST ID |
| `/db/jobs/:stJobId/ghl-sync` | PATCH | Update GHL sync status |
| `/db/customers/:id` | GET | Get customer by ST ID |
| `/db/customers/:id/enrich` | GET | Fetch and enrich from ST |
| `/db/contacts/sync` | POST | Trigger contacts sync |
| `/db/contacts/stats` | GET | Contact sync statistics |
| `/db/sync-logs` | GET/POST | Sync operation logs |
| `/db/sync-logs/statistics` | GET | Sync statistics |
| `/db/business-units` | GET | Business units |

### Integration Routes

#### GHL (GoHighLevel)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ghl/pipelines` | GET | List GHL pipelines |
| `/ghl/sync/status` | GET | Sync status & stats |
| `/ghl/sync/trigger` | POST | Trigger manual sync |
| `/ghl/opportunities` | GET | List opportunities |
| `/ghl/contacts` | GET | List contacts |
| `/ghl/install-pipeline/move` | POST | Move to install pipeline |

#### Salesforce

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/salesforce/oauth/authorize` | GET | Start OAuth flow |
| `/api/salesforce/oauth/callback` | GET | OAuth callback |
| `/api/salesforce/status` | GET | Connection status |
| `/api/salesforce/sync/customers` | POST | Sync customers |
| `/api/salesforce/query` | POST | SOQL query |

#### Slack

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/slack/events` | POST | Slack event webhook |
| `/slack/commands` | POST | Slash command handler |
| `/slack/interactive` | POST | Button/modal handler |

### Scheduling Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scheduling/technicians` | GET | Technician list (cached) |
| `/scheduling/technicians/by-skills` | GET | Find by skills |
| `/scheduling/teams` | GET | Team list |
| `/scheduling/zones` | GET | Zone list |
| `/scheduling/job-types` | GET | Job type list |
| `/scheduling/rules` | GET | Scheduling rules |
| `/scheduling/stats` | GET | Entity statistics |
| `/api/sync/scheduling/full` | POST | Trigger full sync |

### Pricebook Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pricebook/categories` | GET | Category list |
| `/pricebook/services` | GET | Service catalog |
| `/pricebook/materials` | GET | Materials catalog |
| `/pricebook/equipment` | GET | Equipment catalog |
| `/pricebook/sync` | POST | Trigger sync |
| `/chat` | POST | AI pricebook chat |

---

## 4. Database Architecture

### Schemas

| Schema | Purpose |
|--------|---------|
| `public` | Prisma-managed tables (pricebook, chat) |
| `servicetitan` | Synced ST data |
| `integrations` | GHL, CallRail data |
| `pricebook` | Pricebook sync tables |
| `salesforce` | Salesforce sync log |
| `automation` | Workflows, messaging |

### Key Tables

#### ServiceTitan Schema (`servicetitan.*`)

```sql
-- Core entities
st_customers         -- Customer master data
st_locations         -- Service locations
st_jobs              -- Job records
st_appointments      -- Appointment scheduling
st_estimates         -- Estimates/quotes
st_invoices          -- Invoices
st_payments          -- Payment records

-- Reference data
st_technicians       -- Technician profiles
st_employees         -- All employees
st_business_units    -- Business unit config
st_job_types         -- Job type catalog
st_campaigns         -- Marketing campaigns
st_tag_types         -- Tag definitions
st_call_reasons      -- Call reason codes
st_custom_fields     -- Custom field definitions
st_installed_equipment -- Customer equipment

-- Tracking
st_sync_log          -- Sync operation history
sync_state           -- Sync cursor positions
job_technicians      -- Job-technician assignments
```

#### Customer Table Structure

```sql
servicetitan.st_customers (
  id UUID PRIMARY KEY,
  st_id BIGINT UNIQUE,           -- ServiceTitan ID
  tenant_id BIGINT,
  name VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(100),
  customer_type VARCHAR(50),
  active BOOLEAN,
  balance DECIMAL(18,4),
  -- GHL sync tracking
  ghl_contact_id VARCHAR(255),
  ghl_sync_status VARCHAR(50),
  ghl_synced_at TIMESTAMPTZ,
  -- ST timestamps
  st_created_on TIMESTAMPTZ,
  st_modified_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ,
  -- Full JSON
  full_data JSONB
)
```

#### Job Table Structure

```sql
servicetitan.st_jobs (
  id UUID PRIMARY KEY,
  st_id BIGINT UNIQUE,
  tenant_id BIGINT,
  job_number VARCHAR(50),
  customer_id BIGINT,
  location_id BIGINT,
  job_type_id BIGINT,
  business_unit_id BIGINT,
  campaign_id BIGINT,
  job_status VARCHAR(50),
  summary TEXT,
  total DECIMAL(18,4),
  -- Technician assignment
  lead_technician_id BIGINT,
  sold_by_id BIGINT,
  -- GHL sync
  ghl_opportunity_id VARCHAR(255),
  ghl_sync_status VARCHAR(50),
  -- Timestamps
  st_created_on TIMESTAMPTZ,
  st_completed_on TIMESTAMPTZ,
  local_synced_at TIMESTAMPTZ,
  full_data JSONB
)
```

#### Integrations Schema (`integrations.*`)

```sql
ghl_contacts (
  id UUID PRIMARY KEY,
  ghl_id VARCHAR(255) UNIQUE,
  ghl_location_id VARCHAR(255),
  st_customer_id BIGINT,         -- Link to ST customer
  first_name, last_name, email, phone,
  source VARCHAR(100),
  synced_to_st BOOLEAN,
  full_data JSONB
)

ghl_opportunities (
  id UUID PRIMARY KEY,
  ghl_id VARCHAR(255) UNIQUE,
  ghl_contact_id VARCHAR(255),
  ghl_pipeline_id VARCHAR(255),
  ghl_pipeline_stage_id VARCHAR(255),
  pipeline_name VARCHAR(255),
  stage_name VARCHAR(255),
  st_customer_id BIGINT,
  st_job_id BIGINT,
  st_estimate_id BIGINT,
  name VARCHAR(500),
  monetary_value DECIMAL(18,4),
  status VARCHAR(50),
  custom_fields JSONB,
  full_data JSONB
)

ghl_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(50),         -- 'full', 'incremental'
  direction VARCHAR(20),         -- 'st_to_ghl', 'ghl_to_st'
  status VARCHAR(50),
  records_created INTEGER,
  records_updated INTEGER,
  records_failed INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
)
```

### Views

```sql
-- Business units from servicetitan schema
CREATE VIEW public.business_units AS
SELECT id, st_id as st_business_unit_id, name,
       ghl_pipeline_id IS NOT NULL as sync_enabled,
       ghl_pipeline_id, active, full_data
FROM servicetitan.st_business_units;

-- Sync statistics
CREATE VIEW public.sync_statistics AS
SELECT sync_type, COUNT(*) as total_syncs,
       COUNT(*) FILTER (WHERE status = 'completed') as successful_syncs,
       COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
       MAX(started_at) as last_sync_at,
       AVG(duration_ms) as avg_duration_ms
FROM servicetitan.st_sync_log
GROUP BY sync_type;
```

---

## 5. Sync Engine

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Sync Scheduler                         │
│                  (node-cron based)                        │
├──────────────────────────────────────────────────────────┤
│  Incremental: */5 * * * * (every 5 minutes)              │
│  Full Sync:   0 2 * * *   (daily at 2 AM)                │
│  Contacts:    0 */4 * * * (every 4 hours)                │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│                  Sync Orchestrator                        │
│            (dependency-aware execution)                   │
├──────────────────────────────────────────────────────────┤
│  Phase 1: Reference Data (business units, job types)     │
│  Phase 2: Customers                                       │
│  Phase 3: Jobs, Estimates, Appointments, Invoices        │
└────────────────────┬─────────────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Customers  │ │    Jobs     │ │  Estimates  │
│   Syncer    │ │   Syncer    │ │   Syncer    │
└─────────────┘ └─────────────┘ └─────────────┘
```

### Sync Modules

**Location:** `src/services/sync/`

| Module | File | Purpose |
|--------|------|---------|
| Orchestrator | `sync-orchestrator.js` | Coordinates all syncs |
| Scheduler | `sync-scheduler.js` | Cron scheduling |
| Base | `sync-base.js` | DB pool, pagination |
| Customers | `sync-customers-enhanced.js` | Customer sync |
| Jobs | `sync-jobs-enhanced.js` | Job sync |
| Estimates | `sync-estimates-enhanced.js` | Estimate sync |
| Appointments | `sync-appointments-enhanced.js` | Appointment sync |
| Invoices | `sync-invoices-enhanced.js` | Invoice sync |
| Technicians | `sync-technicians-enhanced.js` | Technician sync |
| Reference | `sync-reference-data-enhanced.js` | Business units, job types |
| Contacts | `sync-customer-contacts.js` | Customer contacts |

### Sync State Management

```sql
-- Sync cursor tracking
INSERT INTO sync_state (key, value)
VALUES ('customers_last_modified', '2025-12-20T00:00:00Z');

-- Query only changed records
SELECT * FROM st.customers
WHERE modifiedOn > :last_sync_time;
```

### Sync Logs

```sql
INSERT INTO st_sync_log (
  sync_type, entity_type, status,
  records_processed, records_succeeded, records_failed,
  started_at, completed_at, duration_ms
) VALUES (
  'incremental', 'customers', 'completed',
  150, 148, 2,
  NOW() - INTERVAL '5 minutes', NOW(), 45000
);
```

---

## 6. External Integrations

### GoHighLevel (GHL)

**Location:** `src/integrations/ghl/`

#### Pipeline Mapping

| GHL Pipeline | Purpose | ST Mapping |
|--------------|---------|------------|
| SALES_PIPELINE | Lead → Sale | Estimates, Customers |
| INSTALL_PIPELINE | Sold → Complete | Jobs |
| LEAD_NURTURE | Long-term leads | Contacts |
| REVIEWS_REFERRALS | Post-service | Completed Jobs |

#### Stage Mappings (Sales Pipeline)

| Stage | GHL Stage ID | ST Trigger |
|-------|--------------|------------|
| New Lead | 3dc14ef1-... | New customer created |
| Contacted | 56ab4d16-... | Customer synced to GHL |
| Appointment Scheduled | e439d832-... | Appointment created |
| Proposal Sent | a75d3c82-... | Estimate created |
| Estimate Follow-up | de5601ac-... | Pending estimate |
| Job Sold | 97703c8d-... | Estimate sold |
| Estimate Lost | a7ca7df5-... | Estimate dismissed |

#### GHL Sync Worker

**File:** `src/sync/ghl/ghl-sync.worker.js`

```
Runs every 5 minutes:
1. Sync new ST customers → GHL contacts (Contacted stage)
2. Jobs with appointments → Appointment Scheduled stage
3. Estimates → Proposal Sent stage (update value)
4. Technician assignments → Update techs custom field
```

### Salesforce

**Location:** `src/integrations/salesforce/`

#### Authentication
- OAuth 2.0 (Password Flow or Authorization Code)
- Tokens stored in Redis (30-day expiry)
- Refresh before expiry

#### Object Mapping

| ST Entity | SF Object | External ID |
|-----------|-----------|-------------|
| Customer | Account | ServiceTitan_Customer_ID__c |
| Customer | Contact | ServiceTitan_Account_ID__c |

#### Customer Fields Synced

```javascript
{
  Name: customer.name,
  Phone: customer.phone,
  BillingStreet: customer.address_line1,
  BillingCity: customer.city,
  BillingState: customer.state,
  BillingPostalCode: customer.zip,
  ServiceTitan_Customer_ID__c: customer.st_id,
  Customer_Segment__c: calculateSegment(customer),
  Lifetime_Value__c: customer.balance,
  Last_Service_Date__c: customer.last_service
}
```

### Slack

**Location:** `src/integrations/slack/`

#### Slash Commands

| Command | Handler | Description |
|---------|---------|-------------|
| `/job [id]` | Get job details | Shows job info, status |
| `/customer [name]` | Search customer | Find by name/phone |
| `/schedule` | View availability | Technician schedules |
| `/estimate [id]` | Get estimate | Shows estimate details |

#### Event Types

| Event | Handler | Action |
|-------|---------|--------|
| `message` | Conversational bot | AI-powered responses |
| `app_mention` | Bot mention | Direct interaction |
| `reaction_added` | Emoji reactions | Workflow triggers |

---

## 7. MCP Tools (AI Interface)

### Overview

**Location:** `mcp-server/`

The MCP (Model Context Protocol) server exposes 100+ tools for Claude integration.

### Tool Categories

```
mcp-server/tools/
├── ai/               # AI/NLP tools (entity extraction, classification)
├── analytics/        # Business metrics, performance analysis
├── customers/        # Customer CRUD, search, history
├── equipment/        # Equipment management
├── estimates/        # Estimate creation, modification
├── integrations/     # GHL, Salesforce, Slack tools
├── invoicing/        # Invoice generation, payments
├── jobs/             # Job management
├── messaging/        # SMS, Email dispatch
├── pricebook/        # Pricing catalog tools
├── scheduling/       # Appointment scheduling
├── technicians/      # Technician management
└── workflows/        # Workflow automation
```

### Key Tools

#### Scheduling Tools

```javascript
// Get smart availability (AI-powered)
getSmartAvailability({
  jobTypeId: 123,
  duration: 120,
  preferredDate: '2025-12-25',
  zoneId: 456
})

// Schedule appointment
scheduleAppointment({
  jobId: 789,
  technicianId: 101,
  start: '2025-12-25T09:00:00',
  duration: 120
})
```

#### Estimate Tools

```javascript
// Generate estimate from description
generateEstimateFromDescription({
  customerId: 123,
  description: "Replace pool pump and install new filter",
  jobTypeId: 45
})

// Search pricebook
searchPricebook({
  query: "pool pump",
  category: "equipment"
})
```

#### Customer Tools

```javascript
// Create customer
createCustomer({
  name: "John Doe",
  email: "john@example.com",
  phone: "555-1234",
  address: { street: "123 Main St", city: "Tampa", state: "FL" }
})

// Get customer history
getCustomerHistory({
  customerId: 123,
  includeJobs: true,
  includeEstimates: true
})
```

#### Database Tool

```javascript
// Direct SQL queries
queryDatabase({
  query: "SELECT * FROM servicetitan.st_jobs WHERE job_status = 'Scheduled' LIMIT 10"
})
```

### MCP Configuration

```json
// Claude Desktop config
{
  "mcpServers": {
    "perfect-catch": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "SERVICETITAN_API_KEY": "..."
      }
    }
  }
}
```

---

## 8. Worker Processes

### Container Workers

| Worker | Command | Purpose |
|--------|---------|---------|
| `st-sync-worker` | `npm run worker:sync` | Scheduled sync jobs |
| `st-workflow-worker` | `npm run worker:workflows` | Workflow execution |
| `st-monitoring-agent` | `npm run worker:monitor` | Self-healing agent |

### Sync Scheduler

**File:** `src/services/sync/sync-scheduler.js`

```javascript
// Cron schedules (configurable via env)
Incremental: process.env.SYNC_INCREMENTAL_CRON || '*/5 * * * *'
Full Sync:   process.env.SYNC_FULL_CRON || '0 2 * * *'
Contacts Incremental: process.env.CONTACTS_INCREMENTAL_CRON || '0 */4 * * *'
Contacts Full: process.env.CONTACTS_FULL_CRON || '0 3 * * *'
```

### Health Monitoring

```javascript
// Heartbeat file updated every 30 seconds
const HEARTBEAT_FILE = '/tmp/worker-heartbeat';
setInterval(() => {
  fs.writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
}, 30000);
```

### GHL Sync Worker

**File:** `src/sync/ghl/ghl-sync.worker.js`

```javascript
// Runs every 5 minutes
const cronSchedule = process.env.GHL_SYNC_CRON || '*/5 * * * *';

// Sync steps:
// 1. New customers → GHL contacts
// 2. Appointments → Stage update
// 3. Estimates → Proposal sent
// 4. Technicians → Custom field
```

---

## 9. Data Flow Diagrams

### ServiceTitan → PostgreSQL Sync

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ServiceTitan   │────▶│   Sync Engine   │────▶│   PostgreSQL    │
│      API        │     │  (Node.js)      │     │   Database      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ OAuth Token           │ Paginated Fetch       │ Upsert
        │ GET /jobs             │ Rate Limiting         │ Conflict Resolution
        │ GET /customers        │ Error Retry           │ Change Detection
```

### Bi-Directional GHL Sync

```
┌─────────────────┐                         ┌─────────────────┐
│  ServiceTitan   │                         │   GoHighLevel   │
└────────┬────────┘                         └────────┬────────┘
         │                                           │
         ▼                                           ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ servicetitan.*  │◀───▶│   Sync Engine   │◀───▶│ integrations.*  │
│    tables       │     │   (GHL Worker)  │     │  ghl_* tables   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### API Request Flow

```
┌─────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Client  │────▶│  Express App    │────▶│   ST Client     │────▶│  ServiceTitan   │
│         │◀────│  (Routes)       │◀────│  (Auth + Retry) │◀────│      API        │
└─────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                        │
                        ▼ (for DB routes)
                ┌─────────────────┐
                │   PostgreSQL    │
                │   (Direct)      │
                └─────────────────┘
```

---

## 10. Configuration Reference

### Environment Variables

#### ServiceTitan

```bash
SERVICE_TITAN_CLIENT_ID=       # OAuth client ID
SERVICE_TITAN_CLIENT_SECRET=   # OAuth client secret
SERVICE_TITAN_TENANT_ID=       # Tenant/company ID
SERVICE_TITAN_APP_KEY=         # Application key
```

#### Database

```bash
DATABASE_URL=postgresql://user:pass@host:port/db
SERVICETITAN_DATABASE_URL=postgresql://...  # Legacy alias
DATABASE_MAX_CONNECTIONS=20
```

#### GHL Integration

```bash
GHL_API_KEY=                   # GHL API key
GHL_LOCATION_ID=               # GHL location ID
GHL_SYNC_ENABLED=true          # Enable/disable sync
GHL_AUTO_SYNC_ESTIMATES=true   # Auto-sync estimates
GHL_AUTO_SYNC_JOBS=true        # Auto-sync jobs
GHL_AUTO_SYNC_CUSTOMERS=true   # Auto-sync customers
GHL_SYNC_CRON='*/5 * * * *'    # Sync schedule
```

#### Salesforce

```bash
SALESFORCE_CLIENT_ID=          # OAuth client ID
SALESFORCE_CLIENT_SECRET=      # OAuth client secret
SALESFORCE_USERNAME=           # SF username
SALESFORCE_PASSWORD=           # SF password
SALESFORCE_SECURITY_TOKEN=     # SF security token
SALESFORCE_LOGIN_URL=          # login.salesforce.com or test
```

#### Slack

```bash
SLACK_BOT_TOKEN=               # Bot user OAuth token
SLACK_SIGNING_SECRET=          # Request signing secret
SLACK_APP_TOKEN=               # App-level token
```

#### Sync Schedules

```bash
SYNC_INCREMENTAL_CRON='*/5 * * * *'      # Every 5 minutes
SYNC_FULL_CRON='0 2 * * *'               # Daily at 2 AM
CONTACTS_INCREMENTAL_CRON='0 */4 * * *'  # Every 4 hours
CONTACTS_FULL_CRON='0 3 * * *'           # Daily at 3 AM
```

### NPM Scripts

```bash
# Server
npm start                # Start production server
npm run dev              # Development with watch

# Sync operations
npm run sync:full        # Full sync (Pricebook)
npm run sync:st-full     # Full ST data sync
npm run sync:st-incremental # Incremental ST sync
npm run sync:customers   # Customers only
npm run sync:jobs        # Jobs only
npm run sync:estimates   # Estimates only

# GHL operations
npm run ghl:sync:all     # Full GHL sync
npm run ghl:sync:opportunities
npm run ghl:sync:contacts
npm run ghl:push:estimates

# Workers
npm run worker:sync      # Start sync scheduler
npm run worker:workflows # Start workflow worker
npm run worker:monitor   # Start monitoring agent

# Database
npm run db:migrate       # Run Prisma migrations
npm run db:studio        # Open Prisma Studio
```

---

## Quick Reference

### File Locations

| Component | Path |
|-----------|------|
| Main entry | `src/server.js` |
| App config | `src/app.js` |
| ST endpoints | `src/lib/stEndpoints.js` |
| ST client | `src/services/stClient.js` |
| Token manager | `src/services/tokenManager.js` |
| Routes | `src/routes/*.js` |
| Sync services | `src/services/sync/*.js` |
| GHL integration | `src/integrations/ghl/` |
| Salesforce | `src/integrations/salesforce/` |
| Slack | `src/integrations/slack/` |
| MCP server | `mcp-server/` |
| Migrations | `src/db/migrations/` |
| Prisma schema | `prisma/schema.prisma` |

### Statistics

| Metric | Count |
|--------|-------|
| API Modules | 15 |
| ST Endpoints | 200+ |
| Route Files | 31 |
| Exposed Routes | 372+ |
| Sync Modules | 14 |
| MCP Tools | 100+ |
| Database Tables | 66 |
| Integrations | 4 major |

---

*Document generated: 2025-12-20*
