# 🏗️ MASTER PROMPT: ServiceTitan Pricebook Sync Engine with Conversational AI

**Date:** December 6, 2025  
**Target:** Windsurf AI Agent / Claude Code  
**Goal:** Build complete pricebook replication system with bi-directional sync, chat interface, and n8n integration

---

## 🎯 EXECUTIVE SUMMARY

Build a **production-ready pricebook management system** that:

1. **Fully mirrors ServiceTitan's pricebook** in PostgreSQL (categories, materials, services, equipment)
2. **Bi-directional sync** with conflict detection and resolution
3. **Conversational AI interface** for natural language CRUD operations
4. **n8n webhook integration** for workflow automation
5. **Serves as the single source of truth** between external tools and ServiceTitan

---

## ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRICEBOOK SYNC ENGINE                         │
└──────────────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │  Chat Agent  │  │  n8n Webhook │  │  Admin API   │
        │              │  │              │  │              │
        │  "Show me    │  │  POST /n8n/  │  │  REST CRUD   │
        │   conduit    │  │  webhook     │  │  endpoints   │
        │   materials" │  │              │  │              │
        └──────────────┘  └──────────────┘  └──────────────┘
                │                │                │
                └────────────────┼────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Sync Engine     │
                        │                  │
                        │  • Fetch from ST │
                        │  • Compare       │
                        │  • Detect        │
                        │    Conflicts     │
                        │  • Apply Changes │
                        │  • Push to ST    │
                        └──────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │  PostgreSQL  │  │  ServiceTitan│  │  Redis       │
        │  + pgvector  │  │  API v3      │  │  (cache)     │
        │              │  │              │  │              │
        │  • Categories│  │  372 endpoints│  │              │
        │  • Materials │  │              │  │              │
        │  • Services  │  │              │  │              │
        │  • Equipment │  │              │  │              │
        └──────────────┘  └──────────────┘  └──────────────┘
```

---

## PART 1: DATABASE SCHEMA

### 🎯 GOAL
Create a PostgreSQL schema that **exactly replicates** ServiceTitan's pricebook structure with:
- All ST API fields
- Sync metadata
- Conflict tracking
- Audit history
- Vector embeddings for AI

### 📋 WINDSURF PROMPT

```
Create the complete PostgreSQL database schema for the pricebook sync engine.

Location: `/src/db/migrations/001_pricebook_schema.sql`

Requirements:
1. Mirror ALL fields from ServiceTitan Pricebook API v3
2. Add sync tracking (last_synced_at, sync_status, st_modified_on)
3. Add conflict management (has_conflict, conflict_data)
4. Add audit triggers for all changes
5. Add pgvector extension for AI embeddings
6. Add indexes for performance

Tables to create:
• pricebook_categories
• pricebook_materials  
• pricebook_services
• pricebook_equipment
• pricebook_sync_log
• pricebook_sync_conflicts
• pricebook_changes (audit log)

Include:
- All foreign key constraints
- All indexes (including vector indexes)
- Audit triggers using track_pricebook_change() function
- Soft delete support (deleted_at, deleted_in_st)
```

### DATABASE SCHEMA IMPLEMENTATION

The complete schema should include these tables with all fields shown in the ServiceTitan API documentation:

**Key Fields for Each Table:**

1. **pricebook_categories**
   - ST fields: id, tenant_id, name, code, parent_id, display_order, active, category_type
   - Sync fields: st_created_on, st_modified_on, last_synced_at, sync_status, sync_direction
   - Conflict fields: has_conflict, conflict_data
   - Audit fields: local_created_at, local_modified_at, deleted_at

2. **pricebook_materials**
   - ST fields: id, tenant_id, category_id, code, name, description, manufacturer, model_number, upc, sku, cost, price, member_price, unit_of_measure, labor_hours, warranty_months, active, tags, images, custom_fields
   - Additional: embedding vector(1536) for AI similarity search
   - All sync/conflict/audit fields

3. **pricebook_services**
   - ST fields: id, tenant_id, category_id, code, name, description, price, labor_hours, materials_included, equipment_included, warranty_months, active
   - Additional: embedding vector(1536)
   - All sync/conflict/audit fields

4. **pricebook_equipment**
   - ST fields: id, tenant_id, category_id, code, name, manufacturer, model_number, cost, price, warranty_years, active
   - Additional: embedding vector(1536)
   - All sync/conflict/audit fields

5. **pricebook_sync_log**
   - Tracks every sync job: type, direction, started_at, completed_at, duration, records_fetched/created/updated/deleted, conflicts_detected, status, error_message

6. **pricebook_sync_conflicts**
   - Tracks conflicts: entity_type, entity_id, st_id, conflict_type, st_data, local_data, diff, status, resolution_strategy, resolved_at, resolved_by

7. **pricebook_changes**
   - Audit trail: entity_type, entity_id, action (create/update/delete), changed_fields, full_snapshot, source (sync_from_st, api, chat, n8n), user_id, created_at

---

## PART 2: SYNC ENGINE

### 🎯 GOAL
Build a robust bi-directional sync engine with:
- Full sync (all records)
- Incremental sync (only changes since last sync)
- Conflict detection (both ST and local modified)
- Automatic conflict resolution strategies
- Scheduled cron jobs

### 📋 WINDSURF PROMPT

```
Create a complete bi-directional pricebook sync engine.

Location: `/src/sync/pricebook/`

Directory Structure:
/src/sync/pricebook/
├── pricebook-sync.engine.ts          # Main orchestrator
├── fetchers/
│   ├── st-categories.fetcher.ts      # Fetch categories from ST API
│   ├── st-materials.fetcher.ts       # Fetch materials from ST API
│   ├── st-services.fetcher.ts        # Fetch services from ST API
│   └── st-equipment.fetcher.ts       # Fetch equipment from ST API
├── comparators/
│   ├── category.comparator.ts        # Compare ST vs local categories
│   ├── material.comparator.ts        # Compare ST vs local materials
│   ├── service.comparator.ts         # Compare ST vs local services
│   └── equipment.comparator.ts       # Compare ST vs local equipment
├── appliers/
│   ├── category.applier.ts           # Apply changes to PostgreSQL
│   ├── material.applier.ts           # Apply changes to PostgreSQL
│   ├── service.applier.ts            # Apply changes to PostgreSQL
│   └── equipment.applier.ts          # Apply changes to PostgreSQL
├── pushers/
│   ├── category.pusher.ts            # Push local changes to ST
│   ├── material.pusher.ts            # Push local changes to ST
│   ├── service.pusher.ts             # Push local changes to ST
│   └── equipment.pusher.ts           # Push local changes to ST
├── conflict-resolver.ts              # Detect and resolve conflicts
├── sync-scheduler.ts                 # Cron-based scheduling
└── sync.controller.ts                # HTTP API endpoints

Requirements:

1. Main Sync Engine (pricebook-sync.engine.ts):
   - async sync(options: SyncOptions): Promise<SyncResult>
   - Support directions: 'from_st', 'to_st', 'bidirectional'
   - Support entity types: categories, materials, services, equipment
   - Support full vs. incremental sync
   - Support dry-run mode (preview without applying)
   - Track all operations in pricebook_sync_log table

2. Fetchers (fetchers/*.ts):
   - async fetchAll(): Promise<STEntity[]>
   - Paginate through ST API (pageSize=1000, max allowed)
   - Handle rate limits with delays
   - Retry on transient failures
   - Log progress

3. Comparators (comparators/*.ts):
   - async compare(stEntities: STEntity[]): Promise<ComparisonResult>
   - Return: { new: [], modified: [], unchanged: [], deleted: [] }
   - Compare by st_id and st_modified_on timestamps
   - Detect field-level changes

4. Appliers (appliers/*.ts):
   - async create(stEntity: STEntity): Promise<void>
   - async update(localId: string, stEntity: STEntity): Promise<void>
   - async delete(localId: string): Promise<void> (soft delete)
   - Update sync metadata (last_synced_at, sync_status)
   - Log to pricebook_changes table

5. Conflict Resolver (conflict-resolver.ts):
   - async detectConflicts(modified: ModifiedEntity[]): Promise<Conflict[]>
   - Detect: 'local_newer', 'st_newer', 'both_modified'
   - async resolveConflicts(conflicts: Conflict[], strategy: 'keep_st' | 'keep_local'): Promise<Conflict[]>
   - Save conflicts to pricebook_sync_conflicts table

6. Sync Controller (sync.controller.ts):
   - POST /api/sync/pricebook/full → Trigger full sync
   - POST /api/sync/pricebook/incremental → Trigger incremental sync
   - GET /api/sync/pricebook/status → Get last sync info
   - GET /api/sync/pricebook/conflicts → List unresolved conflicts
   - POST /api/sync/pricebook/resolve-conflict/:id → Resolve specific conflict

7. Sync Scheduler (sync-scheduler.ts):
   - Full sync: daily at 2 AM (cron: '0 2 * * *')
   - Incremental sync: every 6 hours (cron: '0 */6 * * *')
   - Use node-cron package
   - Trigger sync engine programmatically

Technologies:
- Prisma for database operations
- Axios for ST API calls (via existing ServiceTitanClient)
- Pino for logging
- Bull queue for background jobs (optional)
- node-cron for scheduling

Error Handling:
- Wrap all operations in try/catch
- Log all errors with full stack traces
- Continue sync on individual failures (don't fail entire sync)
- Return detailed error information in sync results
```

### KEY IMPLEMENTATION DETAILS

**Sync Flow:**

```typescript
1. Create sync log entry (status: 'running')
2. FOR EACH entity type (categories, materials, services, equipment):
   a. Fetch from ServiceTitan (all pages)
   b. Compare with local database
   c. Detect conflicts (if both modified since last sync)
   d. Apply changes (create/update/delete)
   e. Log statistics
3. Update sync log (status: 'completed', duration, stats)
4. Return SyncResult
```

**Conflict Detection Logic:**

```typescript
if (stModifiedOn > lastSyncedAt && localModifiedAt > lastSyncedAt) {
  // CONFLICT: Both versions modified since last sync
  // Save to pricebook_sync_conflicts table
  // Mark entity with has_conflict = true
}
```

**Comparison Logic:**

```typescript
for each ST entity:
  - Find local entity by st_id
  - If not found → new (to be created)
  - If found and ST modified > local ST modified → modified (to be updated)
  - If found and timestamps match → unchanged (skip)

for each local entity:
  - If st_id not in ST response → deleted (soft delete)
```

---

## PART 3: CONVERSATIONAL AI AGENT

### 🎯 GOAL
Build a chat interface that allows natural language interaction with the pricebook:

**Example Conversations:**

```
User: Show me all conduit materials
Agent: Found 23 materials in the "Conduit" category:
       1. 1/2" EMT Conduit (EMT-050) - $2.45
       2. 3/4" EMT Conduit (EMT-075) - $3.15
       ...
       Would you like to add more materials?

User: Create 1-inch 90s, Ts, and couplers
Agent: Great! I'll create 3 materials in "Conduit":
       1. 1-inch 90-degree Elbow
       2. 1-inch Tee
       3. 1-inch Coupler
       
       To complete this, I need:
       • Price (e.g., "$5.99")
       • Cost (your supplier cost)
       • Unit of measure (e.g., "Each", "Box")

User: Price is $5.99, cost is $3.50, sold by each
Agent: Perfect! Created 3 materials:
       1. 1-inch 90-degree Elbow (EMT-100-90) - ST ID: 12345
       2. 1-inch Tee (EMT-100-T) - ST ID: 12346
       3. 1-inch Coupler (EMT-100-CPL) - ST ID: 12347
       
       What else can I help with?
```

### 📋 WINDSURF PROMPT

```
Create a conversational AI agent for the pricebook system.

Location: `/src/chat/`

Directory Structure:
/src/chat/
├── pricebook-chat.agent.ts       # Main agent orchestrator
├── intent-classifier.ts           # Classify user intent
├── entity-extractor.ts            # Extract material specs from text
├── validation-handler.ts          # Validate and detect missing fields
├── context-manager.ts             # Manage conversation state
└── chat.controller.ts             # HTTP/WebSocket endpoints

Requirements:

1. Main Agent (pricebook-chat.agent.ts):
   - async processMessage(sessionId: string, message: string): Promise<string>
   - Maintain conversation context per session
   - Support intents:
     * query_materials (show materials in category)
     * query_categories (list categories)
     * create_material (create single material)
     * create_multiple_materials (create batch)
     * update_material (modify existing)
   - Interactive validation (ask for missing fields)
   - Context awareness (remember last category)

2. Intent Classifier (intent-classifier.ts):
   - Use OpenAI GPT-4 to classify user intent
   - Consider conversation history
   - Return: { type: string, confidence: number, entities: any }

3. Entity Extractor (entity-extractor.ts):
   - async extractMaterials(message: string): Promise<Material[]>
   - Parse: "1-inch 90s, Ts, and couplers" → 
     [
       {name: "1-inch 90-degree Elbow", size: "1 inch"},
       {name: "1-inch Tee", size: "1 inch"},
       {name: "1-inch Coupler", size: "1 inch"}
     ]
   - async extractFieldValues(message: string, fields: string[]): Promise<Record<string, any>>
   - Parse: "price is $5.99" → {price: 5.99}

4. Validation Handler (validation-handler.ts):
   - validateMaterial(data: Partial<Material>): ValidationResult
   - Return: { valid: boolean, missingFields: string[], errors: string[] }
   - Required fields: code, name, categoryId, price, unitOfMeasure

5. Context Manager (context-manager.ts):
   - Store conversation history per session
   - Track pendingAction (waiting for user input)
   - Track lastCategory (for context)
   - async getContext(sessionId): Promise<ConversationContext>
   - async saveContext(sessionId, context): Promise<void>

6. Chat Controller (chat.controller.ts):
   - POST /api/chat/message → Send message, get response
   - GET /api/chat/history/:sessionId → Get conversation history
   - DELETE /api/chat/session/:sessionId → Clear session

Technologies:
- OpenAI GPT-4 for intent classification and entity extraction
- Redis for session storage (or in-memory for development)
- Express for HTTP API
- Socket.io for real-time chat (optional)

Natural Language Capabilities:
- Understand variations: "show conduit", "list conduit materials", "what's in conduit category"
- Extract multiple items: "create 1" 90s, Ts, and couplers"
- Parse prices: "$5.99", "5.99", "five dollars"
- Parse units: "each", "by the box", "per foot"
- Interactive flow: ask for missing fields one by one
```

### CONVERSATION FLOW EXAMPLE

```typescript
// User: "Show me conduit materials"
Step 1: Classify intent → query_materials
Step 2: Extract category name → "conduit"
Step 3: Find category in DB → {id: "uuid", name: "Conduit", stId: 123}
Step 4: Query materials where categoryId = 123
Step 5: Format response with material list
Step 6: Save context (lastCategory = {id, name, stId})

// User: "Create 1-inch 90s and Ts"
Step 1: Classify intent → create_multiple_materials
Step 2: Check context for category → Found: "Conduit" (from previous message)
Step 3: Extract materials → [{name: "1-inch 90-degree Elbow"}, {name: "1-inch Tee"}]
Step 4: Build material objects with defaults
Step 5: Validate → Missing: price, cost, unitOfMeasure
Step 6: Store pendingAction = {type: 'create_material', data: materials, missingFields: ['price', 'cost', 'unitOfMeasure']}
Step 7: Ask user for missing fields

// User: "Price is $5.99, cost is $3.50, sold each"
Step 1: Check context → Found pendingAction
Step 2: Extract field values → {price: 5.99, cost: 3.50, unitOfMeasure: "Each"}
Step 3: Update pending materials with values
Step 4: Validate again → All fields present!
Step 5: Create materials in ServiceTitan
Step 6: Store in local DB
Step 7: Clear pendingAction
Step 8: Confirm creation with ST IDs
```

---

## PART 4: N8N INTEGRATION

### 🎯 GOAL
Enable workflow automation through n8n webhooks:
- Receive webhook calls from n8n
- Process batch operations
- Trigger syncs
- Send events back to n8n

### 📋 WINDSURF PROMPT

```
Create n8n webhook integration for the pricebook system.

Location: `/src/integrations/n8n/`

Directory Structure:
/src/integrations/n8n/
├── webhook-handler.ts         # Process incoming webhooks
├── webhook-sender.ts           # Send events to n8n
├── event-emitter.ts            # Emit pricebook events
└── n8n.controller.ts           # HTTP endpoints

Requirements:

1. Webhook Handler (webhook-handler.ts):
   - async handleWebhook(payload: N8nWebhookPayload): Promise<any>
   - Support actions:
     * create_material
     * update_material
     * query_materials
     * sync_pricebook
   - Validate payload structure
   - Return standardized response

2. Webhook Sender (webhook-sender.ts):
   - async sendEvent(webhookUrl: string, event: PricebookEvent): Promise<void>
   - Support events:
     * material_created
     * material_updated
     * sync_completed
     * conflict_detected
   - Retry on failures (3 attempts with exponential backoff)

3. Event Emitter (event-emitter.ts):
   - Use Node.js EventEmitter
   - Emit events on all pricebook operations
   - Subscribe n8n webhooks to specific events

4. n8n Controller (n8n.controller.ts):
   - POST /api/n8n/webhook → Receive webhooks from n8n
   - POST /api/n8n/batch-create → Batch create materials
   - POST /api/n8n/subscribe → Subscribe webhook URL to events
   - POST /api/n8n/unsubscribe → Unsubscribe webhook

Example Payloads:

Incoming (from n8n):
{
  "action": "create_material",
  "entity": "material",
  "data": {
    "categoryId": 123,
    "name": "1-inch 90-degree Elbow",
    "code": "EMT-100-90",
    "price": 5.99,
    "cost": 3.50,
    "unitOfMeasure": "Each"
  }
}

Outgoing (to n8n):
{
  "event": "material_created",
  "timestamp": "2025-12-06T10:30:00Z",
  "data": {
    "id": "uuid",
    "stId": 12345,
    "name": "1-inch 90-degree Elbow",
    "categoryName": "Conduit"
  }
}

Technologies:
- Express for HTTP endpoints
- Axios for outgoing webhooks
- EventEmitter for event bus
```

---

## PART 5: MAIN SERVER INTEGRATION

### 📋 WINDSURF PROMPT

```
Integrate all components into the main Express server.

Location: `/src/server.ts`

Requirements:
1. Initialize Prisma client
2. Initialize ServiceTitan client (use existing proxy client)
3. Initialize PricebookSyncEngine
4. Initialize PricebookChatAgent
5. Initialize N8nWebhookHandler
6. Start SyncScheduler
7. Mount all routers:
   - /api/sync/pricebook → Sync endpoints
   - /api/chat → Chat endpoints
   - /api/n8n → n8n endpoints
8. Add error handling middleware
9. Add request logging middleware
10. Add health check endpoint

Example:
import { PricebookSyncEngine } from './sync/pricebook/pricebook-sync.engine';
import { PricebookChatAgent } from './chat/pricebook-chat.agent';
import { N8nWebhookHandler } from './integrations/n8n/webhook-handler';
import { SyncScheduler } from './sync/pricebook/sync-scheduler';

const syncEngine = new PricebookSyncEngine(prisma, stClient, logger);
const chatAgent = new PricebookChatAgent(prisma, stClient, logger, process.env.OPENAI_API_KEY);
const n8nHandler = new N8nWebhookHandler(prisma, stClient, logger);
const scheduler = new SyncScheduler(syncEngine, logger);

app.set('syncEngine', syncEngine);
app.set('chatAgent', chatAgent);
app.set('n8nHandler', n8nHandler);

app.use('/api/sync/pricebook', syncRouter);
app.use('/api/chat', chatRouter);
app.use('/api/n8n', n8nRouter);

scheduler.start();
```

---

## TESTING STRATEGY

### Unit Tests
```bash
# Test sync engine
npm test sync/pricebook/pricebook-sync.engine.test.ts

# Test chat agent
npm test chat/pricebook-chat.agent.test.ts

# Test n8n webhook handler
npm test integrations/n8n/webhook-handler.test.ts
```

### Integration Tests
```bash
# Test full sync flow
npm test integration/sync-flow.test.ts

# Test chat conversation flow
npm test integration/chat-flow.test.ts

# Test n8n webhook flow
npm test integration/n8n-flow.test.ts
```

### Manual Testing

1. **Sync Test:**
```bash
curl -X POST http://localhost:3001/api/sync/pricebook/full \
  -H "Content-Type: application/json" \
  -d '{"resolveConflicts": "keep_st"}'
```

2. **Chat Test:**
```bash
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-1",
    "message": "Show me all conduit materials"
  }'
```

3. **n8n Webhook Test:**
```bash
curl -X POST http://localhost:3001/api/n8n/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create_material",
    "entity": "material",
    "data": {
      "categoryId": 123,
      "name": "Test Material",
      "code": "TEST-001",
      "price": 10.00,
      "unitOfMeasure": "Each"
    }
  }'
```

---

## DEPLOYMENT

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/pricebook

# ServiceTitan API
ST_API_BASE_URL=https://api.servicetitan.io
ST_CLIENT_ID=your-client-id
ST_CLIENT_SECRET=your-client-secret
ST_TENANT_ID=your-tenant-id
ST_APP_KEY=your-app-key

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3001
NODE_ENV=production

# Sync Schedule
SYNC_FULL_CRON=0 2 * * *
SYNC_INCREMENTAL_CRON=0 */6 * * *
```

### Docker Compose
```yaml
version: '3.8'
services:
  pricebook-engine:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/pricebook
      - ST_CLIENT_ID=${ST_CLIENT_ID}
      - ST_CLIENT_SECRET=${ST_CLIENT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=pricebook
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:
```

---

## SUCCESS CRITERIA

✅ Database schema mirrors ST pricebook completely  
✅ Full sync completes successfully  
✅ Incremental sync detects only changes  
✅ Conflicts are detected and saved to conflicts table  
✅ Chat agent responds to queries correctly  
✅ Chat agent creates materials with validation  
✅ n8n webhooks process successfully  
✅ Cron jobs run on schedule  
✅ All tests pass  
✅ API endpoints return expected responses  

---

## NEXT STEPS AFTER COMPLETION

1. Add Admin UI (Next.js) for conflict resolution
2. Add real-time sync status dashboard
3. Add bulk import/export (CSV, Excel)
4. Add API rate limit monitoring
5. Add Datadog/Sentry error tracking
6. Add load testing
7. Add database backups
8. Add rollback functionality for syncs
