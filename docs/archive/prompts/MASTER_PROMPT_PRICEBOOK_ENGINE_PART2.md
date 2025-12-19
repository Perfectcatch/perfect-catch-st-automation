# 🏗️ MASTER PROMPT PART 2: Detailed Implementation Examples

## COMPLETE CODE EXAMPLES

### Example 1: Sync Engine Main Orchestrator

```typescript
// /src/sync/pricebook/pricebook-sync.engine.ts

import { PrismaClient } from '@prisma/client';
import { ServiceTitanClient } from '@/clients/servicetitan.client';
import { Logger } from '@/utils/logger';

export interface SyncOptions {
  direction: 'from_st' | 'to_st' | 'bidirectional';
  entityTypes?: ('categories' | 'materials' | 'services' | 'equipment')[];
  fullSync?: boolean;
  resolveConflicts?: 'keep_st' | 'keep_local' | 'manual';
  dryRun?: boolean;
}

export interface SyncResult {
  syncLogId: string;
  status: 'completed' | 'failed' | 'partial';
  duration: number;
  stats: {
    fetched: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    conflicts: number;
    errors: number;
  };
  conflicts: any[];
  errors: any[];
}

export class PricebookSyncEngine {
  constructor(
    private prisma: PrismaClient,
    private stClient: ServiceTitanClient,
    private logger: Logger
  ) {}

  async sync(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    
    // Create sync log
    const syncLog = await this.prisma.pricebookSyncLog.create({
      data: {
        syncType: options.fullSync ? 'full' : 'incremental',
        direction: options.direction,
        status: 'running',
        triggeredBy: 'api',
        config: options as any
      }
    });

    const result: SyncResult = {
      syncLogId: syncLog.id,
      status: 'completed',
      duration: 0,
      stats: { fetched: 0, created: 0, updated: 0, deleted: 0, skipped: 0, conflicts: 0, errors: 0 },
      conflicts: [],
      errors: []
    };

    try {
      const entityTypes = options.entityTypes || ['categories', 'materials', 'services', 'equipment'];

      // Sync in order (categories first due to foreign keys)
      if (entityTypes.includes('categories')) {
        const categoryResult = await this.syncCategories(options, syncLog.id);
        this.mergeResults(result, categoryResult);
      }

      if (entityTypes.includes('materials')) {
        const materialResult = await this.syncMaterials(options, syncLog.id);
        this.mergeResults(result, materialResult);
      }

      if (entityTypes.includes('services')) {
        const serviceResult = await this.syncServices(options, syncLog.id);
        this.mergeResults(result, serviceResult);
      }

      if (entityTypes.includes('equipment')) {
        const equipmentResult = await this.syncEquipment(options, syncLog.id);
        this.mergeResults(result, equipmentResult);
      }

      result.status = result.errors.length > 0 ? 'partial' : 'completed';

    } catch (error) {
      this.logger.error('Sync failed:', error);
      result.status = 'failed';
      result.errors.push({ entity: 'sync', message: error.message, stack: error.stack });
    } finally {
      result.duration = Date.now() - startTime;

      await this.prisma.pricebookSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: result.status,
          completedAt: new Date(),
          durationSeconds: Math.floor(result.duration / 1000),
          recordsFetched: result.stats.fetched,
          recordsCreated: result.stats.created,
          recordsUpdated: result.stats.updated,
          recordsDeleted: result.stats.deleted,
          recordsSkipped: result.stats.skipped,
          conflictsDetected: result.stats.conflicts,
          errorsEncountered: result.stats.errors
        }
      });
    }

    return result;
  }

  private async syncCategories(options: SyncOptions, syncLogId: string) {
    // Implementation in next section
  }

  private mergeResults(target: SyncResult, source: Partial<SyncResult>) {
    if (source.stats) {
      target.stats.fetched += source.stats.fetched || 0;
      target.stats.created += source.stats.created || 0;
      target.stats.updated += source.stats.updated || 0;
      target.stats.deleted += source.stats.deleted || 0;
      target.stats.skipped += source.stats.skipped || 0;
      target.stats.conflicts += source.stats.conflicts || 0;
      target.stats.errors += source.stats.errors?.length || 0;
    }
    if (source.conflicts) target.conflicts.push(...source.conflicts);
    if (source.errors) target.errors.push(...source.errors);
  }
}
```

### Example 2: Category Fetcher

```typescript
// /src/sync/pricebook/fetchers/st-categories.fetcher.ts

export class STCategoriesFetcher {
  constructor(
    private stClient: ServiceTitanClient,
    private logger: Logger
  ) {}

  async fetchAll(): Promise<STCategory[]> {
    const allCategories: STCategory[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.stClient.get<PaginatedResponse<STCategory>>(
          '/api/v3/pricebook/categories',
          {
            params: {
              page,
              pageSize: 1000,
              active: undefined // Fetch all
            }
          }
        );

        allCategories.push(...response.data);
        
        this.logger.info(`Fetched page ${page}: ${response.data.length} categories`);

        hasMore = response.hasMore;
        page++;

        // Rate limiting
        await this.sleep(100);

      } catch (error) {
        this.logger.error(`Failed to fetch categories page ${page}:`, error);
        throw error;
      }
    }

    this.logger.info(`Fetched total: ${allCategories.length} categories`);
    return allCategories;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Example 3: Chat Agent with OpenAI

```typescript
// /src/chat/pricebook-chat.agent.ts

import { OpenAI } from 'openai';

export class PricebookChatAgent {
  private openai: OpenAI;

  constructor(
    private prisma: PrismaClient,
    private stClient: ServiceTitanClient,
    private logger: Logger,
    openaiApiKey: string
  ) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async processMessage(sessionId: string, userMessage: string): Promise<string> {
    const context = await this.getContext(sessionId);
    
    context.history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    let response: string;

    try {
      // Check if waiting for missing fields
      if (context.pendingAction?.missingFields?.length > 0) {
        response = await this.handleMissingFieldsResponse(context, userMessage);
      } else {
        // Classify intent
        const intent = await this.classifyIntent(userMessage, context);
        
        // Route to handler
        switch (intent.type) {
          case 'query_materials':
            response = await this.handleQueryMaterials(context, userMessage);
            break;
          case 'create_material':
            response = await this.handleCreateMaterial(context, userMessage);
            break;
          default:
            response = "I'm not sure what you'd like to do. Try asking me to show materials or create new ones.";
        }
      }

      context.history.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      await this.saveContext(sessionId, context);

      return response;

    } catch (error) {
      this.logger.error('Error processing message:', error);
      return "I encountered an error. Please try rephrasing that.";
    }
  }

  private async classifyIntent(message: string, context: any): Promise<{type: string, confidence: number}> {
    const systemPrompt = `You are an intent classifier for a pricebook management system.

Classify the user's intent into one of these categories:
- query_materials: User wants to see/list materials
- query_categories: User wants to see categories
- create_material: User wants to create a single material
- create_multiple_materials: User wants to create multiple materials
- update_material: User wants to modify an existing material
- unknown: Cannot determine intent

Consider the conversation history:
${context.history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

User message: "${message}"

Respond with JSON:
{"intent": "query_materials", "confidence": 0.95}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: systemPrompt }],
      temperature: 0.3
    });

    const result = JSON.parse(response.choices[0].message.content);
    return { type: result.intent, confidence: result.confidence };
  }

  private async handleQueryMaterials(context: any, message: string): Promise<string> {
    // Extract category name
    const categoryName = this.extractCategoryName(message);
    
    if (!categoryName) {
      return "Which category would you like to see? For example: 'conduit', 'wire', 'breakers'";
    }

    // Find category
    const category = await this.prisma.pricebookCategory.findFirst({
      where: {
        name: { contains: categoryName, mode: 'insensitive' },
        active: true,
        deletedAt: null
      }
    });

    if (!category) {
      return `I couldn't find a category matching "${categoryName}". Would you like me to list all categories?`;
    }

    // Save to context
    context.lastCategory = {
      id: category.id,
      name: category.name,
      stId: category.stId
    };

    // Get materials
    const materials = await this.prisma.pricebookMaterial.findMany({
      where: {
        categoryId: category.stId,
        active: true,
        deletedAt: null
      },
      orderBy: { name: 'asc' },
      take: 50
    });

    if (materials.length === 0) {
      return `The "${category.name}" category has no materials. Would you like to add some?`;
    }

    const materialList = materials
      .map((m, i) => `${i + 1}. ${m.name} (${m.code}) - $${m.price?.toFixed(2) || 'N/A'}`)
      .join('\n');

    return `Found ${materials.length} materials in "${category.name}":\n\n${materialList}\n\nWould you like to add more?`;
  }

  private async handleCreateMaterial(context: any, message: string): Promise<string> {
    // Use OpenAI to extract material specs
    const extractedMaterials = await this.extractMaterialsFromText(message);
    
    if (extractedMaterials.length === 0) {
      return "I couldn't identify materials. Try: 'Create 1-inch 90-degree elbows'";
    }

    // Check for category
    if (!context.lastCategory) {
      return "Which category should I create these in?";
    }

    // Build materials
    const materialsToCreate = extractedMaterials.map(m => ({
      categoryId: context.lastCategory.stId,
      name: m.name,
      code: this.generateCode(m.name),
      description: m.description,
      size: m.size,
      unitOfMeasure: m.unitOfMeasure || 'Each'
    }));

    // Validate
    const validation = this.validateMaterial(materialsToCreate[0]);
    
    if (validation.missingFields.length > 0) {
      context.pendingAction = {
        type: 'create_material',
        data: { materials: materialsToCreate },
        missingFields: validation.missingFields
      };

      return `I'll create ${materialsToCreate.length} material(s) in "${context.lastCategory.name}":\n\n${materialsToCreate.map((m, i) => `${i + 1}. ${m.name}`).join('\n')}\n\nI need:\n${this.formatMissingFields(validation.missingFields)}`;
    }

    // Create in ST
    const created = await this.createMaterialsInST(materialsToCreate);
    
    return `Created ${created.length} materials:\n${created.map((m, i) => `${i + 1}. ${m.name} (ST ID: ${m.id})`).join('\n')}`;
  }

  private async extractMaterialsFromText(message: string): Promise<any[]> {
    const prompt = `Extract materials from: "${message}"

Return JSON array with fields: name, description, size, unitOfMeasure

Example:
Input: "Create 1-inch 90s and tees"
Output: [
  {"name": "1-inch 90-degree Elbow", "description": "90-degree elbow fitting", "size": "1 inch", "unitOfMeasure": "Each"},
  {"name": "1-inch Tee", "description": "Tee fitting", "size": "1 inch", "unitOfMeasure": "Each"}
]

Return ONLY the JSON array.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  }

  private validateMaterial(data: any): {valid: boolean, missingFields: string[]} {
    const required = ['code', 'name', 'categoryId', 'price', 'unitOfMeasure'];
    const missing = required.filter(f => !data[f]);
    return { valid: missing.length === 0, missingFields: missing };
  }

  private formatMissingFields(fields: string[]): string {
    const labels = {
      price: '• Price (e.g., "$45.99")',
      cost: '• Cost (supplier cost)',
      unitOfMeasure: '• Unit (e.g., "Each", "Box")'
    };
    return fields.map(f => labels[f] || `• ${f}`).join('\n');
  }

  private generateCode(name: string): string {
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 20);
  }

  private async createMaterialsInST(materials: any[]): Promise<any[]> {
    const created = [];
    
    for (const material of materials) {
      const stResponse = await this.stClient.post('/api/v3/pricebook/materials', material);
      
      await this.prisma.pricebookMaterial.create({
        data: {
          stId: stResponse.data.id,
          ...material,
          lastSyncedAt: new Date(),
          syncStatus: 'synced',
          syncDirection: 'to_st'
        }
      });

      created.push(stResponse.data);
    }

    return created;
  }

  // Context management
  private async getContext(sessionId: string): Promise<any> {
    // In production, store in Redis
    // For now, in-memory
    return {
      sessionId,
      history: [],
      pendingAction: null,
      lastCategory: null
    };
  }

  private async saveContext(sessionId: string, context: any): Promise<void> {
    // Save to Redis
  }

  private extractCategoryName(message: string): string | null {
    const match = message.match(/(?:in\s+the\s+)?(\w+)\s+(?:category|materials?)/i);
    return match ? match[1] : null;
  }
}
```

### Example 4: n8n Webhook Handler

```typescript
// /src/integrations/n8n/webhook-handler.ts

export class N8nWebhookHandler {
  constructor(
    private prisma: PrismaClient,
    private stClient: ServiceTitanClient,
    private logger: Logger
  ) {}

  async handleWebhook(payload: any): Promise<any> {
    const { action, entity, data } = payload;

    this.logger.info(`n8n webhook: ${action} ${entity}`);

    switch (`${action}_${entity}`) {
      case 'create_material':
        return this.createMaterial(data);
      
      case 'update_material':
        return this.updateMaterial(data);
      
      case 'query_materials':
        return this.queryMaterials(data);
      
      case 'sync_pricebook':
        return this.triggerSync(data);
      
      default:
        throw new Error(`Unknown action: ${action} ${entity}`);
    }
  }

  private async createMaterial(data: any): Promise<any> {
    if (!data.name || !data.categoryId || !data.code) {
      throw new Error('Missing required fields');
    }

    // Create in ST
    const stResponse = await this.stClient.post('/api/v3/pricebook/materials', data);

    // Store locally
    const localMaterial = await this.prisma.pricebookMaterial.create({
      data: {
        stId: stResponse.data.id,
        ...data,
        syncStatus: 'synced',
        lastSyncedAt: new Date()
      }
    });

    return {
      success: true,
      material: localMaterial,
      stId: stResponse.data.id
    };
  }

  private async queryMaterials(filters: any): Promise<any> {
    const materials = await this.prisma.pricebookMaterial.findMany({
      where: { ...filters, active: true, deletedAt: null },
      take: filters.limit || 100
    });

    return {
      success: true,
      count: materials.length,
      materials
    };
  }
}
```

### Example 5: Complete HTTP Endpoints

```typescript
// /src/sync/pricebook/sync.controller.ts

import { Router } from 'express';

export const syncRouter = Router();

syncRouter.post('/full', async (req, res) => {
  try {
    const syncEngine = req.app.get('syncEngine');
    
    const result = await syncEngine.sync({
      direction: 'from_st',
      fullSync: true,
      resolveConflicts: req.body.resolveConflicts || 'manual'
    });

    res.json({
      success: true,
      syncLogId: result.syncLogId,
      status: result.status,
      duration: result.duration,
      stats: result.stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

syncRouter.post('/incremental', async (req, res) => {
  try {
    const syncEngine = req.app.get('syncEngine');
    
    const result = await syncEngine.sync({
      direction: 'from_st',
      fullSync: false
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

syncRouter.get('/status', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const lastSync = await prisma.pricebookSyncLog.findFirst({
      orderBy: { startedAt: 'desc' }
    });

    res.json({ success: true, lastSync });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

syncRouter.get('/conflicts', async (req, res) => {
  try {
    const prisma = req.app.get('prisma');
    
    const conflicts = await prisma.pricebookSyncConflicts.findMany({
      where: { status: 'unresolved' },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    res.json({ success: true, conflicts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## USAGE EXAMPLES

### Example 1: Chat Conversation

```
User: Show me all conduit materials

Agent: Found 23 materials in the "Conduit" category:

1. 1/2" EMT Conduit (EMT-050) - $2.45
2. 3/4" EMT Conduit (EMT-075) - $3.15
3. 1" EMT Conduit (EMT-100) - $4.25
...

Would you like to add more materials to this category?

---

User: Create 1-inch 90s, Ts, and couplers

Agent: Great! I'll create 3 materials in the "Conduit" category:

1. 1-inch 90-degree Elbow
2. 1-inch Tee
3. 1-inch Coupler

To complete this, I need:
• Price (e.g., "$5.99")
• Cost (supplier cost)
• Unit of measure (e.g., "Each", "Box")

---

User: Price is $5.99, cost is $3.50, sold by each

Agent: Perfect! I've created 3 materials in ServiceTitan:

1. 1-inch 90-degree Elbow (EMT-100-90) - ST ID: 12345
2. 1-inch Tee (EMT-100-T) - ST ID: 12346
3. 1-inch Coupler (EMT-100-CPL) - ST ID: 12347

What else can I help you with?
```

### Example 2: n8n Workflow

```json
// n8n HTTP Request Node
POST http://localhost:3001/api/n8n/webhook

{
  "action": "create_material",
  "entity": "material",
  "data": {
    "categoryId": 123,
    "name": "1-inch 90-degree Elbow",
    "code": "EMT-100-90",
    "price": 5.99,
    "cost": 3.50,
    "unitOfMeasure": "Each",
    "manufacturer": "Topaz",
    "description": "1-inch EMT 90-degree elbow fitting"
  }
}

// Response
{
  "success": true,
  "material": {
    "id": "uuid",
    "stId": 12345,
    "name": "1-inch 90-degree Elbow",
    "categoryName": "Conduit"
  }
}
```

### Example 3: Manual Sync Trigger

```bash
curl -X POST http://localhost:3001/api/sync/pricebook/full \
  -H "Content-Type: application/json" \
  -d '{
    "resolveConflicts": "keep_st"
  }'

# Response
{
  "success": true,
  "syncLogId": "uuid",
  "status": "completed",
  "duration": 45000,
  "stats": {
    "fetched": 1250,
    "created": 15,
    "updated": 43,
    "deleted": 2,
    "skipped": 1190,
    "conflicts": 0,
    "errors": 0
  }
}
```

---

## PRISMA SCHEMA

```prisma
// /prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
  extensions = [vector, pg_trgm]
}

model PricebookCategory {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  stId            BigInt    @unique @map("st_id")
  tenantId        BigInt    @map("tenant_id")
  name            String    @db.VarChar(255)
  code            String?   @db.VarChar(100)
  parentId        BigInt?   @map("parent_id")
  displayOrder    Int       @default(0) @map("display_order")
  active          Boolean   @default(true)
  categoryType    String?   @map("category_type")
  
  stCreatedOn     DateTime? @map("st_created_on") @db.Timestamptz
  stModifiedOn    DateTime? @map("st_modified_on") @db.Timestamptz
  localCreatedAt  DateTime  @default(now()) @map("local_created_at") @db.Timestamptz
  localModifiedAt DateTime  @default(now()) @updatedAt @map("local_modified_at") @db.Timestamptz
  lastSyncedAt    DateTime? @map("last_synced_at") @db.Timestamptz
  syncStatus      String    @default("synced") @map("sync_status")
  
  hasConflict     Boolean   @default(false) @map("has_conflict")
  conflictData    Json?     @map("conflict_data")
  
  deletedAt       DateTime? @map("deleted_at") @db.Timestamptz
  deletedInSt     Boolean   @default(false) @map("deleted_in_st")
  
  materials       PricebookMaterial[]
  services        PricebookService[]
  
  @@map("pricebook_categories")
}

model PricebookMaterial {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  stId                BigInt    @unique @map("st_id")
  tenantId            BigInt    @map("tenant_id")
  categoryId          BigInt?   @map("category_id")
  categoryUuid        String?   @map("category_uuid") @db.Uuid
  
  code                String    @db.VarChar(100)
  name                String    @db.VarChar(500)
  description         String?   @db.Text
  manufacturer        String?   @db.VarChar(255)
  modelNumber         String?   @map("model_number")
  upc                 String?   @db.VarChar(50)
  
  cost                Decimal?  @db.Decimal(18, 4)
  price               Decimal?  @db.Decimal(18, 4)
  unitOfMeasure       String?   @map("unit_of_measure")
  
  active              Boolean   @default(true)
  
  stCreatedOn         DateTime? @map("st_created_on") @db.Timestamptz
  stModifiedOn        DateTime? @map("st_modified_on") @db.Timestamptz
  localCreatedAt      DateTime  @default(now()) @map("local_created_at") @db.Timestamptz
  localModifiedAt     DateTime  @default(now()) @updatedAt @map("local_modified_at") @db.Timestamptz
  lastSyncedAt        DateTime? @map("last_synced_at") @db.Timestamptz
  syncStatus          String    @default("synced") @map("sync_status")
  syncDirection       String?   @map("sync_direction")
  
  hasConflict         Boolean   @default(false) @map("has_conflict")
  conflictData        Json?     @map("conflict_data")
  
  deletedAt           DateTime? @map("deleted_at") @db.Timestamptz
  deletedInSt         Boolean   @default(false) @map("deleted_in_st")
  
  embedding           Unsupported("vector(1536)")?
  
  category            PricebookCategory? @relation(fields: [categoryUuid], references: [id])
  
  @@map("pricebook_materials")
  @@index([stId])
  @@index([categoryId])
  @@index([code])
}

model PricebookSyncLog {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  syncType            String    @map("sync_type")
  direction           String
  
  startedAt           DateTime  @default(now()) @map("started_at") @db.Timestamptz
  completedAt         DateTime? @map("completed_at") @db.Timestamptz
  durationSeconds     Int?      @map("duration_seconds")
  
  recordsFetched      Int       @default(0) @map("records_fetched")
  recordsCreated      Int       @default(0) @map("records_created")
  recordsUpdated      Int       @default(0) @map("records_updated")
  recordsDeleted      Int       @default(0) @map("records_deleted")
  recordsSkipped      Int       @default(0) @map("records_skipped")
  conflictsDetected   Int       @default(0) @map("conflicts_detected")
  errorsEncountered   Int       @default(0) @map("errors_encountered")
  
  status              String    @default("running")
  errorMessage        String?   @map("error_message") @db.Text
  
  triggeredBy         String    @map("triggered_by")
  config              Json?
  
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz
  
  @@map("pricebook_sync_log")
}
```

---

## TESTING

```typescript
// /src/sync/__tests__/pricebook-sync.engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { PricebookSyncEngine } from '../pricebook/pricebook-sync.engine';

describe('PricebookSyncEngine', () => {
  
  it('should sync categories from ST', async () => {
    const syncEngine = new PricebookSyncEngine(prisma, stClient, logger);
    
    const result = await syncEngine.sync({
      direction: 'from_st',
      entityTypes: ['categories'],
      fullSync: true
    });

    expect(result.status).toBe('completed');
    expect(result.stats.fetched).toBeGreaterThan(0);
  });

  it('should detect conflicts when both modified', async () => {
    // Setup: Modify both ST and local version
    
    const result = await syncEngine.sync({
      direction: 'from_st',
      fullSync: false
    });

    expect(result.stats.conflicts).toBeGreaterThan(0);
  });
});
```

---

## DEPLOYMENT CHECKLIST

- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] OpenAI API key set
- [ ] ServiceTitan credentials configured
- [ ] Prisma client generated
- [ ] All tests passing
- [ ] Health check endpoint responding
- [ ] Cron jobs scheduled
- [ ] Logging configured
- [ ] Error tracking enabled (Sentry)
- [ ] Database backups configured
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] Docker containers running
- [ ] Initial sync completed successfully
