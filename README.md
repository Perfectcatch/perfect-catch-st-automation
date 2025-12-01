# Perfect Catch ST Automation Server

Production-grade ServiceTitan API proxy server for Perfect Catch Electric & Pools. This server acts as the authentication and proxy layer for n8n workflows, Windsurf agents, and other services.

## Features

- **OAuth Token Management**: Automatic token acquisition, caching, and refresh
- **Full HTTP Verb Support**: GET, POST, PUT, DELETE, PATCH
- **Retry Logic**: Automatic retry for 429 (rate limit) and 5xx errors
- **Error Normalization**: Consistent error response format
- **Request Logging**: Structured logging with Pino
- **Rate Limiting**: Configurable request rate limiting
- **API Key Protection**: Optional authentication for internal endpoints
- **Health Checks**: `/ping`, `/health`, and `/status` endpoints

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- ServiceTitan API credentials

### Installation

```bash
# Clone the repository
cd perfect-catch-st-automation

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your ServiceTitan credentials
```

### Running Locally

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start

# Run legacy server (original api-server.js)
npm run legacy
```

### Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run smoke tests (requires running server)
npm run smoke
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_TITAN_TENANT_ID` | Yes | - | ServiceTitan tenant ID |
| `SERVICE_TITAN_CLIENT_ID` | Yes | - | OAuth client ID |
| `SERVICE_TITAN_CLIENT_SECRET` | Yes | - | OAuth client secret |
| `SERVICE_TITAN_APP_KEY` | Yes | - | ST application key |
| `PORT` | No | 3001 | Server port |
| `NODE_ENV` | No | development | Environment (development/production/test) |
| `API_KEY` | No | - | Optional API key for authentication |
| `RATE_LIMIT_MAX_REQUESTS` | No | 100 | Max requests per window (0 to disable) |
| `MAX_RETRIES` | No | 3 | Retry attempts for failed requests |

## Project Structure

```
perfect-catch-st-automation/
├── src/
│   ├── app.js                    # Express app setup
│   ├── server.js                 # Entry point
│   ├── config/
│   │   ├── index.js              # Config loader
│   │   └── env.schema.js         # Zod validation
│   ├── routes/
│   │   ├── index.js              # Route aggregator
│   │   ├── health.routes.js      # Health endpoints
│   │   ├── jobs.routes.js        # Jobs endpoints
│   │   ├── customers.routes.js   # Customer endpoints
│   │   ├── estimates.routes.js   # Estimate endpoints
│   │   └── opportunities.routes.js
│   ├── controllers/              # Business logic
│   ├── services/
│   │   ├── stClient.js           # ServiceTitan API client
│   │   └── tokenManager.js       # OAuth token management
│   ├── middleware/
│   │   ├── requestLogger.js      # Request logging
│   │   ├── errorHandler.js       # Error handling
│   │   └── apiKeyAuth.js         # API key auth
│   └── lib/
│       ├── logger.js             # Pino logger
│       ├── errors.js             # Custom errors
│       └── stEndpoints.js        # URL builders
├── tests/                        # Test files
├── scripts/
│   └── smoke-test.js             # Endpoint tester
├── docs/
│   └── openapi.yaml              # API documentation
├── api-server.js                 # Legacy server (preserved)
└── package.json
```

## API Endpoints

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ping` | Simple health check |
| GET | `/health` | Detailed health with components |
| GET | `/status` | Full status with metrics |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job by ID |
| GET | `/jobs/:id/notes` | Get job notes |
| GET | `/jobs/:id/history` | Get job history |

### Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/customers` | List all customers |
| GET | `/customers/:id` | Get customer by ID |
| POST | `/customers` | Create customer |
| PUT | `/customers/:id` | Update customer |
| GET | `/customers/contacts` | List all contacts |
| GET | `/customers/:id/contacts` | Get customer contacts |

### Estimates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/estimates` | List all estimates |
| GET | `/estimates/:id` | Get estimate by ID |
| POST | `/estimates` | Create estimate |
| PUT | `/estimates/:id` | Update estimate |
| PUT | `/estimates/:id/sell` | Mark as sold |
| PUT | `/estimates/:id/unsell` | Unmark as sold |
| PUT | `/estimates/:id/dismiss` | Dismiss estimate |
| GET | `/estimates/:id/items` | List estimate items |
| PUT | `/estimates/:id/items` | Update items |
| DELETE | `/estimates/:id/items/:itemId` | Delete item |

### Opportunities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/opportunities` | List opportunities |
| GET | `/opportunities/:id` | Get opportunity by ID |
| GET | `/opportunities/:id/followups` | Get follow-ups |

## Example Usage

### cURL Examples

```bash
# Health check
curl http://localhost:3001/ping

# List jobs with pagination
curl "http://localhost:3001/jobs?page=1&pageSize=50"

# Get customer by ID
curl http://localhost:3001/customers/12345

# Get customers created in the last 7 days
# Replace dates with actual ISO 8601 timestamps
curl "http://localhost:3001/customers?createdOnOrAfter=2025-11-24T00:00:00.000Z&createdOnOrBefore=2025-12-01T23:59:59.999Z&page=1&pageSize=50"

# Dynamic: Get customers from last 7 days (using shell date command)
curl "http://localhost:3001/customers?createdOnOrAfter=$(date -u -v-7d +%Y-%m-%dT00:00:00.000Z)&createdOnOrBefore=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)&page=1&pageSize=50"

# Create estimate (POST with body)
curl -X POST http://localhost:3001/estimates \
  -H "Content-Type: application/json" \
  -d '{"jobId": 123, "name": "New Estimate"}'
```

### Get Recent Customers Script

A dedicated script to fetch customers created in the last N days:

```bash
# Get customers from last 7 days (default)
npm run recent-customers

# Or run directly with custom parameters
node scripts/get-recent-customers.js http://localhost:3001 7

# Get customers from last 30 days
node scripts/get-recent-customers.js http://localhost:3001 30
```

### n8n HTTP Request Node

```json
{
  "url": "http://localhost:3001/jobs",
  "method": "GET",
  "queryParameters": {
    "page": 1,
    "pageSize": 50,
    "createdOnOrAfter": "2024-01-01"
  }
}
```

## Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Using Docker

```bash
# Build image
docker build -t perfect-catch-st-automation .

# Run container
docker run -d \
  --name st-automation \
  -p 3001:3001 \
  --env-file .env \
  perfect-catch-st-automation
```

### Using Docker Compose

```bash
docker-compose up -d
```

## Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

## License

Proprietary - Perfect Catch Electric & Pools

## Support

For issues or questions, contact the development team.
