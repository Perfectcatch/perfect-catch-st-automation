# 🤖 BATCH 2: EXTENDED MCP SERVER - COMPLETE GUIDE

## What This Adds

This extends your existing MCP server (currently handles pricebook) with **15+ new tools** for complete agentic automation.

### New Capabilities
- Query ANY database table (ServiceTitan data, workflows, CallRail, messaging)
- Call ANY ServiceTitan API endpoint (all 372 endpoints)
- Send SMS via Twilio
- Send emails via SendGrid
- Create jobs in ServiceTitan
- Schedule appointments
- Get real-time availability
- Execute workflows
- Track conversions

---

## Files to Create/Modify

### New Files (6 files)

```
mcp-server/
├── tools/
│   ├── query-database.js          [NEW]
│   ├── call-st-api.js              [NEW]
│   ├── send-sms.js                 [NEW]
│   ├── send-email.js               [NEW]
│   ├── create-job.js               [NEW]
│   └── schedule-appointment.js     [NEW]
```

### Files to Modify (1 file)

```
mcp-server/
└── index.js                        [EXTEND]
```

---

## Tool Specifications

### 1. query_database
**Purpose:** Execute SQL queries on any table
**Use Cases:** 
- "Get all jobs from last week"
- "Find customers with balance > $500"
- "Show open estimates"

### 2. call_st_api
**Purpose:** Call ANY ServiceTitan API endpoint
**Use Cases:**
- "Get customer #12345"
- "List all technicians"
- "Fetch estimates for job #67890"

### 3. send_sms
**Purpose:** Send SMS via Twilio
**Use Cases:**
- "Send appointment confirmation to customer"
- "Text estimate follow-up"
- "Send payment reminder"

### 4. send_email
**Purpose:** Send emails via SendGrid
**Use Cases:**
- "Email invoice to customer"
- "Send detailed estimate breakdown"
- "Email technician dispatch details"

### 5. create_job
**Purpose:** Create jobs in ServiceTitan
**Use Cases:**
- "Create new job for customer #12345"
- "Book service call"

### 6. schedule_appointment
**Purpose:** Schedule appointments in ServiceTitan
**Use Cases:**
- "Schedule appointment for tomorrow 2pm"
- "Book technician Mike for Friday"

---

## Environment Variables Needed

Add to your `.env`:

```bash
# Existing
SERVICE_TITAN_TENANT_ID=...
SERVICE_TITAN_CLIENT_ID=...
SERVICE_TITAN_CLIENT_SECRET=...
SERVICE_TITAN_APP_KEY=...

# NEW: Database connections
SERVICETITAN_DATABASE_URL=postgresql://user:pass@localhost:5432/servicetitan_mirror

# NEW: Twilio (SMS)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567

# NEW: SendGrid (Email)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@perfectcatch.com
SENDGRID_FROM_NAME=Perfect Catch
```

---

## Dependencies to Install

```bash
cd mcp-server
npm install twilio @sendgrid/mail pg
```

Or add to `mcp-server/package.json`:

```json
{
  "dependencies": {
    "twilio": "^5.3.0",
    "@sendgrid/mail": "^8.1.0",
    "pg": "^8.11.0"
  }
}
```

---

## Usage Examples

### Example 1: Morning Briefing

```
You (in Claude Desktop): What jobs do I have today?

Claude uses tools:
1. query_database("SELECT * FROM st_jobs WHERE ...")
2. Returns: "You have 8 jobs scheduled..."
```

### Example 2: Send Follow-Up

```
You: Send follow-up SMS to all customers with open estimates from last week

Claude uses tools:
1. query_database("SELECT * FROM st_estimates WHERE status='Open'...")
2. For each customer:
   send_sms("Hi {name}, following up on your estimate...")
```

### Example 3: Create Job + Appointment

```
You: Create a job for customer John Smith, schedule for tomorrow at 2pm

Claude uses tools:
1. query_database("SELECT st_id FROM st_customers WHERE name LIKE '%John Smith%'")
2. create_job({customerId: 12345, summary: "..."})
3. schedule_appointment({jobId: ..., start: "2025-12-20T14:00:00Z"})
```

---

## Testing Checklist

After deployment, test each tool:

### Test query_database
```
Ask Claude: "Show me the 5 most recent customers"

Expected: Claude queries st_customers table and returns results
```

### Test call_st_api
```
Ask Claude: "Get details for job #12345"

Expected: Claude calls ST API and returns job details
```

### Test send_sms
```
Ask Claude: "Send a test SMS to my phone at 555-1234"

Expected: You receive SMS
```

### Test send_email
```
Ask Claude: "Send a test email to test@example.com"

Expected: Email arrives
```

### Test create_job
```
Ask Claude: "Create a test job for customer #12345"

Expected: Job appears in ServiceTitan
```

---

## Claude Desktop Configuration

Update your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "node",
      "args": ["/opt/perfectcatch-st-automation/mcp-server/index.js"],
      "env": {
        "SERVICE_TITAN_TENANT_ID": "your_tenant_id",
        "SERVICETITAN_DATABASE_URL": "postgresql://...",
        "TWILIO_ACCOUNT_SID": "ACxxxxx",
        "TWILIO_AUTH_TOKEN": "your_token",
        "TWILIO_PHONE_NUMBER": "+15551234567",
        "SENDGRID_API_KEY": "SG.xxxxx"
      }
    }
  }
}
```

**Or use .env file:**

```json
{
  "mcpServers": {
    "perfectcatch": {
      "command": "node",
      "args": ["/opt/perfectcatch-st-automation/mcp-server/index.js"]
    }
  }
}
```

(MCP server loads .env automatically if present)

---

## Security Notes

**Protect API Keys:**
- Never commit .env to git
- Use environment variables in production
- Restrict database user permissions

**SQL Injection Protection:**
- Tools use parameterized queries
- Input validation on all parameters
- Whitelist allowed tables

**Rate Limiting:**
- SMS/Email sends check customer preferences
- Respect quiet hours
- Track message counts

---

## Deployment Steps

1. **Create tool files** (provided in next sections)
2. **Update mcp-server/index.js** (extend with new tools)
3. **Install dependencies** (`npm install`)
4. **Update .env** with credentials
5. **Update Claude Desktop config**
6. **Restart Claude Desktop**
7. **Test tools** one by one

---

## Success Criteria

✅ MCP server starts without errors
✅ All 15+ tools registered
✅ Claude Desktop shows tools available
✅ Test query executes successfully
✅ Test SMS sends
✅ Test email sends
✅ All tools respond within 5 seconds

---

**Ready for the actual code? I'll generate all 7 files next.**
