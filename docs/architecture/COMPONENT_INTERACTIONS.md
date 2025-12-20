# Component Interactions Matrix

*Last Updated: 2025-12-20*

## Service Dependencies

| Component | Container | Reads From | Writes To | Triggers | Triggered By |
|-----------|-----------|-----------|-----------|----------|--------------|
| **sync-orchestrator** | st-sync-worker | ServiceTitan API | st_* tables, st_sync_log | - | Cron (5min), Manual |
| **sync-customers** | st-sync-worker | ST /customers API | st_customers | - | sync-orchestrator |
| **sync-jobs** | st-sync-worker | ST /jobs API | st_jobs | - | sync-orchestrator |
| **sync-estimates** | st-sync-worker | ST /estimates API | st_estimates | - | sync-orchestrator |
| **sync-invoices** | st-sync-worker | ST /invoices API | st_invoices | - | sync-orchestrator |
| **sync-appointments** | st-sync-worker | ST /appointments API | st_appointments | - | sync-orchestrator |
| **sync-reference-data** | st-sync-worker | ST /settings API | st_business_units, st_technicians | - | sync-orchestrator |
| **sync-scheduler** | st-sync-worker | - | - | sync-orchestrator | Cron (node-cron) |
| **event-detector** | st-workflow-worker | st_* tables | - | workflow-manager | Polling (30s) |
| **trigger-engine** | st-workflow-worker | workflow_definitions | workflow_instances | execution-engine | event-detector |
| **execution-engine** | st-workflow-worker | workflow_instances | workflow_step_executions | agent-executor | Polling (10s) |
| **agent-executor** | st-workflow-worker | workflow_instances | messaging_log | Twilio, SendGrid | execution-engine |
| **workflow-manager** | st-workflow-worker | - | - | trigger-engine, GHL sync | event-detector |
| **ghl-sync-worker** | st-workflow-worker | st_*, ghl_* | ghl_contacts, ghl_opportunities | GHL API | event-detector |
| **self-healing-agent** | st-monitoring-agent | All workers | system_alerts | Worker restarts | Polling (5min) |
| **MCP query-database** | - | PostgreSQL | - | - | Claude/AI Agent |
| **MCP call-st-api** | - | ServiceTitan API | - | - | Claude/AI Agent |
| **MCP send-sms** | - | - | messaging_log | Twilio API | Claude/AI Agent |

---

## Database Table Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TABLE RELATIONSHIPS                                   │
└─────────────────────────────────────────────────────────────────────────────┘

st_business_units
    │
    ├──► st_jobs.business_unit_id
    ├──► st_technicians.business_unit_id
    └──► ghl_opportunities.pipeline_id (via ghl_pipeline_id)

st_customers
    │
    ├──► st_jobs.customer_id
    ├──► st_estimates.customer_id
    ├──► st_invoices.customer_id
    ├──► st_locations.customer_id
    ├──► st_appointments (via job)
    ├──► ghl_contacts.st_customer_id
    ├──► ghl_opportunities.st_customer_id
    ├──► workflow_instances.customer_id
    ├──► messaging_log.customer_id
    └──► callrail_calls.matched_customer_id

st_jobs
    │
    ├──► st_estimates.job_id (nullable)
    ├──► st_invoices.job_id
    ├──► st_appointments.job_id
    ├──► job_technicians.job_id
    └──► ghl_opportunities.st_job_id

st_estimates
    │
    └──► ghl_opportunities (synced on create/sold)

st_technicians
    │
    └──► job_technicians.technician_id

workflow_definitions
    │
    └──► workflow_instances.workflow_definition_id

workflow_instances
    │
    └──► workflow_step_executions.workflow_instance_id
```

---

## API Endpoint Usage

### ServiceTitan API Endpoints

| Endpoint | Used By | Method | Status |
|----------|---------|--------|--------|
| `/crm/v2/tenant/{id}/customers` | sync-customers | GET | ✅ Working |
| `/jpm/v2/tenant/{id}/jobs` | sync-jobs | GET | ✅ Working |
| `/sales/v2/tenant/{id}/estimates` | sync-estimates | GET | ✅ Working |
| `/accounting/v2/tenant/{id}/invoices` | sync-invoices | GET | ✅ Working |
| `/dispatch/v2/tenant/{id}/appointments` | sync-appointments | GET | ✅ Working |
| `/settings/v2/tenant/{id}/business-units` | sync-reference-data | GET | ✅ Working |
| `/settings/v2/tenant/{id}/technicians` | sync-reference-data | GET | ✅ Working |
| `/jpm/v2/tenant/{id}/job-types` | sync-reference-data | GET | ✅ Working |
| `/marketing/v2/tenant/{id}/campaigns` | sync-reference-data | GET | ✅ Working |
| `/jpm/v2/tenant/{id}/jobs` | MCP create-job | POST | ✅ Available |
| `/dispatch/v2/tenant/{id}/appointments` | MCP schedule | POST | ✅ Available |

### GoHighLevel API Endpoints

| Endpoint | Used By | Method | Status |
|----------|---------|--------|--------|
| `/contacts/` | sync-contacts-from-ghl | GET | ✅ Working |
| `/contacts/` | sync-estimate-to-ghl | POST | ✅ Working |
| `/contacts/{id}` | sync-estimate-to-ghl | PUT | ✅ Working |
| `/opportunities/` | sync-opportunities-from-ghl | GET | ✅ Working |
| `/opportunities/` | sync-estimate-to-ghl | POST | ✅ Working |
| `/opportunities/{id}` | sync-estimate-to-ghl | PUT | ✅ Working |
| `/pipelines/` | pipeline management | GET | ✅ Working |

### External Service APIs

| Service | Endpoint | Used By | Status |
|---------|----------|---------|--------|
| Twilio | `/Messages` | agent-executor, MCP | ✅ Configured |
| SendGrid | `/mail/send` | agent-executor, MCP | ✅ Configured |
| CallRail | Webhook receiver | webhook-handler | ✅ Configured |
| Anthropic | Claude API | self-healing-agent | ✅ Working |

---

## Event Flow Matrix

| Event | Emitted By | Handled By | Actions |
|-------|-----------|------------|---------|
| `estimate_created` | event-detector | workflow-manager | Sync to GHL, create opportunity |
| `estimate_approved` | event-detector | workflow-manager | Move GHL opp to "Job Sold" |
| `estimate_rejected` | event-detector | workflow-manager | Update GHL status |
| `job_created` | event-detector | workflow-manager | Create workflow instance |
| `job_completed` | event-detector | workflow-manager | Trigger review request |
| `install_job_created` | event-detector | workflow-manager | Move opp to Install Pipeline |
| `invoice_created` | event-detector | trigger-engine | Track for payment |
| `invoice_overdue` | event-detector | trigger-engine | Alert/escalate |
| `appointment_created` | event-detector | trigger-engine | Update GHL stage |

---

## File Dependencies

### Sync Engine

```
src/services/sync/
├── sync-orchestrator.js
│   ├── imports: sync-reference-data.js
│   ├── imports: sync-customers.js
│   ├── imports: sync-jobs.js
│   ├── imports: sync-estimates.js
│   ├── imports: sync-appointments.js
│   └── imports: sync-invoices.js
│
├── sync-base.js (shared utilities)
│   └── used by: all sync modules
│
└── sync-scheduler.js
    └── imports: sync-orchestrator.js
```

### Workflow Engine

```
src/services/workflow/
├── workflow-manager.js
│   ├── imports: event-detector.js
│   ├── imports: trigger-engine.js
│   ├── imports: execution-engine.js
│   └── imports: ghl/index.js (for GHL sync)
│
├── event-detector.js
│   └── imports: ghl/sync-estimate-to-ghl.js (lazy)
│
├── trigger-engine.js
│   └── imports: condition-evaluator.js
│
├── execution-engine.js
│   ├── imports: agent-executor.js
│   └── imports: condition-evaluator.js
│
└── agent-executor.js
    └── uses: Anthropic Claude API
```

### GHL Integration

```
src/integrations/ghl/
├── index.js
│   ├── exports: syncOpportunitiesFromGHL
│   ├── exports: syncContactsFromGHL
│   ├── exports: syncEstimateToGHL
│   ├── exports: syncCustomerToGHL
│   ├── exports: moveOpportunityToJobSold
│   ├── exports: moveOpportunityToInstallPipeline
│   └── exports: processInstallJobMoves
│
├── sync-contacts-from-ghl.js
├── sync-opportunities-from-ghl.js
├── sync-estimate-to-ghl.js
└── move-to-install-pipeline.js
```

### Monitoring

```
src/services/monitoring/
├── self-healing-agent.js
│   ├── imports: health-monitor.js
│   ├── uses: Anthropic Claude API
│   └── uses: child_process (docker commands)
│
└── health-monitor.js
    └── checks: database, workers, sync status
```

### MCP Server

```
mcp-server/
├── index.js
│   └── imports: tools/index.js
│
├── tools/
│   ├── index.js (tool registry)
│   ├── query-database.js
│   ├── call-st-api.js
│   ├── send-sms.js
│   ├── send-email.js
│   ├── create-job.js
│   ├── schedule-appointment.js
│   ├── scheduling/index.js
│   ├── estimates/index.js
│   ├── customers/index.js
│   ├── jobs/index.js
│   └── ai/index.js
│
└── services/
    ├── ai-estimator.js
    ├── pricebook-ai.js
    └── customer-intel.js
```

---

## Configuration Dependencies

| Config | Required By | Source |
|--------|-------------|--------|
| `DATABASE_URL` | All DB operations | .env |
| `SERVICETITAN_DATABASE_URL` | Sync engine | .env |
| `SERVICE_TITAN_CLIENT_ID` | stClient.js | .env |
| `SERVICE_TITAN_CLIENT_SECRET` | stClient.js | .env |
| `SERVICE_TITAN_TENANT_ID` | All ST API calls | .env |
| `GHL_API_KEY` | GHL integration | .env |
| `GHL_LOCATION_ID` | GHL integration | .env |
| `GHL_SYNC_ENABLED` | workflow-worker | .env |
| `GHL_AUTO_SYNC_ESTIMATES` | event-detector | .env |
| `TWILIO_ACCOUNT_SID` | agent-executor, MCP | .env |
| `TWILIO_AUTH_TOKEN` | agent-executor, MCP | .env |
| `TWILIO_PHONE_NUMBER` | agent-executor, MCP | .env |
| `ANTHROPIC_API_KEY` | agent-executor, self-healing | .env |
| `SYNC_FULL_CRON` | sync-scheduler | .env |
| `SYNC_INCREMENTAL_CRON` | sync-scheduler | .env |
| `EVENT_POLL_INTERVAL_MS` | event-detector | .env |
| `HEALTH_CHECK_INTERVAL_MS` | self-healing-agent | .env |

---

## Worker Container Configuration

| Container | Command | Memory Limit | Health Check |
|-----------|---------|--------------|--------------|
| `st-sync-worker` | `npm run worker:sync` | 256M | File heartbeat |
| `st-workflow-worker` | `npm run worker:workflows` | 256M | File heartbeat |
| `st-monitoring-agent` | `node scripts/start-self-healing-agent.js` | 256M | File heartbeat |
