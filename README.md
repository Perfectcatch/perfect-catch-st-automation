# Perfect Catch ST Automation Server

Production-grade ServiceTitan API proxy server for Perfect Catch Electric & Pools. This server acts as the authentication and proxy layer for n8n workflows, Windsurf agents, and other services.

**Version:** 2.0.0  
**Total Endpoints:** 372+  
**Total Modules:** 19  
**Last Updated:** December 7, 2025

## Features

### Core API Features
- **OAuth Token Management**: Automatic token acquisition, caching, and refresh
- **Full HTTP Verb Support**: GET, POST, PUT, DELETE, PATCH
- **Retry Logic**: Automatic retry for 429 (rate limit) and 5xx errors
- **Error Normalization**: Consistent error response format
- **Request Logging**: Structured logging with Pino
- **Rate Limiting**: Configurable request rate limiting
- **API Key Protection**: Optional authentication for internal endpoints
- **Health Checks**: `/ping`, `/health`, and `/status` endpoints
- **Comprehensive ServiceTitan Coverage**: 19 modules with 372+ endpoints

### 🆕 Pricebook Sync Engine
- **Bi-directional Sync**: Sync pricebook data between ServiceTitan and local PostgreSQL
- **Local Database**: 6,000+ items (categories, materials, services, equipment)
- **Automated Scheduling**: Daily full sync + 6-hour incremental syncs
- **Conflict Detection**: Track and resolve sync conflicts

### 🆕 AI-Powered Chat Agent
- **Natural Language Queries**: Search pricebook with plain English
- **OpenAI GPT-4 Integration**: Intelligent intent classification
- **Job-Based Estimates**: Build estimates conversationally
- **Session Context**: Maintains conversation state

### 🆕 n8n Webhook Integration
- **Event Subscriptions**: Subscribe to pricebook events
- **Webhook Delivery**: Automatic event notifications
- **12 Event Types**: material_created, sync_completed, etc.

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- ServiceTitan API credentials

### Installation

```bash
# Clone the repository
cd perfect-catch-st-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your ServiceTitan credentials
```

### Running Locally

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start

# Run legacy server (original api-server.js)
npm run legacy
```

### Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run smoke tests (requires running server)
npm run smoke
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_TITAN_TENANT_ID` | Yes | - | ServiceTitan tenant ID |
| `SERVICE_TITAN_CLIENT_ID` | Yes | - | OAuth client ID |
| `SERVICE_TITAN_CLIENT_SECRET` | Yes | - | OAuth client secret |
| `SERVICE_TITAN_APP_KEY` | Yes | - | ST application key |
| `PORT` | No | 3001 | Server port |
| `NODE_ENV` | No | development | Environment (development/production/test) |
| `API_KEY` | No | - | Optional API key for authentication |
| `RATE_LIMIT_MAX_REQUESTS` | No | 100 | Max requests per window (0 to disable) |
| `MAX_RETRIES` | No | 3 | Retry attempts for failed requests |
| `DATABASE_URL` | No | - | PostgreSQL connection string (for pricebook sync) |
| `OPENAI_API_KEY` | No | - | OpenAI API key (for chat agent) |
| `SYNC_SCHEDULER_ENABLED` | No | true | Enable automatic sync scheduling |
| `SYNC_FULL_CRON` | No | 0 2 * * * | Full sync cron schedule |
| `SYNC_INCREMENTAL_CRON` | No | 0 */6 * * * | Incremental sync cron schedule |

## Project Structure

```
perfect-catch-st-automation/
├── src/
│   ├── app.js                    # Express app setup
│   ├── server.js                 # Entry point
│   ├── config/
│   │   ├── index.js              # Config loader
│   │   └── env.schema.js         # Zod validation
│   ├── routes/
│   │   ├── index.js              # Route aggregator
│   │   ├── health.routes.js      # Health endpoints
│   │   ├── pricebook-chat.routes.js  # Chat agent routes
│   │   └── ...                   # Other route files
│   ├── controllers/              # Business logic
│   ├── services/
│   │   ├── stClient.js           # ServiceTitan API client
│   │   └── tokenManager.js       # OAuth token management
│   ├── middleware/               # Express middleware
│   ├── lib/                      # Utilities
│   ├── sync/
│   │   └── pricebook/
│   │       ├── pricebook-sync.engine.js  # Sync engine
│   │       ├── sync-scheduler.js         # Cron scheduler
│   │       └── sync.controller.js        # Sync API
│   ├── chat/
│   │   ├── pricebook-chat.agent.js       # Chat agent
│   │   ├── intent-classifier.js          # Intent classification
│   │   ├── entity-extractor.js           # Entity extraction
│   │   └── context-manager.js            # Session management
│   ├── integrations/
│   │   └── n8n/
│   │       ├── webhook-handler.js        # Webhook processing
│   │       └── n8n.controller.js         # n8n API
│   └── db/
│       ├── prisma.js                     # Prisma client
│       └── migrations/                   # SQL migrations
├── prisma/
│   └── schema.prisma             # Database schema
├── scripts/
│   └── populate-pricebook-db.js  # Database population
├── openwebui/
│   └── pricebook_tool.py         # Open WebUI integration
├── tests/                        # Test files
├── docs/                         # Documentation
└── docker-compose.pricebook.yml  # Full stack deployment
```

## API Endpoints

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ping` | Simple health check |
| GET | `/health` | Detailed health with components |
| GET | `/status` | Full status with metrics |

---

### Core Modules (Original)

#### Jobs (`/jobs`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job by ID |
| GET | `/jobs/:id/notes` | Get job notes |
| GET | `/jobs/:id/history` | Get job history |

#### Customers (`/customers`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/customers` | List all customers |
| GET | `/customers/:id` | Get customer by ID |
| POST | `/customers` | Create customer |
| PUT | `/customers/:id` | Update customer |
| GET | `/customers/contacts` | List all contacts |
| GET | `/customers/:id/contacts` | Get customer contacts |

#### Estimates (`/estimates`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/estimates` | List all estimates |
| GET | `/estimates/:id` | Get estimate by ID |
| POST | `/estimates` | Create estimate |
| PUT | `/estimates/:id` | Update estimate |
| PUT | `/estimates/:id/sell` | Mark as sold |
| PUT | `/estimates/:id/unsell` | Unmark as sold |
| PUT | `/estimates/:id/dismiss` | Dismiss estimate |
| GET | `/estimates/:id/items` | List estimate items |
| PUT | `/estimates/:id/items` | Update items |
| DELETE | `/estimates/:id/items/:itemId` | Delete item |

#### Opportunities (`/opportunities`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/opportunities` | List opportunities |
| GET | `/opportunities/:id` | Get opportunity by ID |
| GET | `/opportunities/:id/followups` | Get follow-ups |

---

### Accounting Module (`/accounting`) - 54 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/accounting/ap-bills` | List AP bills |
| GET | `/accounting/ap-bills/:id` | Get AP bill by ID |
| POST | `/accounting/ap-bills` | Create AP bill |
| PATCH | `/accounting/ap-bills/:id` | Update AP bill |
| DELETE | `/accounting/ap-bills/:id` | Delete AP bill |
| GET | `/accounting/ap-credits` | List AP credits |
| GET | `/accounting/ap-payments` | List AP payments |
| GET | `/accounting/invoices` | List invoices |
| GET | `/accounting/payments` | List payments |
| GET | `/accounting/gl-accounts` | List GL accounts |
| GET | `/accounting/journal-entries` | List journal entries |
| GET | `/accounting/tax-zones` | List tax zones |
| GET | `/accounting/*/export` | Export endpoints available |

---

### Dispatch Module (`/dispatch`) - 36 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dispatch/appointment-assignments` | List assignments |
| POST | `/dispatch/appointment-assignments/assign-technicians` | Assign technicians |
| POST | `/dispatch/appointment-assignments/unassign-technicians` | Unassign technicians |
| GET | `/dispatch/arrival-windows` | List arrival windows |
| GET | `/dispatch/business-hours` | List business hours |
| GET | `/dispatch/capacity` | Get capacity |
| GET | `/dispatch/non-job-appointments` | List non-job appointments |
| GET | `/dispatch/teams` | List teams |
| GET | `/dispatch/technician-shifts` | List technician shifts |
| GET | `/dispatch/technician-tracking` | Get technician tracking |
| GET | `/dispatch/zones` | List zones |

---

### Pricebook Module (`/pricebook`) - 40 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/pricebook/services` | List services |
| GET | `/pricebook/services/:id` | Get service by ID |
| POST | `/pricebook/services` | Create service |
| PATCH | `/pricebook/services/:id` | Update service |
| DELETE | `/pricebook/services/:id` | Delete service |
| GET | `/pricebook/materials` | List materials |
| GET | `/pricebook/equipment` | List equipment |
| GET | `/pricebook/categories` | List categories |
| GET | `/pricebook/discounts-and-fees` | List discounts/fees |
| POST | `/pricebook/bulk/import` | Bulk import |
| GET | `/pricebook/bulk/export` | Bulk export |

---

### Payroll Module (`/payroll`) - 34 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/payroll/timesheets` | List timesheets |
| GET | `/payroll/timesheet-codes` | List timesheet codes |
| GET | `/payroll/job-splits` | List job splits |
| GET | `/payroll/gross-pay-items` | List gross pay items |
| GET | `/payroll/payroll-adjustments` | List payroll adjustments |
| GET | `/payroll/payrolls` | List payrolls |
| GET | `/payroll/activity-codes` | List activity codes |

---

### Settings Module (`/settings`) - 20 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings/employees` | List employees |
| GET | `/settings/employees/:id` | Get employee by ID |
| POST | `/settings/employees` | Create employee |
| PATCH | `/settings/employees/:id` | Update employee |
| GET | `/settings/technicians` | List technicians |
| GET | `/settings/business-units` | List business units |
| GET | `/settings/user-roles` | List user roles |
| GET | `/settings/tag-types` | List tag types |

---

### Inventory Module (`/inventory`) - 47 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inventory/adjustments` | List adjustments |
| GET | `/inventory/purchase-orders` | List purchase orders |
| POST | `/inventory/purchase-orders` | Create purchase order |
| GET | `/inventory/receipts` | List receipts |
| GET | `/inventory/returns` | List returns |
| GET | `/inventory/transfers` | List transfers |
| GET | `/inventory/trucks` | List trucks |
| GET | `/inventory/vendors` | List vendors |
| GET | `/inventory/warehouses` | List warehouses |

---

### JPM Extended Module (`/jpm`) - 69 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jpm/appointments` | List appointments |
| GET | `/jpm/appointments/:id` | Get appointment by ID |
| POST | `/jpm/appointments` | Create appointment |
| POST | `/jpm/appointments/:id/cancel` | Cancel appointment |
| POST | `/jpm/appointments/:id/hold` | Hold appointment |
| POST | `/jpm/appointments/:id/reschedule` | Reschedule appointment |
| GET | `/jpm/budget-codes` | List budget codes |
| GET | `/jpm/job-types` | List job types |
| GET | `/jpm/job-cancel-reasons` | List cancel reasons |
| GET | `/jpm/job-hold-reasons` | List hold reasons |
| GET | `/jpm/projects` | List projects |
| GET | `/jpm/project-statuses` | List project statuses |
| GET | `/jpm/project-types` | List project types |

---

### Marketing Module (`/marketing`) - 19 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketing/categories` | List campaign categories |
| GET | `/marketing/campaigns` | List campaigns |
| POST | `/marketing/campaigns` | Create campaign |
| GET | `/marketing/campaign-costs` | List campaign costs |
| GET | `/marketing/campaign-cost-summary` | Get cost summary |
| GET | `/marketing/suppressions` | List suppressions |

---

### Marketing Ads Module (`/marketing-ads`) - 7 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/marketing-ads/attributed-leads` | List attributed leads |
| GET | `/marketing-ads/performance` | Get performance data |
| GET | `/marketing-ads/scheduled-job-attributions` | List job attributions |
| GET | `/marketing-ads/web-booking-attributions` | List web bookings |
| POST | `/marketing-ads/external-call-attributions` | Create call attribution |

---

### Forms Module (`/forms`) - 5 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/forms/forms` | List forms |
| GET | `/forms/forms/:id` | Get form by ID |
| GET | `/forms/form-submissions` | List form submissions |
| GET | `/forms/jobs/:jobId/forms` | Get job forms |

---

### Reporting Module (`/reporting`) - 5 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reporting/report-categories` | List report categories |
| GET | `/reporting/report-categories/:id` | Get category by ID |
| GET | `/reporting/report-categories/:id/reports` | List category reports |
| GET | `/reporting/dynamic-value-sets/:id` | Get dynamic value set |

---

### Task Management Module (`/task-management`) - 5 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/task-management/data` | Get task data |
| GET | `/task-management/tasks` | List tasks |
| GET | `/task-management/tasks/:id` | Get task by ID |
| POST | `/task-management/tasks` | Create task |
| PATCH | `/task-management/tasks/:id` | Update task |

---

### Telecom Module (`/telecom`) - 10 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/telecom/calls` | List calls |
| GET | `/telecom/calls/:id` | Get call by ID |
| GET | `/telecom/calls/export` | Export calls |
| GET | `/telecom/opt-in-out` | List opt in/out |
| POST | `/telecom/opt-in-out` | Create opt in/out |

---

### Timesheets Module (`/timesheets`) - 12 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/timesheets/activities` | List activities |
| GET | `/timesheets/activities/:id` | Get activity by ID |
| POST | `/timesheets/activities` | Create activity |
| PATCH | `/timesheets/activities/:id` | Update activity |
| DELETE | `/timesheets/activities/:id` | Delete activity |
| GET | `/timesheets/activity-categories` | List activity categories |
| GET | `/timesheets/activity-types` | List activity types |

---

### Equipment Systems Module (`/equipment`) - 8 endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/equipment/installed-equipment` | List installed equipment |
| GET | `/equipment/installed-equipment/:id` | Get equipment by ID |
| POST | `/equipment/installed-equipment` | Create equipment |
| PATCH | `/equipment/installed-equipment/:id` | Update equipment |
| DELETE | `/equipment/installed-equipment/:id` | Delete equipment |

---

### Job Booking Module (`/jbce`) - 1 endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jbce/call-reasons` | List call reasons |

---

### Pricebook Sync Engine (`/api/sync/pricebook`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/pricebook/status` | Get sync status, stats, and scheduler info |
| GET | `/api/sync/pricebook/logs` | Get sync history logs |
| GET | `/api/sync/pricebook/conflicts` | Get unresolved sync conflicts |
| POST | `/api/sync/pricebook/full` | Trigger full sync |
| POST | `/api/sync/pricebook/incremental` | Trigger incremental sync |
| POST | `/api/sync/pricebook/conflicts/:id/resolve` | Resolve a conflict |

---

### AI Chat Agent (`/chat/pricebook`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat/pricebook` | Send message to chat agent |
| GET | `/chat/pricebook/health` | Chat agent health status |

**Chat Request Body:**
```json
{
  "sessionId": "unique-session-id",
  "message": "search for transformer"
}
```

**Supported Intents:**
- Browse & Search: "show me pool materials", "search transformer"
- Create Items: "create a material called Test Part"
- Update Items: "update price of EMT to $5.99"
- **Job Estimates**: "start estimate for job 12345", "add chlorinator hookup", "show estimate", "create estimate"

---

### n8n Webhook Integration (`/api/n8n`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/n8n/events` | List available webhook events |
| POST | `/api/n8n/subscribe` | Subscribe to events |
| GET | `/api/n8n/subscriptions` | List active subscriptions |
| DELETE | `/api/n8n/subscriptions/:id` | Unsubscribe |
| POST | `/api/n8n/webhook` | Receive/process n8n webhooks |

**Available Events:**
- `material_created`, `material_updated`, `material_deleted`
- `service_created`, `service_updated`, `service_deleted`
- `category_created`
- `sync_started`, `sync_completed`, `sync_failed`
- `conflict_detected`, `conflict_resolved`

---

## Example Usage

### cURL Examples

```bash
# Health check
curl http://localhost:3001/ping

# List jobs with pagination
curl "http://localhost:3001/jobs?page=1&pageSize=50"

# Get customer by ID
curl http://localhost:3001/customers/12345

# Get customers created in the last 7 days
# Replace dates with actual ISO 8601 timestamps
curl "http://localhost:3001/customers?createdOnOrAfter=2025-11-24T00:00:00.000Z&createdOnOrBefore=2025-12-01T23:59:59.999Z&page=1&pageSize=50"

# Dynamic: Get customers from last 7 days (using shell date command)
curl "http://localhost:3001/customers?createdOnOrAfter=$(date -u -v-7d +%Y-%m-%dT00:00:00.000Z)&createdOnOrBefore=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)&page=1&pageSize=50"

# Create estimate (POST with body)
curl -X POST http://localhost:3001/estimates \
  -H "Content-Type: application/json" \
  -d '{"jobId": 123, "name": "New Estimate"}'
```

### Get Recent Customers Script

A dedicated script to fetch customers created in the last N days:

```bash
# Get customers from last 7 days (default)
npm run recent-customers

# Or run directly with custom parameters
node scripts/get-recent-customers.js http://localhost:3001 7

# Get customers from last 30 days
node scripts/get-recent-customers.js http://localhost:3001 30
```

### n8n HTTP Request Node

```json
{
  "url": "http://localhost:3001/jobs",
  "method": "GET",
  "queryParameters": {
    "page": 1,
    "pageSize": 50,
    "createdOnOrAfter": "2024-01-01"
  }
}
```

### Chat Agent Examples

```bash
# Start an estimate for a job
curl -X POST http://localhost:3001/chat/pricebook \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session", "message": "Start estimate for job 12345"}'

# Add items to estimate
curl -X POST http://localhost:3001/chat/pricebook \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session", "message": "Add chlorinator hookup and transformer"}'

# Show current estimate
curl -X POST http://localhost:3001/chat/pricebook \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session", "message": "Show estimate"}'

# Search pricebook
curl -X POST http://localhost:3001/chat/pricebook \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "my-session", "message": "Search for pool pump"}'
```

### Pricebook Sync Examples

```bash
# Get sync status
curl http://localhost:3001/api/sync/pricebook/status

# Trigger full sync
curl -X POST http://localhost:3001/api/sync/pricebook/full

# Get sync logs
curl http://localhost:3001/api/sync/pricebook/logs
```

### n8n Webhook Examples

```bash
# List available events
curl http://localhost:3001/api/n8n/events

# Subscribe to events
curl -X POST http://localhost:3001/api/n8n/subscribe \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "http://n8n:5678/webhook/test", "events": ["material_created", "sync_completed"]}'

# List subscriptions
curl http://localhost:3001/api/n8n/subscriptions
```

## Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Using Docker

```bash
# Build image
docker build -t perfect-catch-st-automation .

# Run container
docker run -d \
  --name st-automation \
  -p 3001:3001 \
  --env-file .env \
  perfect-catch-st-automation
```

### Using Docker Compose

```bash
# Basic deployment
docker-compose up -d

# Full stack with PostgreSQL (for pricebook sync)
docker-compose -f docker-compose.pricebook.yml up -d
```

### Full Stack Deployment (Pricebook Engine)

The pricebook engine requires PostgreSQL. Use the full stack deployment:

```bash
# Start all services
docker-compose -f docker-compose.pricebook.yml up -d

# Connect to pricebook network
docker network connect pricebook-net perfect-catch-st-automation

# Populate database from ServiceTitan
docker exec perfect-catch-st-automation node scripts/populate-pricebook-db.js
```

**Services included:**
- `st-automation` - Main API server (port 3001)
- `pricebook-postgres` - PostgreSQL database (port 5432)
- `redis` - Redis cache (port 6379)

## Open WebUI Integration

A ready-to-use tool for Open WebUI is available at `openwebui/pricebook_tool.py`.

1. Go to Open WebUI → Workspace → Tools
2. Create new tool and paste the contents of `pricebook_tool.py`
3. Enable the tool in your chat

**Available functions:**
- `search_pricebook(query)` - Natural language search
- `get_pricebook_categories()` - List all categories
- `get_pricebook_status()` - Database statistics

## 🆕 MCP Server (Model Context Protocol)

An MCP server is available for integration with Claude Desktop and other MCP-compatible AI assistants.

### Installation

```bash
# Python version (recommended)
cd mcp-server
pip install -r requirements.txt

# Node.js version
cd mcp-server
npm install
```

### Claude Desktop Configuration

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "pricebook": {
      "command": "python",
      "args": ["/path/to/mcp-server/pricebook_mcp.py"],
      "env": {
        "PRICEBOOK_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Available Tools (20+)

| Category | Tools |
|----------|-------|
| **Search** | `search_pricebook`, `list_categories`, `get_materials`, `get_services`, `get_equipment` |
| **Estimates** | `start_estimate`, `add_to_estimate`, `show_estimate`, `remove_from_estimate`, `create_estimate`, `clear_estimate` |
| **Updates** | `update_service`, `update_material`, `get_service_details`, `get_material_details` |
| **Sync** | `get_sync_status`, `trigger_sync`, `get_sync_logs` |
| **Webhooks** | `list_webhook_events`, `list_webhook_subscriptions`, `subscribe_webhook` |
| **Chat** | `chat` (natural language) |

See `mcp-server/README.md` for full documentation.

## Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

## License

Proprietary - Perfect Catch Electric & Pools

## Support

For issues or questions, contact the development team.
