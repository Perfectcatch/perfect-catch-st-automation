# PerfectCatch Salesforce Integration

## Deployment Guide

Syncs ServiceTitan customers to Salesforce Contacts and Accounts for sales visibility, pipeline management, and marketing automation.

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  ServiceTitan   │────▶│   PerfectCatch AI    │────▶│   Salesforce    │
│  (Operations)   │     │   (Orchestration)    │     │   (CRM/Sales)   │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                        │                           │
        │                        ▼                           │
        │                 ┌──────────────┐                   │
        │                 │    Redis     │                   │
        │                 │ (Queue/State)│                   │
        │                 └──────────────┘                   │
        │                                                    │
        └──────────── st_id (External ID) ──────────────────┘
```

---

## Prerequisites

- Node.js 18+
- Redis 6+
- Salesforce account (Developer, Enterprise, or Unlimited)
- Salesforce System Administrator access

---

## Step 1: Salesforce Custom Field Setup

### Contact Custom Fields

Create these fields in **Setup → Object Manager → Contact → Fields & Relationships → New**

| Field Label | API Name | Data Type | Length | Properties |
|-------------|----------|-----------|--------|------------|
| ServiceTitan Customer ID | `ServiceTitan_Customer_Id__c` | Text | 50 | **External ID ✓**, Unique ✓ |
| ServiceTitan Tenant ID | `ServiceTitan_Tenant_Id__c` | Number | 18,0 | |
| Active | `Active__c` | Checkbox | | Default: checked |
| Do Not Service | `Do_Not_Service__c` | Checkbox | | Default: unchecked |
| Total Jobs | `Total_Jobs__c` | Number | 8,0 | |
| Completed Jobs | `Completed_Jobs__c` | Number | 8,0 | |
| First Service Date | `First_Service_Date__c` | Date | | |
| Last Service Date | `Last_Service_Date__c` | Date | | |
| ServiceTitan Last Modified | `ServiceTitan_Last_Modified__c` | Date/Time | | |
| Last Sync DateTime | `Last_Sync_DateTime__c` | Date/Time | | |

### Account Custom Fields

Create these fields in **Setup → Object Manager → Account → Fields & Relationships → New**

| Field Label | API Name | Data Type | Length | Properties |
|-------------|----------|-----------|--------|------------|
| ServiceTitan Account ID | `ServiceTitan_Account_Id__c` | Text | 50 | **External ID ✓**, Unique ✓ |
| Account Balance | `Account_Balance__c` | Currency | 16,2 | |
| Lifetime Value | `Lifetime_Value__c` | Currency | 16,2 | |
| Customer Segment | `Customer_Segment__c` | Picklist | | See values below |

**Customer Segment Picklist Values:**
- VIP
- High Value
- Standard
- At Risk
- Churning

### Account Type Picklist (Standard Field)

Add these values to the standard **Type** picklist on Account:
- Residential
- Commercial

---

## Step 2: Create Salesforce Connected App

1. **Setup → App Manager → New Connected App**
2. Fill in:
   - Connected App Name: `PerfectCatch Integration`
   - API Name: `PerfectCatch_Integration`
   - Contact Email: your email
3. **Enable OAuth Settings:**
   - Callback URL: `https://your-domain.com/api/salesforce/callback`
   - Selected OAuth Scopes:
     - `Access the identity URL service (id, profile, email, address, phone)`
     - `Manage user data via APIs (api)`
     - `Perform requests at any time (refresh_token, offline_access)`
4. Save and wait 2-10 minutes
5. Note the **Consumer Key** and **Consumer Secret**

---

## Step 3: Field Mapping Reference

### ServiceTitan → Salesforce Contact

| ServiceTitan Field | Salesforce Field | Notes |
|--------------------|------------------|-------|
| `st_id` | `ServiceTitan_Customer_Id__c` | Format: `st_12345` |
| `tenant_id` | `ServiceTitan_Tenant_Id__c` | |
| `first_name` | `FirstName` | Standard |
| `last_name` | `LastName` | Standard (required) |
| `email` | `Email` | Standard |
| `phone` | `Phone` | Standard |
| `address_line1` + `address_line2` | `MailingStreet` | Combined |
| `city` | `MailingCity` | Standard |
| `state` | `MailingState` | Standard |
| `zip` / `postal_code` | `MailingPostalCode` | Standard |
| `country` | `MailingCountry` | Standard |
| `do_not_mail` | `HasOptedOutOfEmail` | Standard |
| `active` | `Active__c` | Custom |
| `do_not_service` | `Do_Not_Service__c` | Custom |
| `total_jobs` | `Total_Jobs__c` | Custom |
| `completed_jobs` | `Completed_Jobs__c` | Custom |
| `first_job_date` | `First_Service_Date__c` | Custom |
| `last_job_date` | `Last_Service_Date__c` | Custom |
| `st_modified_on` | `ServiceTitan_Last_Modified__c` | Custom |
| (sync time) | `Last_Sync_DateTime__c` | Custom |

### ServiceTitan → Salesforce Account

| ServiceTitan Field | Salesforce Field | Notes |
|--------------------|------------------|-------|
| `st_id` | `ServiceTitan_Account_Id__c` | Format: `st_12345` |
| `name` | `Name` | Standard (required) |
| `type` | `Type` | Standard picklist |
| `phone` | `Phone` | Standard |
| `address_line1` + `address_line2` | `BillingStreet` | Combined |
| `city` | `BillingCity` | Standard |
| `state` | `BillingState` | Standard |
| `zip` / `postal_code` | `BillingPostalCode` | Standard |
| `country` | `BillingCountry` | Standard |
| `balance` | `Account_Balance__c` | Custom |
| `lifetime_value` | `Lifetime_Value__c` | Custom |
| (calculated) | `Customer_Segment__c` | Custom - auto-calculated |

### Customer Segment Calculation

```
VIP:        lifetime_value >= $10,000 AND last_job < 180 days ago
High Value: lifetime_value >= $5,000
Churning:   last_job > 365 days ago
At Risk:    last_job > 180 days ago
Standard:   everyone else
```

---

## Step 4: Deploy the Integration

### Install Dependencies

```bash
cd salesforce-integration
npm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Salesforce Connected App
SALESFORCE_CLIENT_ID=your_consumer_key
SALESFORCE_CLIENT_SECRET=your_consumer_secret
SALESFORCE_REDIRECT_URI=http://localhost:3001/api/salesforce/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Session
SESSION_SECRET=generate-a-secure-random-string
```

### Start Services

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Development mode
npm run dev

# Production
npm run build
npm start
```

### Connect to Salesforce

Open in browser:
```
http://localhost:3001/api/salesforce/auth
```

This redirects to Salesforce login. After authentication, tokens are stored.

Verify:
```bash
curl http://localhost:3001/api/salesforce/status
```

---

## Step 5: Sync Customers

### Sync Single Customer

```bash
curl -X POST http://localhost:3001/api/salesforce/sync/customer \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "st_id": 12345,
      "tenant_id": 1001,
      "first_name": "John",
      "last_name": "Smith",
      "name": "John Smith",
      "email": "john.smith@example.com",
      "phone": "555-123-4567",
      "type": "Residential",
      "address_line1": "123 Pool Lane",
      "city": "Miami",
      "state": "FL",
      "zip": "33101",
      "active": true,
      "do_not_mail": false,
      "do_not_service": false,
      "balance": 150.00,
      "lifetime_value": 5200.00,
      "total_jobs": 12,
      "completed_jobs": 11,
      "first_job_date": "2022-03-15",
      "last_job_date": "2024-11-20"
    }
  }'
```

Response:
```json
{
  "success": true,
  "stId": 12345,
  "salesforceContactId": "003xx000004TmEqAAK",
  "salesforceAccountId": "001xx000003WYzZAAW",
  "created": true,
  "direction": "outbound",
  "duration": 485
}
```

### Batch Sync

```bash
curl -X POST http://localhost:3001/api/salesforce/sync/customers \
  -H "Content-Type: application/json" \
  -d '{
    "customers": [
      { "st_id": 1, "first_name": "Alice", "last_name": "Johnson", "email": "alice@example.com" },
      { "st_id": 2, "first_name": "Bob", "last_name": "Williams", "email": "bob@example.com" }
    ]
  }'
```

### Queue Async Sync

```bash
curl -X POST http://localhost:3001/api/salesforce/sync/queue \
  -H "Content-Type: application/json" \
  -d '{ "stId": 12345, "priority": "high" }'
```

---

## Step 6: Configure Webhooks

### ServiceTitan → Salesforce (Real-time Sync)

Configure webhooks in your system to POST to:
```
https://your-domain.com/webhooks/perfectcatch
```

Payload format:
```json
{
  "event": "customer.updated",
  "entityType": "customer",
  "entityId": 12345,
  "data": { /* full customer object */ }
}
```

---

## API Reference

### Authentication
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/salesforce/auth` | GET | Start OAuth flow |
| `/api/salesforce/callback` | GET | OAuth callback |
| `/api/salesforce/status` | GET | Connection status |
| `/api/salesforce/disconnect` | POST | Disconnect |

### Sync Operations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/salesforce/sync/customer` | POST | Sync single customer |
| `/api/salesforce/sync/customers` | POST | Batch sync |
| `/api/salesforce/sync/queue` | POST | Queue async sync |
| `/api/salesforce/sync/full` | POST | Full sync |

### Webhooks
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/perfectcatch` | POST | PerfectCatch events |
| `/webhooks/servicetitan` | POST | ServiceTitan direct |

---

## Docker Deployment

```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f salesforce-sync

# Scale workers
docker-compose up -d --scale sync-worker=3
```

---

## Troubleshooting

### "INVALID_FIELD" Error
- Verify custom field API names match exactly (case-sensitive)
- Check field-level security allows access
- Confirm External ID checkbox is enabled

### "Salesforce not connected"
- Re-authenticate: `http://localhost:3001/api/salesforce/auth`
- Check Redis is running: `redis-cli ping`

### Rate Limiting
- Salesforce limits: 15,000-100,000 API calls/day
- Check limits: `GET /api/salesforce/status`
- Use batch sync for bulk operations

### Sync Not Working
- Check webhook URL is publicly accessible
- Verify Redis queue: `redis-cli LLEN bull:customer-sync:wait`
- Review logs: `tail -f logs/combined.log`

---

## Next Steps

1. **Estimate Sync** - Sync estimates to Salesforce Opportunities
2. **Job Sync** - Sync completed jobs to Salesforce Events
3. **Campaigns** - Trigger Salesforce campaigns based on segments
4. **Reports** - Build Salesforce reports on customer analytics
