# Perfect Catch ST Automation - Documentation Index

## Recent Updates

| Date | Document | Description |
|------|----------|-------------|
| Dec 2024 | [CHANGELOG_DEC_2024.md](./CHANGELOG_DEC_2024.md) | CRM Pipeline Sync, Salesforce integration |
| Dec 2024 | [CRM_PIPELINE_SYNC.md](./integrations/CRM_PIPELINE_SYNC.md) | Complete CRM sync implementation |

---

## Quick Navigation

| Section | Description |
|---------|-------------|
| [Architecture](./architecture/) | System design, data flows, component interactions |
| [Deployment](./deployment/) | Deployment status, gaps, recommendations |
| [Development](./development/) | Developer guides, sync engine, chat agent |
| [Integrations](./integrations/) | n8n, Dashboard, GHL, CRM, Salesforce |
| [API Reference](./api/) | ServiceTitan OpenAPI specs and endpoint maps |
| [Archive](./archive/) | Historical batch specs and prompts |

---

## Architecture

| Document | Description |
|----------|-------------|
| [SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md) | Complete system architecture overview |
| [DATA_FLOW_DIAGRAM.md](./architecture/DATA_FLOW_DIAGRAM.md) | Visual data flow diagrams (Mermaid) |
| [COMPONENT_INTERACTIONS.md](./architecture/COMPONENT_INTERACTIONS.md) | Component interaction matrix |

---

## Deployment

| Document | Description |
|----------|-------------|
| [DEPLOYMENT_STATUS.md](./deployment/DEPLOYMENT_STATUS.md) | Current deployment status by batch |
| [DEPLOYMENT_SUMMARY.md](./deployment/DEPLOYMENT_SUMMARY.md) | Deployment summary and history |
| [GAPS_AND_RECOMMENDATIONS.md](./deployment/GAPS_AND_RECOMMENDATIONS.md) | Known issues and fixes |

---

## Development

| Document | Description |
|----------|-------------|
| [SYSTEM_DOCUMENTATION.md](./development/SYSTEM_DOCUMENTATION.md) | Main system documentation |
| [PRICEBOOK_SYNC_ENGINE.md](./development/PRICEBOOK_SYNC_ENGINE.md) | Pricebook sync engine guide |
| [CHAT_AGENT_GUIDE.md](./development/CHAT_AGENT_GUIDE.md) | AI chat agent usage |
| [N8N_INTEGRATION_GUIDE.md](./development/N8N_INTEGRATION_GUIDE.md) | n8n workflow integration |

---

## Integrations

### CRM Pipeline Sync (NEW - Dec 2024)
| Document | Description |
|----------|-------------|
| [CRM_PIPELINE_SYNC.md](./integrations/CRM_PIPELINE_SYNC.md) | Complete CRM sync implementation guide |

### Salesforce
| Document | Description |
|----------|-------------|
| [Salesforce/INTEGRATION_COMPLETE.md](./integrations/Salesforce/INTEGRATION_COMPLETE.md) | Salesforce integration status |
| [Salesforce/SALESFORCE_DEPLOYMENT_GUIDE.md](./integrations/Salesforce/SALESFORCE_DEPLOYMENT_GUIDE.md) | Deployment instructions |

### n8n Workflows
| Document | Description |
|----------|-------------|
| [n8n/README.md](./integrations/n8n/README.md) | n8n setup overview |
| [n8n/IMPLEMENTATION_GUIDE.md](./integrations/n8n/IMPLEMENTATION_GUIDE.md) | Step-by-step implementation |
| [n8n/WORKFLOW_COMPARISON.md](./integrations/n8n/WORKFLOW_COMPARISON.md) | Workflow version comparison |

### Dashboard
| Document | Description |
|----------|-------------|
| [dashboard/README.md](./integrations/dashboard/README.md) | Dashboard overview |
| [dashboard/MASTER_DEPLOYMENT_GUIDE.md](./integrations/dashboard/MASTER_DEPLOYMENT_GUIDE.md) | Deployment instructions |
| [dashboard/VENDOR_INTEGRATION.md](./integrations/dashboard/VENDOR_INTEGRATION.md) | Vendor integration guide |

---

## API Reference

| File | Description |
|------|-------------|
| [openapi.yaml](./api/openapi.yaml) | OpenAPI specification |
| [endpoint-map.json](./api/endpoint-map.json) | Complete endpoint mapping |
| `tenant-*.json` | Tenant-specific API schemas |

---

## Archive

Historical batch specifications and AI prompts used during development.

### Batch Specs
- **batch-1-database/** - Database schema and MCP server
- **batch-2-sync-workflow/** - Sync engine and workflow engine
- **batch-8-ai-estimation/** - AI estimation engine
- **BATCH_5.5_COMPLETE_GHL_SYNC.md** - GHL integration spec

### Prompts
- **MASTER_PROMPT_PRICEBOOK_ENGINE_PART1.md**
- **MASTER_PROMPT_PRICEBOOK_ENGINE_PART2.md**
