# Vendor Scrapers

This directory contains vendor price scrapers for comparing pricebook items against supplier pricing.

## Scrapers

### Pool360 (`pool360/`)

Scrapes product data from Pool360 distributor portal.

**Files:**
- `index.js` - Express API server
- `scraper.js` - Browserless scraping logic
- `parser.js` - HTML/text parsing

**Endpoints:**
- `GET /health` - Health check
- `POST /search` - Search products `{ "part": "..." }`

**Environment Variables:**
- `POOL360_USERNAME` - Portal username
- `POOL360_PASSWORD` - Portal password
- `BROWSERLESS_URL` - Browserless server URL

### CED (`ced/`)

Scrapes product data from CED (Consolidated Electrical Distributors) portal.

**Files:**
- `index.js` - Express API server with embedded scraper

**Endpoints:**
- `GET /health` - Health check
- `POST /search` - Search products `{ "part": "..." }`

**Environment Variables:**
- `CED_USERNAME` - Portal username
- `CED_PASSWORD` - Portal password
- `BROWSERLESS_URL` - Browserless server URL

### Common (`common/`)

Shared utilities used by all scrapers.

**Files:**
- `index.js` - Main exports
- `normalize/` - Response normalization
- `utils/` - Scoring and error handling
- `config/` - Shared configuration

## Docker Deployment

The scrapers run as separate Docker containers:

```yaml
# docker-compose.yml (parent directory)
services:
  st-pool360-scraper-api:
    build: ./pool360
    ports:
      - "3021:3000"
    environment:
      - POOL360_USERNAME=${POOL360_USERNAME}
      - POOL360_PASSWORD=${POOL360_PASSWORD}
      - BROWSERLESS_URL=http://st-browserless:3000

  st-ced-scraper-api:
    build: ./ced
    ports:
      - "3011:3000"
    environment:
      - CED_USERNAME=${CED_USERNAME}
      - CED_PASSWORD=${CED_PASSWORD}
      - BROWSERLESS_URL=http://st-browserless:3000

  st-browserless:
    image: browserless/chrome:latest
    ports:
      - "3010:3000"
```

## Usage

```javascript
// Search Pool360
const response = await fetch('http://localhost:3021/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ part: 'CLX200EA' })
});
const data = await response.json();

// Response format
{
  success: true,
  part: "CLX200EA",
  name: "Hayward CL200 Chlorinator",
  price: 299.99,
  stock: "In Stock",
  url: "https://...",
  bestMatch: { ... },
  items: [ ... ]
}
```

## Integration with Pricebook

The scrapers are called from `src/routes/scrapers.routes.js` to compare ServiceTitan pricebook prices against vendor pricing.
