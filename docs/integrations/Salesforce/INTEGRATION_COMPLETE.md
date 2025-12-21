# Salesforce Integration - Deployment Complete

## Summary

The Salesforce integration has been deployed and integrated into the PerfectCatch codebase. This enables syncing ServiceTitan customers to Salesforce Contacts and Accounts.

## Files Created/Modified

### New Files
- `src/integrations/salesforce/index.js` - JavaScript bridge for Salesforce API
- `src/routes/salesforce.routes.js` - REST API endpoints
- `src/db/redis.js` - Redis connection for token storage
- `scripts/setup-salesforce.js` - Setup verification script

### Modified Files
- `.env.example` - Added Salesforce configuration variables
- `src/app.js` - Mounted Salesforce routes
- `package.json` - Added npm scripts

### Extracted from ZIP (TypeScript reference)
- `src/integrations/salesforce/src/` - Full TypeScript implementation
- `src/integrations/salesforce/package.json` - TypeScript dependencies
- `src/integrations/salesforce/Dockerfile` - Container deployment

## Configuration

Add to your `.env` file:

```env
# Salesforce Connected App
SALESFORCE_CLIENT_ID=your_connected_app_consumer_key
SALESFORCE_CLIENT_SECRET=your_connected_app_consumer_secret
SALESFORCE_REDIRECT_URI=http://localhost:3001/api/salesforce/callback
SALESFORCE_LOGIN_URL=https://login.salesforce.com

# Sync Controls
SALESFORCE_SYNC_ENABLED=true
SALESFORCE_AUTO_SYNC_CUSTOMERS=false
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/salesforce/auth` | GET | Start OAuth flow |
| `/api/salesforce/callback` | GET | OAuth callback |
| `/api/salesforce/status` | GET | Connection status |
| `/api/salesforce/config` | GET | View configuration |
| `/api/salesforce/disconnect` | POST | Disconnect |
| `/api/salesforce/sync/customer` | POST | Sync single customer |
| `/api/salesforce/sync/customers` | POST | Batch sync |
| `/api/salesforce/query` | GET | SOQL query |

## NPM Scripts

```bash
npm run salesforce:setup   # Verify configuration
npm run salesforce:status  # Check connection status
npm run salesforce:config  # View configuration
```

## Quick Start

1. **Add credentials to `.env`** (see Configuration above)

2. **Ensure Redis is running:**
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

3. **Verify setup:**
   ```bash
   npm run salesforce:setup
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

5. **Connect to Salesforce:**
   Open in browser: http://localhost:3001/api/salesforce/auth

6. **Verify connection:**
   ```bash
   curl http://localhost:3001/api/salesforce/status
   ```

## Salesforce Setup Required

Before syncing, create these custom fields in Salesforce:

### Contact Custom Fields
- `ServiceTitan_Customer_Id__c` (Text, External ID, Unique)
- `ServiceTitan_Tenant_Id__c` (Number)
- `Active__c` (Checkbox)
- `Do_Not_Service__c` (Checkbox)
- `Total_Jobs__c` (Number)
- `Completed_Jobs__c` (Number)
- `First_Service_Date__c` (Date)
- `Last_Service_Date__c` (Date)
- `ServiceTitan_Last_Modified__c` (DateTime)
- `Last_Sync_DateTime__c` (DateTime)

### Account Custom Fields
- `ServiceTitan_Account_Id__c` (Text, External ID, Unique)
- `Account_Balance__c` (Currency)
- `Lifetime_Value__c` (Currency)
- `Customer_Segment__c` (Picklist: VIP, High Value, Standard, At Risk, Churning)

See `SALESFORCE_DEPLOYMENT_GUIDE.md` for detailed field setup instructions.

## Example: Sync a Customer

```bash
curl -X POST http://localhost:3001/api/salesforce/sync/customer \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {
      "st_id": 12345,
      "first_name": "John",
      "last_name": "Smith",
      "email": "john@example.com",
      "phone": "555-123-4567",
      "city": "Miami",
      "state": "FL",
      "lifetime_value": 5200
    }
  }'
```

## Customer Segmentation

Customers are automatically segmented based on:

| Segment | Criteria |
|---------|----------|
| VIP | lifetime_value ≥ $10,000 AND last job < 180 days |
| High Value | lifetime_value ≥ $5,000 |
| Churning | last job > 365 days |
| At Risk | last job > 180 days |
| Standard | everyone else |

## Architecture

```
ServiceTitan → PerfectCatch DB → Salesforce Integration → Salesforce CRM
                                        ↓
                                      Redis
                                  (Token Storage)
```

## Security Notes

- OAuth tokens are stored in Redis with 30-day expiry
- Tokens auto-refresh on 401 responses
- CSRF protection via state parameter in OAuth flow
- Credentials should never be committed to git

---

*Deployed: December 20, 2024*
