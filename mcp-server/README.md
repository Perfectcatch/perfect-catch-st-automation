# Perfect Catch MCP Server v2.0

## Overview

AI-powered Model Context Protocol server with **95 tools** across 12 categories for complete field service automation.

## Tool Categories

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

## Key Tools

### AI Estimation (Most Important)
- `generate_estimate_from_description` - Create estimates from natural language
- `search_pricebook` - AI-powered fuzzy pricebook search
- `add_items_to_estimate` - Add items using natural language

### Customer Intelligence
- `get_customer_insights` - Complete customer profile with predictions
- `get_customers_needing_followup` - Find at-risk customers

### Smart Scheduling
- `get_smart_availability` - AI-recommended time slots
- `optimize_route` - Route optimization for technicians

### Analytics
- `get_kpi_dashboard` - Business KPIs
- `forecast_revenue` - Revenue predictions

## Services

The MCP server uses 6 AI service modules:

| Service | Purpose |
|---------|---------|
| `ai-estimator.js` | Natural language estimate generation |
| `pricebook-ai.js` | Fuzzy search with synonym expansion |
| `nlp-parser.js` | Entity and intent extraction |
| `customer-intel.js` | Customer insights and predictions |
| `route-optimizer.js` | TSP route optimization |
| `analytics-engine.js` | Business intelligence |

## Usage

### With Claude Desktop

Add to `claude_desktop_config.json` (use the shell script which loads all environment variables):

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "/opt/docker/servicetitan-ai/perfect-catch-st-automation/mcp-server/start-mcp.sh"
    }
  }
}
```

Or manually specify all required environment variables:

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "node",
      "args": ["/opt/docker/servicetitan-ai/perfect-catch-st-automation/mcp-server/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://postgres:Catchadmin%402025@localhost:6432/perfectcatch_automation",
        "SERVICETITAN_DATABASE_URL": "postgresql://postgres:Catchadmin%402025@localhost:6432/perfectcatch_automation",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "SERVICE_TITAN_CLIENT_ID": "your-client-id",
        "SERVICE_TITAN_CLIENT_SECRET": "your-client-secret",
        "SERVICE_TITAN_TENANT_ID": "your-tenant-id",
        "SERVICE_TITAN_APP_KEY": "your-app-key",
        "PRICEBOOK_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Example Conversations

**Create an estimate:**
```
"Generate an estimate for customer 12345: replace pool heater 400k BTU"
```

**Search pricebook:**
```
"Search for variable speed pumps in the pricebook"
```

**Customer insights:**
```
"Show me insights for customer 456"
```

**Route optimization:**
```
"Optimize route for technician 5 with appointments 100, 101, 102"
```

---

# Pricebook MCP Server

Model Context Protocol (MCP) server for the ServiceTitan Pricebook Engine. This server exposes all pricebook capabilities as tools that can be used by AI assistants like Claude.

## Features

- **20+ Tools** for pricebook management
- **Natural Language Chat** via the AI agent
- **Job Estimate Building** with session context
- **ServiceTitan Integration** for real-time updates
- **n8n Webhook Management**

## Installation

```bash
cd mcp-server
npm install
```

## Configuration

Set the API base URL (defaults to `http://localhost:3001`):

```bash
export PRICEBOOK_API_URL=http://localhost:3001
```

## Usage with Claude Desktop

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json` on Linux or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "/opt/docker/servicetitan-ai/perfect-catch-st-automation/mcp-server/start-mcp.sh"
    }
  }
}
```

The `start-mcp.sh` script automatically loads all required environment variables from the `.env` file including ServiceTitan credentials.

## Available Tools

### Search & Browse

| Tool | Description |
|------|-------------|
| `search_pricebook` | Search materials, services, equipment |
| `list_categories` | List all pricebook categories |
| `get_materials` | Get materials (optionally by category) |
| `get_services` | Get services (optionally by category) |
| `get_equipment` | Get equipment items |

### Estimate Building

| Tool | Description |
|------|-------------|
| `start_estimate` | Start estimate for a job |
| `add_to_estimate` | Add items to current estimate |
| `show_estimate` | Show current estimate |
| `remove_from_estimate` | Remove item from estimate |
| `create_estimate` | Push estimate to ServiceTitan |
| `clear_estimate` | Clear current estimate |

### ServiceTitan Updates

| Tool | Description |
|------|-------------|
| `get_service_details` | Get service with linked materials |
| `get_material_details` | Get material with vendor pricing |
| `update_service` | Update service price |
| `update_material` | Update material price/cost |

### Sync Operations

| Tool | Description |
|------|-------------|
| `get_sync_status` | Get sync status and stats |
| `trigger_sync` | Trigger full or incremental sync |
| `get_sync_logs` | Get sync history |

### n8n Integration

| Tool | Description |
|------|-------------|
| `list_webhook_events` | List available events |
| `list_webhook_subscriptions` | List active subscriptions |
| `subscribe_webhook` | Subscribe to events |

### Natural Language

| Tool | Description |
|------|-------------|
| `chat` | Send any message to the AI agent |

## Resources

The server also provides these resources:

| URI | Description |
|-----|-------------|
| `pricebook://status` | Current sync status |
| `pricebook://categories` | All categories |
| `pricebook://webhook-events` | Available webhook events |

## Example Conversations

### Search for items
```
User: Search for pool pump parts
Claude: [uses search_pricebook tool]
Found 15 results for "pool pump"...
```

### Build an estimate
```
User: Start an estimate for job 12345
Claude: [uses start_estimate tool]
Started estimate for Job #12345. What would you like to add?

User: Add chlorinator hookup and transformer
Claude: [uses add_to_estimate tool]
Added 2 items. Current total: $494.00

User: Create the estimate
Claude: [uses create_estimate tool]
Estimate created in ServiceTitan!
```

### Update pricing
```
User: Update the price of service 12258 to $899
Claude: [uses update_service tool]
Updated service price to $899.00
```

## Development

```bash
# Run in development mode (with watch)
npm run dev

# Run normally
npm start
```

## Requirements

- Node.js >= 18
- Pricebook API server running at configured URL
- MCP SDK v0.5.0+
