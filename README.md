# Perfect Catch ST Automation Platform

A comprehensive automation platform for Perfect Catch Electric & Pools that integrates ServiceTitan, GoHighLevel, Slack, VAPI voice AI, and vendor pricing systems.

**Version:** 2.2.0
**Last Updated:** December 16, 2025

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      PERFECT CATCH AUTOMATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ ServiceTitan │  │  GoHighLevel │  │    Slack     │  │    VAPI     │  │
│  │     API      │  │     API      │  │   Bot/App    │  │  Voice AI   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                 │                 │                 │         │
│         ▼                 ▼                 ▼                 ▼         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    AUTOMATION PLATFORM                             │  │
│  │  • Sync Engine (ST → PostgreSQL)   • Pricebook Engine             │  │
│  │  • Scheduling Module (Smart Match) • Workflow Engine               │  │
│  │  • MCP Server (95 AI Tools)        • Chat Agent (NLP)             │  │
│  │  • Vendor Scrapers (Pool360/CED)   • Self-Healing Agent           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Core Components

| Component | Description | Status |
|-----------|-------------|--------|
| **ServiceTitan Sync** | Bi-directional sync with ST API | ✅ Active |
| **Scheduling Module** | Smart technician matching, skill-based dispatch | ✅ Active |
| **Workflow Engine** | Event-driven automation with triggers | ✅ Active |
| **MCP Server** | 95 AI tools across 12 categories for Claude | ✅ Active |
| **Pricebook Chat Agent** | Natural language pricebook & estimate building | ✅ Active |
| **GHL Integration** | Bi-directional GoHighLevel sync | ✅ Active |
| **Slack Integration** | Slash commands, interactive modals, DM support | ✅ Active |
| **VAPI Integration** | Voice AI endpoints for real-time availability | ✅ Active |
| **Pricebook Engine** | ST pricebook sync with vendor price comparison | ✅ Active |
| **Vendor Scrapers** | Pool360, CED pricing scrapers | ✅ Active |
| **Self-Healing Agent** | Auto-recovery monitoring | ✅ Active |

### Data Synced

| Entity | Records | Sync Frequency |
|--------|---------|----------------|
| Customers | 1,682 | Every 6 hours |
| Jobs | 3,223 | Every 6 hours |
| Estimates | 1,220 | Every 6 hours |
| Invoices | 3,370 | Every 6 hours |
| Technicians | 9 | Every 4 hours |
| Teams | 6 | Every 4 hours |
| Zones | 12 | Every 4 hours |
| Job Types | 37 | Every 4 hours |
| Pricebook Items | 6,000+ | Daily |

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Docker & Docker Compose
- PostgreSQL 15+
- ServiceTitan API credentials
- GoHighLevel API key (optional)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd perfect-catch-st-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run database migrations
npm run db:migrate:deploy

# Start the server
npm start
```

### Docker Deployment

```bash
# Build and start all services
docker compose up -d

# Start background workers
docker compose up -d sync-worker workflow-worker monitoring-agent

# Check status
docker ps | grep st-
```

---

## Project Structure

```
perfect-catch-st-automation/
├── src/
│   ├── services/
│   │   ├── sync/              # ServiceTitan sync engine
│   │   ├── workflow/          # Event-driven workflow engine
│   │   ├── monitoring/        # Health monitoring & self-healing
│   │   └── database.js        # Database connection pool
│   ├── integrations/
│   │   ├── ghl/               # GoHighLevel bi-directional sync
│   │   └── slack/             # Slack bot, slash commands, modals
│   ├── scrapers/
│   │   ├── pool360/           # Pool360 vendor scraper
│   │   ├── ced/               # CED vendor scraper
│   │   └── common/            # Shared scraper utilities
│   ├── sync/
│   │   ├── pricebook/         # Pricebook sync engine
│   │   └── scheduling/        # Scheduling module sync engine
│   ├── chat/                  # AI chat agent (intent, NLP, context)
│   ├── routes/                # Express API routes
│   │   ├── scheduling.routes.js   # Scheduling API
│   │   ├── vapi.routes.js         # VAPI voice AI endpoints
│   │   ├── slack.routes.js        # Slack webhooks
│   │   └── pricebook.routes.js    # Pricebook API
│   ├── controllers/           # Route controllers
│   ├── db/
│   │   └── migrations/        # Database migrations (001-009)
│   └── lib/                   # Shared utilities
├── mcp-server/                # Model Context Protocol server
│   ├── tools/                 # MCP tools (95 total)
│   ├── services/              # AI services (estimator, NLP, analytics)
│   └── index.js               # MCP entry point
├── scripts/                   # Utility scripts
├── docs/                      # Documentation
│   ├── architecture/          # System architecture
│   ├── deployment/            # Deployment guides
│   ├── development/           # Developer guides
│   ├── integrations/          # Integration guides
│   ├── api/                   # API reference
│   └── archive/               # Historical specs
└── tests/                     # Test files
```

---

## NPM Scripts

### Server

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with hot reload |

### Sync Operations

| Script | Description |
|--------|-------------|
| `npm run sync:initial` | Run full initial sync |
| `npm run sync:st-full` | Full ServiceTitan sync |
| `npm run sync:st-incremental` | Incremental sync |
| `npm run sync:reference` | Sync reference data only |

### GHL Operations

| Script | Description |
|--------|-------------|
| `npm run ghl:sync:all` | Sync all from GHL |
| `npm run ghl:sync:contacts` | Sync contacts from GHL |
| `npm run ghl:sync:opportunities` | Sync opportunities from GHL |
| `npm run ghl:push:estimates` | Push estimates to GHL |

### Workers

| Script | Description |
|--------|-------------|
| `npm run worker:sync` | Start sync scheduler |
| `npm run worker:workflows` | Start workflow engine |
| `npm run worker:monitor` | Start self-healing agent |

### Debugging

| Script | Description |
|--------|-------------|
| `npm run workflow:status` | Check workflow engine status |
| `npm run test:workflow` | Test workflow triggering |
| `npm run health:check` | Check system health |

---

## API Endpoints

### Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health check |
| `/health/detailed` | GET | Detailed system health |
| `/health/workflows` | GET | Workflow engine status |
| `/status` | GET | Full system status |

### ServiceTitan Proxy

All ServiceTitan API endpoints are proxied through `/api/st/*`

### Sync Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/full` | POST | Trigger full sync |
| `/api/sync/incremental` | POST | Trigger incremental sync |
| `/api/sync/status` | GET | Get sync status |
| `/api/sync/scheduling/full` | POST | Trigger scheduling module sync |

### Scheduling Module

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scheduling/technicians` | GET | List technicians (cached) |
| `/scheduling/technicians/:stId` | GET | Get technician with skills |
| `/scheduling/technicians/by-skills` | GET | Find techs by required skills |
| `/scheduling/technicians/:id/skills` | POST | Add skill to technician |
| `/scheduling/teams` | GET | List all teams |
| `/scheduling/zones` | GET | List all zones |
| `/scheduling/job-types` | GET | List job types |
| `/scheduling/job-profiles` | GET | List job profiles (local intelligence) |
| `/scheduling/availability` | GET | Get availability for date |
| `/scheduling/rules` | GET | List scheduling rules |
| `/scheduling/rules` | POST | Create scheduling rule |
| `/scheduling/stats` | GET | Entity & cache statistics |
| `/scheduling/audit` | GET | Scheduling audit log |

### VAPI Voice AI

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vapi/technician-availability` | GET | Real-time tech availability |
| `/vapi/technicians` | GET | List technicians (simplified) |
| `/vapi/capacity` | GET | Dispatch capacity data |

### Slack Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/slack/events` | POST | Slack events webhook |
| `/slack/commands/:command` | POST | Slash command handler |
| `/slack/interactive` | POST | Interactive components |
| `/slack/options` | POST | External select options |
| `/slack/health` | GET | Slack integration health |

### Pricebook

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/pricebook/services` | GET/POST | List/create services |
| `/pricebook/materials` | GET/POST | List/create materials |
| `/pricebook/equipment` | GET/POST | List/create equipment |
| `/pricebook/categories` | GET/POST | List/create categories |
| `/pricebook/images` | GET | Proxy ST images |

### Chat Agent

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | POST | Send message to chat agent |
| `/api/chat/session/:id` | GET | Get session context |
| `/api/chat/session/:id` | DELETE | Clear session |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `SERVICE_TITAN_TENANT_ID` | ServiceTitan tenant ID |
| `SERVICE_TITAN_CLIENT_ID` | OAuth client ID |
| `SERVICE_TITAN_CLIENT_SECRET` | OAuth client secret |
| `SERVICE_TITAN_APP_KEY` | ST application key |
| `DATABASE_URL` | PostgreSQL connection string |

### Optional - Integrations

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment |
| `GHL_API_KEY` | - | GoHighLevel API key |
| `GHL_LOCATION_ID` | - | GHL location ID |
| `ANTHROPIC_API_KEY` | - | Claude API key (MCP/Chat) |
| `OPENAI_API_KEY` | - | OpenAI API key (Chat Agent) |
| `SLACK_BOT_TOKEN` | - | Slack bot OAuth token |
| `SLACK_SIGNING_SECRET` | - | Slack request signing secret |
| `TWILIO_ACCOUNT_SID` | - | Twilio account |
| `TWILIO_AUTH_TOKEN` | - | Twilio auth token |
| `SENDGRID_API_KEY` | - | SendGrid API key |

---

## Documentation

See [docs/INDEX.md](./docs/INDEX.md) for complete documentation.

### Key Documents

- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md)
- [Data Flow Diagrams](./docs/architecture/DATA_FLOW_DIAGRAM.md)
- [Deployment Status](./docs/deployment/DEPLOYMENT_STATUS.md)
- [Gaps & Recommendations](./docs/deployment/GAPS_AND_RECOMMENDATIONS.md)

---

## Docker Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| st-automation | perfect-catch-st-automation | 3001 | Main API server |
| sync-worker | st-sync-worker | - | Sync scheduler |
| workflow-worker | st-workflow-worker | - | Workflow engine |
| monitoring-agent | st-monitoring-agent | - | Self-healing agent |

---

## Database

### Connection

```
Host: postgres (Docker) / localhost:6432 (external)
Database: perfectcatch_automation
User: postgres
```

### Database Migrations

| Migration | Description |
|-----------|-------------|
| `001_pricebook_schema.sql` | Pricebook tables |
| `002_servicetitan_complete.sql` | Core ST entities |
| `003_workflow_engine.sql` | Workflow definitions & instances |
| `004_callrail_tracking.sql` | Call tracking |
| `005_messaging_system.sql` | SMS/Email messaging |
| `006_ghl_and_employees.sql` | GHL integration |
| `007_sync_enrichment.sql` | Sync metadata |
| `008_ghl_sync_controls.sql` | GHL sync controls |
| `009_scheduling_schema.sql` | Scheduling module |

### Key Tables

| Table | Description |
|-------|-------------|
| `st_customers` | ServiceTitan customers |
| `st_jobs` | ServiceTitan jobs |
| `st_estimates` | ServiceTitan estimates |
| `st_invoices` | ServiceTitan invoices |
| `workflow_definitions` | Workflow templates |
| `workflow_instances` | Active workflows |
| `ghl_opportunities` | GHL opportunities |
| `ghl_contacts` | GHL contacts |
| `messaging_log` | Message delivery log |

### Scheduling Module Tables

| Table | Description |
|-------|-------------|
| `scheduling_technicians` | Synced technicians |
| `scheduling_teams` | Synced teams |
| `scheduling_zones` | Synced zones |
| `scheduling_job_types` | Synced job types |
| `scheduling_technician_skills` | Local skill assignments |
| `scheduling_job_profiles` | Job duration/skill profiles |
| `scheduling_zone_travel_times` | Zone travel estimates |
| `scheduling_rules` | Business rules engine |
| `scheduling_capacity_cache` | Capacity cache (15-min TTL) |
| `scheduling_availability_cache` | Availability cache |
| `scheduling_audit_log` | Scheduling audit trail |

---

## MCP Server (Claude Integration)

The MCP Server provides **95 AI tools** across 12 categories for Claude Desktop integration.

### Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| **Estimates** | 15 | AI estimation, pricebook search, quote building |
| **Customers** | 8 | Customer intelligence, segmentation, insights |
| **Scheduling** | 12 | Smart scheduling, route optimization, dispatch |
| **Jobs** | 10 | Job management, status, profitability |
| **Invoicing** | 6 | Invoice creation, payments, collections |
| **Analytics** | 8 | KPIs, revenue, forecasting, trends |
| **Messaging** | 6 | SMS, email, campaigns, templates |
| **Workflows** | 7 | Automation, triggers, workflow control |
| **Equipment** | 5 | Equipment tracking, maintenance prediction |
| **Technicians** | 6 | Field tech tools, schedule, parts lookup |
| **Integrations** | 4 | QuickBooks, GHL, webhooks |
| **AI/NLP** | 8 | Entity extraction, intent detection, NLP |

### Claude Desktop Setup

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "ANTHROPIC_API_KEY": "sk-..."
      }
    }
  }
}
```

---

## Slack Integration

### Supported Slash Commands

| Command | Description |
|---------|-------------|
| `/quote [description]` | Generate estimate from description |
| `/schedule` | Check technician availability |
| `/customer [search]` | Search customers |
| `/revenue [period]` | Revenue for today/week/month |
| `/status` | System status |
| `/jobs [status]` | List jobs by status |
| `/techs` | List technicians |

### Event Support

- **App Mentions** - Respond when @mentioned in channels
- **Direct Messages** - Handle DMs to the bot
- **Interactive Components** - Buttons, modals, select menus

---

## Scheduling Module

### Hybrid Architecture

The scheduling module uses a hybrid approach:

1. **Reference Data (Synced)**: Technicians, teams, zones, job types from ServiceTitan
2. **Intelligence Data (Local)**: Skills, certifications, travel times, scheduling rules
3. **Cache Tables (15-min TTL)**: Capacity and availability data
4. **Real-Time API**: Jobs/appointments fetched live from ServiceTitan

### Default Scheduling Rules

| Rule | Type | Priority | Description |
|------|------|----------|-------------|
| `skill_match_required` | Constraint | 100 | Tech must have required skills |
| `certification_valid` | Constraint | 95 | Certifications must not be expired |
| `zone_preference` | Preference | 70 | Prefer techs assigned to job zone |
| `minimize_travel` | Optimization | 60 | Optimize for minimal travel time |
| `workload_balance` | Optimization | 40 | Balance jobs across techs |

### Sync Schedule

- **Full Sync**: Daily at 3:00 AM
- **Incremental Sync**: Every 4 hours

---

## License

Proprietary - Perfect Catch Electric & Pools
