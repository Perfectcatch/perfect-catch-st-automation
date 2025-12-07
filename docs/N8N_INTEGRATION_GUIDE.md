# n8n Integration Guide

## Overview

The n8n integration enables workflow automation for your pricebook:

- **Receive webhooks** from n8n to create/update/query pricebook items
- **Send events** to n8n when pricebook changes occur
- **Subscribe** n8n workflows to specific events

## API Endpoints

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/n8n/webhook` | Main webhook for n8n workflows |
| POST | `/api/n8n/batch-create` | Batch create materials |

### Subscription Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/n8n/subscribe` | Subscribe to events |
| POST | `/api/n8n/unsubscribe` | Unsubscribe |
| GET | `/api/n8n/subscriptions` | List subscriptions |
| POST | `/api/n8n/test-webhook` | Test a webhook URL |
| GET | `/api/n8n/events` | List available events |
| POST | `/api/n8n/emit-event` | Manually emit event |

## Webhook Actions

### Create Material

```json
POST /api/n8n/webhook
{
  "action": "create",
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
```

**Response:**
```json
{
  "success": true,
  "material": {
    "id": "uuid",
    "stId": 12345,
    "name": "1-inch 90-degree Elbow",
    "code": "EMT-100-90"
  }
}
```

### Batch Create Materials

```json
POST /api/n8n/batch-create
{
  "entity": "materials",
  "categoryId": 123,
  "items": [
    { "name": "1-inch 90-degree Elbow", "code": "EMT-100-90", "price": 5.99 },
    { "name": "1-inch Tee", "code": "EMT-100-T", "price": 6.99 },
    { "name": "1-inch Coupler", "code": "EMT-100-CPL", "price": 4.99 }
  ]
}
```

### Update Material

```json
POST /api/n8n/webhook
{
  "action": "update",
  "entity": "material",
  "data": {
    "stId": 12345,
    "price": 6.99,
    "cost": 4.00
  }
}
```

### Query Materials

```json
POST /api/n8n/webhook
{
  "action": "query",
  "entity": "materials",
  "data": {
    "categoryId": 123,
    "active": true,
    "limit": 50
  }
}
```

### Create Service

```json
POST /api/n8n/webhook
{
  "action": "create",
  "entity": "service",
  "data": {
    "categoryId": 456,
    "name": "Panel Upgrade",
    "code": "SVC-PANEL-UPG",
    "price": 2500.00,
    "description": "200A panel upgrade service"
  }
}
```

### Search Pricebook

```json
POST /api/n8n/webhook
{
  "action": "search",
  "entity": "pricebook",
  "data": {
    "query": "EMT",
    "entityTypes": ["materials", "services"],
    "limit": 20
  }
}
```

### Get Sync Status

```json
POST /api/n8n/webhook
{
  "action": "get_sync",
  "entity": "status"
}
```

## Event Subscriptions

### Subscribe to Events

```bash
curl -X POST http://localhost:3001/api/n8n/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://your-n8n-instance.com/webhook/abc123",
    "events": ["material_created", "material_updated", "sync_completed"],
    "name": "My n8n Workflow",
    "secretKey": "optional-secret-for-verification"
  }'
```

### Available Events

| Event | Description |
|-------|-------------|
| `material_created` | New material created |
| `material_updated` | Material updated |
| `material_deleted` | Material deleted/deactivated |
| `service_created` | New service created |
| `service_updated` | Service updated |
| `service_deleted` | Service deleted |
| `category_created` | New category created |
| `sync_started` | Sync operation started |
| `sync_completed` | Sync operation completed |
| `sync_failed` | Sync operation failed |
| `conflict_detected` | Sync conflict detected |
| `conflict_resolved` | Conflict resolved |

### Event Payload Format

```json
{
  "event": "material_created",
  "timestamp": "2025-12-06T10:30:00Z",
  "data": {
    "id": "uuid",
    "stId": "12345",
    "name": "1-inch 90-degree Elbow",
    "code": "EMT-100-90",
    "price": 5.99,
    "categoryId": "123"
  }
}
```

### Webhook Headers

Events sent to your webhook include these headers:

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | Event type |
| `X-Webhook-Timestamp` | ISO timestamp |
| `X-Webhook-Secret` | Your secret key (if configured) |

## n8n Workflow Examples

### Example 1: Create Material from Google Sheet

```
[Google Sheets Trigger] → [HTTP Request to /api/n8n/webhook] → [Slack Notification]
```

n8n HTTP Request node configuration:
- **Method**: POST
- **URL**: `http://your-server:3001/api/n8n/webhook`
- **Body**:
```json
{
  "action": "create",
  "entity": "material",
  "data": {
    "categoryId": {{ $json.categoryId }},
    "name": "{{ $json.name }}",
    "code": "{{ $json.code }}",
    "price": {{ $json.price }},
    "cost": {{ $json.cost }}
  }
}
```

### Example 2: Sync Notification Workflow

```
[Webhook Trigger] → [IF sync_completed] → [Email/Slack Notification]
```

1. Create webhook in n8n
2. Subscribe to events:
```bash
curl -X POST http://localhost:3001/api/n8n/subscribe \
  -d '{
    "webhookUrl": "https://n8n.example.com/webhook/sync-notify",
    "events": ["sync_completed", "sync_failed", "conflict_detected"]
  }'
```

### Example 3: Price Update Automation

```
[Schedule Trigger] → [HTTP Request: Query Materials] → [Loop] → [Update Prices] → [Log Results]
```

## Testing

### Test Webhook URL

```bash
curl -X POST http://localhost:3001/api/n8n/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://your-n8n-instance.com/webhook/test"
  }'
```

### Manually Emit Event

```bash
curl -X POST http://localhost:3001/api/n8n/emit-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "material_created",
    "data": {
      "id": "test-123",
      "name": "Test Material"
    }
  }'
```

## Error Handling

### Webhook Retries

- Failed webhooks are retried 3 times with exponential backoff
- After 10 consecutive failures, the subscription is disabled
- Check subscription status via `/api/n8n/subscriptions`

### Error Response Format

```json
{
  "success": false,
  "error": "Missing required fields: name, categoryId"
}
```

## Security

### Secret Key Verification

When subscribing, provide a `secretKey`:

```json
{
  "webhookUrl": "...",
  "events": [...],
  "secretKey": "your-secret-key"
}
```

The secret is sent in the `X-Webhook-Secret` header. Verify it in your n8n workflow.

### Custom Headers

Add custom headers to webhook requests:

```json
{
  "webhookUrl": "...",
  "events": [...],
  "headers": {
    "Authorization": "Bearer your-token",
    "X-Custom-Header": "value"
  }
}
```

## Best Practices

1. **Use specific events** - Subscribe only to events you need
2. **Implement idempotency** - Handle duplicate events gracefully
3. **Verify webhooks** - Use secret keys for security
4. **Handle failures** - Implement retry logic in n8n
5. **Monitor subscriptions** - Check for disabled subscriptions
