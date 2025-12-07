# Pricebook Sync Engine

## Overview

The Pricebook Sync Engine provides bi-directional synchronization between ServiceTitan's pricebook and a local PostgreSQL database. It supports:

- **Full Sync**: Complete replication of all pricebook data
- **Incremental Sync**: Only sync changes since last sync
- **Conflict Detection**: Identify when both ST and local data have changed
- **Conflict Resolution**: Manual or automatic resolution strategies
- **Scheduled Syncs**: Automated sync via cron jobs
- **Audit Trail**: Complete history of all changes

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    PRICEBOOK SYNC ENGINE                         │
└──────────────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │   Fetchers   │  │  Comparators │  │   Appliers   │
        │              │  │              │  │              │
        │  • Categories│  │  • Detect    │  │  • Create    │
        │  • Materials │  │    changes   │  │  • Update    │
        │  • Services  │  │  • Find      │  │  • Delete    │
        │  • Equipment │  │    conflicts │  │  • Audit     │
        └──────────────┘  └──────────────┘  └──────────────┘
                │                │                │
                └────────────────┼────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │   PostgreSQL     │
                        │   + pgvector     │
                        │                  │
                        │  • Categories    │
                        │  • Materials     │
                        │  • Services      │
                        │  • Equipment     │
                        │  • Sync Logs     │
                        │  • Conflicts     │
                        │  • Changes       │
                        └──────────────────┘
```

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 16+ with pgvector extension
- Redis (optional, for session storage)
- ServiceTitan API credentials

### 2. Database Setup

```bash
# Start PostgreSQL with pgvector using Docker
docker run -d \
  --name pricebook-db \
  -e POSTGRES_DB=pricebook \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# Or use Docker Compose
docker-compose -f docker-compose.pricebook.yml up -d db
```

### 3. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env and set:
DATABASE_URL=postgresql://postgres:password@localhost:5432/pricebook
OPENAI_API_KEY=sk-your-key  # For chat agent
```

### 4. Install Dependencies & Generate Prisma Client

```bash
npm install
npm run db:generate
```

### 5. Run Database Migrations

```bash
# Apply Prisma migrations
npm run db:migrate

# Or apply SQL migration directly
psql $DATABASE_URL -f src/db/migrations/001_pricebook_schema.sql
```

### 6. Start the Server

```bash
npm run dev
```

## API Endpoints

### Sync Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/pricebook/full` | Trigger full sync |
| POST | `/api/sync/pricebook/incremental` | Trigger incremental sync |
| GET | `/api/sync/pricebook/status` | Get sync status |
| GET | `/api/sync/pricebook/logs` | Get sync history |
| GET | `/api/sync/pricebook/logs/:id` | Get specific sync log |

### Conflict Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/pricebook/conflicts` | List unresolved conflicts |
| POST | `/api/sync/pricebook/resolve-conflict/:id` | Resolve a conflict |

### Scheduler Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/pricebook/scheduler/start` | Start scheduler |
| POST | `/api/sync/pricebook/scheduler/stop` | Stop scheduler |

## Usage Examples

### Trigger Full Sync

```bash
curl -X POST http://localhost:3001/api/sync/pricebook/full \
  -H "Content-Type: application/json" \
  -d '{
    "resolveConflicts": "keep_st",
    "entityTypes": ["categories", "materials"]
  }'
```

**Response:**
```json
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

### Get Sync Status

```bash
curl http://localhost:3001/api/sync/pricebook/status
```

**Response:**
```json
{
  "success": true,
  "lastSync": {
    "id": "uuid",
    "syncType": "full",
    "status": "completed",
    "startedAt": "2025-12-06T02:00:00Z",
    "completedAt": "2025-12-06T02:00:45Z",
    "recordsFetched": 1250
  },
  "stats": [
    {"entity_type": "categories", "total_count": 50, "synced_count": 50},
    {"entity_type": "materials", "total_count": 1200, "synced_count": 1200}
  ],
  "unresolvedConflicts": 0,
  "scheduler": {
    "isRunning": true,
    "schedules": {
      "fullSync": "0 2 * * *",
      "incrementalSync": "0 */6 * * *"
    }
  }
}
```

### Resolve Conflict

```bash
curl -X POST http://localhost:3001/api/sync/pricebook/resolve-conflict/conflict-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "strategy": "keep_st",
    "resolvedBy": "admin@example.com"
  }'
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SYNC_FULL_CRON` | Full sync schedule (cron) | `0 2 * * *` (2 AM daily) |
| `SYNC_INCREMENTAL_CRON` | Incremental sync schedule | `0 */6 * * *` (every 6 hours) |
| `SYNC_SCHEDULER_ENABLED` | Enable auto-scheduling | `true` |

### Sync Options

```javascript
{
  direction: 'from_st' | 'to_st' | 'bidirectional',
  entityTypes: ['categories', 'materials', 'services', 'equipment'],
  fullSync: true | false,
  resolveConflicts: 'keep_st' | 'keep_local' | 'manual',
  dryRun: true | false
}
```

## Database Schema

### Core Tables

- **pricebook_categories**: Category hierarchy
- **pricebook_materials**: Material items with pricing
- **pricebook_services**: Service items
- **pricebook_equipment**: Equipment items

### Sync Tables

- **pricebook_sync_log**: Sync operation history
- **pricebook_sync_conflicts**: Conflict records
- **pricebook_changes**: Audit trail

### Key Fields

Each pricebook table includes:

| Field | Description |
|-------|-------------|
| `id` | Local UUID |
| `st_id` | ServiceTitan ID |
| `st_modified_on` | ST modification timestamp |
| `local_modified_at` | Local modification timestamp |
| `last_synced_at` | Last sync timestamp |
| `sync_status` | synced, pending_sync, conflict |
| `has_conflict` | Conflict flag |
| `deleted_at` | Soft delete timestamp |

## Conflict Resolution

### Conflict Types

1. **both_modified**: Both ST and local modified since last sync
2. **local_deleted_st_modified**: Deleted locally but modified in ST
3. **st_deleted_local_modified**: Deleted in ST but modified locally

### Resolution Strategies

- **keep_st**: Accept ServiceTitan version
- **keep_local**: Keep local version
- **manual**: Flag for manual review

### Conflict Detection Logic

```javascript
if (stModifiedOn > lastSyncedAt && localModifiedAt > lastSyncedAt) {
  // CONFLICT: Both versions modified since last sync
}
```

## Programmatic Usage

```javascript
import { PricebookSyncEngine, SyncScheduler } from './src/sync/pricebook/index.js';
import { getPrismaClient } from './src/db/prisma.js';
import { stRequest } from './src/services/stClient.js';

// Initialize
const prisma = getPrismaClient();
const stClient = { stRequest };
const syncEngine = new PricebookSyncEngine(prisma, stClient);

// Run sync
const result = await syncEngine.sync({
  direction: 'from_st',
  fullSync: true,
  resolveConflicts: 'manual'
});

console.log(`Synced ${result.stats.created} new, ${result.stats.updated} updated`);

// Get conflicts
const conflicts = await syncEngine.getConflicts();

// Resolve conflict
await syncEngine.resolveConflict(conflictId, 'keep_st', 'admin');
```

## Troubleshooting

### Common Issues

**Database connection failed**
```
Error: Database connection failed - Pricebook sync engine disabled
```
- Check `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Verify pgvector extension is installed

**Sync taking too long**
- Use incremental sync instead of full sync
- Sync specific entity types only
- Check ServiceTitan API rate limits

**Conflicts not resolving**
- Verify conflict ID exists
- Check resolution strategy is valid
- Review conflict data for merge issues

### Logs

Check logs for detailed sync information:

```bash
# View sync logs
curl http://localhost:3001/api/sync/pricebook/logs?limit=10

# View specific sync details
curl http://localhost:3001/api/sync/pricebook/logs/{syncLogId}
```

## Next Steps

After Part 1 (Database & Sync Engine) is complete:

1. **Part 2**: Conversational AI Agent (Chat interface)
2. **Part 3**: n8n Webhook Integration
3. **Part 4**: Admin UI for conflict resolution
