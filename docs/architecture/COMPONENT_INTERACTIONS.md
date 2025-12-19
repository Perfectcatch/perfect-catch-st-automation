# Component Interactions Matrix

## Service Dependencies

| Component | Reads From | Writes To | Triggers | Triggered By |
|-----------|-----------|-----------|----------|--------------|
| **sync-orchestrator** | ServiceTitan API | st_* tables, st_sync_log | - | Cron, Manual, API |
| **sync-customers** | ST /customers API | st_customers | - | sync-orchestrator |
| **sync-jobs** | ST /jobs API | st_jobs | - | sync-orchestrator |
| **sync-estimates** | ST /estimates API | st_estimates | - | sync-orchestrator |
| **sync-invoices** | ST /invoices API | st_invoices | - | sync-orchestrator |
| **sync-reference-data** | ST /business-units, /technicians | st_business_units, st_technicians | - | sync-orchestrator |
| **sync-scheduler** | - | - | sync-orchestrator | Cron (node-cron) |
| **event-detector** | st_estimates, st_jobs, st_invoices | - | workflow-manager | Polling (30s interval) |
| **trigger-engine** | workflow_definitions | workflow_instances | execution-engine | event-detector events |
| **execution-engine** | workflow_instances, workflow_definitions | workflow_step_executions | agent-executor | Polling (10s interval) |
| **agent-executor** | workflow_instances | messaging_log | Twilio, SendGrid | execution-engine |
| **condition-evaluator** | st_* tables | - | - | execution-engine |
| **workflow-manager** | - | - | trigger-engine | event-detector |
| **sync-estimate-to-ghl** | st_estimates, st_customers, st_jobs | ghl_opportunities | GHL API | event-detector |
| **sync-contacts-from-ghl** | GHL /contacts API | st_customers (ghl_contact_id) | - | Manual, Cron |
| **sync-opportunities-from-ghl** | GHL /opportunities API | ghl_opportunities | - | Manual, Cron |
| **MCP query-database** | PostgreSQL | - | - | Claude/AI Agent |
| **MCP call-st-api** | ServiceTitan API | - | - | Claude/AI Agent |
| **MCP send-sms** | - | messaging_log | Twilio API | Claude/AI Agent |
| **MCP send-email** | - | messaging_log | SendGrid API | Claude/AI Agent |

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
    ├──► workflow_instances.customer_id
    ├──► messaging_log.customer_id
    ├──► customer_communication_preferences.customer_id
    └──► callrail_calls.matched_customer_id

st_jobs
    │
    ├──► st_estimates.job_id
    ├──► st_invoices.job_id
    ├──► st_appointments.job_id
    └──► ghl_opportunities.st_job_id

st_estimates
    │
    └──► ghl_opportunities.st_estimate_id (custom field)

workflow_definitions
    │
    └──► workflow_instances.workflow_definition_id

workflow_instances
    │
    └──► workflow_step_executions.workflow_instance_id

messaging_templates
    │
    └──► messaging_log.template_id
```

---

## API Endpoint Usage

### ServiceTitan API Endpoints

| Endpoint | Used By | Method | Purpose |
|----------|---------|--------|---------|
| `/crm/v2/tenant/{id}/customers` | sync-customers | GET | Fetch customer records |
| `/jpm/v2/tenant/{id}/jobs` | sync-jobs | GET | Fetch job records |
| `/sales/v2/tenant/{id}/estimates` | sync-estimates | GET | Fetch estimate records |
| `/accounting/v2/tenant/{id}/invoices` | sync-invoices | GET | Fetch invoice records |
| `/dispatch/v2/tenant/{id}/appointments` | sync-appointments | GET | Fetch appointments (404) |
| `/settings/v2/tenant/{id}/business-units` | sync-reference-data | GET | Fetch business units |
| `/settings/v2/tenant/{id}/technicians` | sync-reference-data | GET | Fetch technicians |
| `/jpm/v2/tenant/{id}/job-types` | sync-reference-data | GET | Fetch job types |
| `/marketing/v2/tenant/{id}/campaigns` | sync-reference-data | GET | Fetch campaigns |
| `/jpm/v2/tenant/{id}/jobs` | MCP create-job | POST | Create new job |
| `/dispatch/v2/tenant/{id}/appointments` | MCP schedule-appointment | POST | Schedule appointment |

### GoHighLevel API Endpoints

| Endpoint | Used By | Method | Purpose |
|----------|---------|--------|---------|
| `/contacts/` | sync-contacts-from-ghl | GET | Fetch contacts |
| `/contacts/` | sync-estimate-to-ghl | POST | Create contact |
| `/contacts/{id}` | sync-estimate-to-ghl | PUT | Update contact |
| `/opportunities/` | sync-opportunities-from-ghl | GET | Fetch opportunities |
| `/opportunities/` | sync-estimate-to-ghl | POST | Create opportunity |
| `/opportunities/{id}` | sync-estimate-to-ghl | PUT | Update opportunity |

### External Service APIs

| Service | Endpoint | Used By | Purpose |
|---------|----------|---------|---------|
| Twilio | `/Messages` | agent-executor, MCP send-sms | Send SMS |
| SendGrid | `/mail/send` | agent-executor, MCP send-email | Send email |
| CallRail | Webhook receiver | webhook-handler | Receive call data |

---

## Event Flow Matrix

| Event | Emitted By | Handled By | Creates |
|-------|-----------|------------|---------|
| `estimate_created` | event-detector | trigger-engine | workflow_instances |
| `estimate_approved` | event-detector | trigger-engine | workflow_instances |
| `estimate_rejected` | event-detector | trigger-engine | - |
| `job_created` | event-detector | trigger-engine | workflow_instances |
| `job_completed` | event-detector | trigger-engine | workflow_instances |
| `invoice_created` | event-detector | trigger-engine | workflow_instances |
| `invoice_overdue` | event-detector | trigger-engine | workflow_instances |
| `appointment_created` | event-detector | trigger-engine | workflow_instances |

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
│   └── imports: execution-engine.js
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
│   └── exports: syncCustomerToGHL
│
├── sync-contacts-from-ghl.js
│   └── imports: sync-base.js
│
├── sync-opportunities-from-ghl.js
│   └── imports: sync-base.js
│
└── sync-estimate-to-ghl.js
    └── imports: sync-base.js
```

### MCP Server

```
mcp-server/
├── index.js
│   ├── imports: tools/query-database.js
│   ├── imports: tools/call-st-api.js
│   ├── imports: tools/send-sms.js
│   ├── imports: tools/send-email.js
│   ├── imports: tools/create-job.js
│   └── imports: tools/schedule-appointment.js
│
└── tools/
    └── index.js (tool registry)
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
| `TWILIO_ACCOUNT_SID` | agent-executor, MCP | .env |
| `TWILIO_AUTH_TOKEN` | agent-executor, MCP | .env |
| `TWILIO_PHONE_NUMBER` | agent-executor, MCP | .env |
| `ANTHROPIC_API_KEY` | agent-executor | .env |
| `SYNC_FULL_CRON` | sync-scheduler | .env |
| `SYNC_INCREMENTAL_CRON` | sync-scheduler | .env |
| `EVENT_POLL_INTERVAL_MS` | event-detector | .env |
| `EXECUTION_CHECK_INTERVAL_MS` | execution-engine | .env |
