# Pricebook Chat Agent Guide

## Overview

The Pricebook Chat Agent provides a conversational AI interface for managing your ServiceTitan pricebook. It uses OpenAI GPT-4 for natural language understanding and supports:

- **Querying** materials, services, equipment by category
- **Creating** new pricebook items via natural language
- **Updating** existing items
- **Searching** across the entire pricebook
- **Interactive validation** - asks for missing fields

## Quick Start

### Prerequisites

- OpenAI API key (`OPENAI_API_KEY`)
- Database configured (`DATABASE_URL`)
- Pricebook synced from ServiceTitan

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/message` | Send a message |
| GET | `/api/chat/history/:sessionId` | Get conversation history |
| GET | `/api/chat/session/:sessionId` | Get session context |
| DELETE | `/api/chat/session/:sessionId` | Clear session |
| POST | `/api/chat/quick-query` | Stateless query |
| GET | `/api/chat/suggestions` | Get suggested queries |

## Usage Examples

### Basic Query

```bash
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "message": "Show me conduit materials"
  }'
```

**Response:**
```json
{
  "success": true,
  "sessionId": "user-123",
  "message": "Found **45** materials in **Conduit**:\n\n1. **1/2\" EMT Conduit** (EMT-050) - $2.45\n2. **3/4\" EMT Conduit** (EMT-075) - $3.15\n...",
  "data": {
    "category": { "id": "...", "name": "Conduit" },
    "materials": [...],
    "totalCount": 45
  },
  "suggestions": ["Create material in Conduit", "Show more", "Search materials"]
}
```

### Create Materials

```bash
# Step 1: User wants to create materials
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "message": "Create 1-inch 90s, tees, and couplers"
  }'
```

**Response (asking for missing fields):**
```json
{
  "success": true,
  "message": "Great! I'll create **3** material(s) in **Conduit**:\n\n1. 1-inch 90-degree Elbow\n2. 1-inch Tee\n3. 1-inch Coupler\n\nTo complete this, I need:\n• **Price** (e.g., \"$45.99\")\n• **Cost** (your supplier cost)",
  "context": {
    "hasPendingAction": true
  }
}
```

```bash
# Step 2: User provides missing fields
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "message": "Price is $5.99, cost is $3.50"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "✅ Created 3 material(s):\n\n1. **1-inch 90-degree Elbow** (1-INCH-90-DEGREE) - ST ID: 12345\n2. **1-inch Tee** (1-INCH-TEE) - ST ID: 12346\n3. **1-inch Coupler** (1-INCH-COUPLER) - ST ID: 12347\n\nWhat else can I help you with?",
  "data": {
    "created": [...]
  }
}
```

### Search Pricebook

```bash
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "message": "Search for EMT"
  }'
```

### Get Help

```bash
curl -X POST http://localhost:3001/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "user-123",
    "message": "help"
  }'
```

## Supported Intents

| Intent | Example Phrases |
|--------|-----------------|
| Query Materials | "Show me conduit materials", "List wire items" |
| Query Services | "Show services", "List electrical services" |
| Query Equipment | "Show equipment", "List HVAC equipment" |
| Query Categories | "Show categories", "List all categories" |
| Create Material | "Create 1-inch 90s", "Add new material" |
| Create Service | "Create a service called Panel Upgrade" |
| Update Material | "Update the price of EMT to $5.99" |
| Search | "Search for EMT", "Find copper fittings" |
| Help | "Help", "What can you do?" |

## Session Management

### Session Context

The chat agent maintains context per session:

- **lastCategory**: Remembers the last viewed category
- **pendingAction**: Tracks incomplete operations (waiting for fields)
- **history**: Conversation history (last 20 messages)

### Session Expiry

Sessions expire after 24 hours of inactivity.

### Clear Session

```bash
curl -X DELETE http://localhost:3001/api/chat/session/user-123
```

### Cancel Pending Action

```bash
curl -X POST http://localhost:3001/api/chat/session/user-123/cancel
```

## Conversation Flow

```
User: "Show me conduit materials"
  ↓
Agent: Lists materials, remembers "Conduit" category
  ↓
User: "Create 1-inch 90s and tees"
  ↓
Agent: Uses remembered category, asks for price/cost
  ↓
User: "Price is $5.99, cost is $3.50"
  ↓
Agent: Creates materials in ServiceTitan, confirms
```

## Error Handling

The agent handles errors gracefully:

- **Category not found**: Suggests listing categories
- **Missing fields**: Asks for required information
- **API errors**: Reports the issue and suggests retry
- **Unknown intent**: Provides help suggestions

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 | Yes |
| `DATABASE_URL` | PostgreSQL connection | Yes |

### Customization

The chat agent components can be customized:

- **IntentClassifier**: Add new intents or modify classification
- **EntityExtractor**: Add new extraction patterns
- **ValidationHandler**: Modify required fields
- **ContextManager**: Adjust session expiry or storage

## Programmatic Usage

```javascript
import { PricebookChatAgent } from './src/chat/index.js';
import { getPrismaClient } from './src/db/prisma.js';
import { stRequest } from './src/services/stClient.js';

const prisma = getPrismaClient();
const stClient = { stRequest };
const chatAgent = new PricebookChatAgent(prisma, stClient, process.env.OPENAI_API_KEY);

// Process a message
const response = await chatAgent.processMessage('session-123', 'Show me conduit materials');
console.log(response.message);

// Access context
const context = await chatAgent.contextManager.getContext('session-123');
console.log('Last category:', context.lastCategory?.name);
```

## Best Practices

1. **Use consistent session IDs** for multi-turn conversations
2. **Handle pending actions** - check `context.hasPendingAction`
3. **Provide suggestions** to guide users
4. **Clear sessions** when starting fresh conversations
