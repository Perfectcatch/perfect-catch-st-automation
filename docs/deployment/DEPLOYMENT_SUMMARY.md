# Perfect Catch ST Automation v3.0 - Deployment Summary

## Deployment Date
Generated: December 15, 2025

## What Was Deployed

### Phase 1: Database Migrations ✅

**4 SQL migration files** copied to `src/db/migrations/`:

| File | Tables | Views | Functions | Description |
|------|--------|-------|-----------|-------------|
| `002_servicetitan_complete.sql` | 15 | 3 | 0 | Complete ST data mirror |
| `003_workflow_engine.sql` | 4 | 3 | 4 | Event-driven workflows |
| `004_callrail_tracking.sql` | 2 | 4 | 3 | Call conversion tracking |
| `005_messaging_system.sql` | 2 | 4 | 4 | SMS/Email logging |

**Totals:** 23 tables, 14 views, 11+ functions

### Phase 2: MCP Server Extension ✅

**6 new tool files** created in `mcp-server/tools/`:

| File | Tools | Description |
|------|-------|-------------|
| `query-database.js` | 3 | SQL query execution, table listing, connection test |
| `call-st-api.js` | 1 | ServiceTitan API wrapper (all 372 endpoints) |
| `send-sms.js` | 2 | Twilio SMS sending, status checking |
| `send-email.js` | 2 | SendGrid email sending, bulk email |
| `create-job.js` | 3 | Job creation, job types, business units |
| `schedule-appointment.js` | 5 | Appointment scheduling, availability, technicians |

**Total new MCP tools:** 16

### Phase 3: Configuration Updates ✅

**Updated files:**
- `.env.example` - Added 10 new environment variables
- `mcp-server/package.json` - Added 3 new dependencies, bumped to v2.0.0

**New dependencies:**
- `pg@^8.11.0` - PostgreSQL client
- `twilio@^5.3.0` - SMS sending
- `@sendgrid/mail@^8.1.0` - Email sending

---

## Quick Start Commands

### 1. Install Dependencies
```bash
cd mcp-server
npm install
```

### 2. Run Database Migrations
```bash
# Option A: Use the migration script
./scripts/run-migrations.sh

# Option B: Run manually
psql -d servicetitan_mirror < src/db/migrations/002_servicetitan_complete.sql
psql -d servicetitan_mirror < src/db/migrations/003_workflow_engine.sql
psql -d servicetitan_mirror < src/db/migrations/004_callrail_tracking.sql
psql -d servicetitan_mirror < src/db/migrations/005_messaging_system.sql
```

### 3. Configure Environment
```bash
# Copy example and edit
cp .env.example .env

# Required new variables:
SERVICETITAN_DATABASE_URL=postgresql://user:pass@localhost:5432/servicetitan_mirror
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15551234567
SENDGRID_API_KEY=SG.xxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourcompany.com
```

### 4. Start MCP Server
```bash
cd mcp-server
npm start
```

### 5. Test Tools
```bash
# Test database connection
node -e "import('./tools/query-database.js').then(m => m.testConnection().then(console.log))"
```

---

## Verification Checklist

### Database
- [ ] Database `servicetitan_mirror` created
- [ ] All 4 migrations executed without errors
- [ ] 23+ tables exist (`\dt` in psql)
- [ ] 14+ views exist (`\dv` in psql)
- [ ] 2 workflow definitions inserted
- [ ] 5 messaging templates inserted

### MCP Server
- [ ] `npm install` completed in mcp-server/
- [ ] All 6 tool files exist in `mcp-server/tools/`
- [ ] `mcp-server/index.js` updated with new tools
- [ ] Server starts without errors

### Configuration
- [ ] `.env` file created with all required variables
- [ ] Database URL configured correctly
- [ ] Twilio credentials configured (if using SMS)
- [ ] SendGrid credentials configured (if using email)

---

## New Tool Reference

### Database Tools
| Tool | Description |
|------|-------------|
| `query_database` | Execute read-only SQL queries |
| `list_database_tables` | List available tables |
| `test_database_connection` | Test DB connectivity |

### ServiceTitan API
| Tool | Description |
|------|-------------|
| `call_st_api` | Call any ST API endpoint |

### Messaging Tools
| Tool | Description |
|------|-------------|
| `send_sms` | Send SMS via Twilio |
| `get_sms_status` | Check SMS delivery status |
| `send_email` | Send email via SendGrid |
| `send_bulk_email` | Send to multiple recipients |

### Job Management
| Tool | Description |
|------|-------------|
| `create_job` | Create job in ServiceTitan |
| `get_job_types` | List available job types |
| `get_business_units` | List business units |

### Appointment Scheduling
| Tool | Description |
|------|-------------|
| `schedule_appointment` | Schedule new appointment |
| `get_availability` | Check available slots |
| `get_appointments` | List appointments |
| `reschedule_appointment` | Change appointment time |
| `get_technicians` | List available technicians |

---

## Example Usage (Claude Desktop)

```
You: What jobs do I have today?
Claude: [uses query_database] You have 8 jobs scheduled...

You: Send follow-up SMS to customers with open estimates
Claude: [uses query_database + send_sms] Sent messages to 12 customers

You: Create a job for customer John Smith
Claude: [uses create_job] Job #12345 created successfully

You: Schedule it for tomorrow at 2pm
Claude: [uses schedule_appointment] Appointment scheduled for Dec 16 at 2:00 PM
```

---

## Files Changed

### New Files Created
```
mcp-server/tools/
├── index.js
├── query-database.js
├── call-st-api.js
├── send-sms.js
├── send-email.js
├── create-job.js
└── schedule-appointment.js

src/db/migrations/
├── 002_servicetitan_complete.sql
├── 003_workflow_engine.sql
├── 004_callrail_tracking.sql
└── 005_messaging_system.sql

scripts/
└── run-migrations.sh

docs/
└── DEPLOYMENT_SUMMARY.md
```

### Modified Files
```
mcp-server/index.js      - Added 16 new tools and handlers
mcp-server/package.json  - Added 3 dependencies, bumped version
.env.example             - Added 10 new environment variables
```

---

## Next Steps

1. **Configure credentials** in `.env` file
2. **Run database migrations** using the script
3. **Install npm dependencies** in mcp-server/
4. **Test MCP server** starts without errors
5. **Update Claude Desktop config** to use new server
6. **Run initial data sync** from ServiceTitan (separate process)

---

## Support

If you encounter issues:
1. Check PostgreSQL version (requires 12+)
2. Verify all environment variables are set
3. Check database connectivity
4. Review MCP server logs for errors

**Documentation location:** `docs/Batch 1 Database/`
