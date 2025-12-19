# Vendor Pricing Integration Guide

## Purpose

This document explains how vendor pricing data flows from CED, Pool360, and Home Depot into our pricebook system, and how pricing is normalized and matched to ServiceTitan materials.

---

## 🏢 Vendor Overview

### Active Vendors

| Vendor | Type | Update Frequency | Data Source |
|--------|------|------------------|-------------|
| **CED** | Electrical supplies | Daily | Invoice scraping + Web crawler |
| **Pool360** | Pool equipment/chemicals | Daily | Invoice scraping |
| **Home Depot** | General materials | Daily | Web API (unofficial) |

### Vendor Data Quality

- **CED:** ⭐⭐⭐⭐⭐ – Most reliable, consistent formats
- **Pool360:** ⭐⭐⭐⭐ – Good quality, occasional format changes
- **Home Depot:** ⭐⭐⭐ – Variable quality, frequent site changes

---

## 📊 Data Flow Architecture

```
Vendor Invoice/Website
       ↓
n8n Invoice OCR Workflow
       ↓
Claude AI Extraction (pipe-delimited format)
       ↓
Price Normalization Service
       ↓
Material Matching Engine
       ↓
vendor_prices table (PostgreSQL)
       ↓
Retool Price Dashboard
       ↓
Manual Review & Approval
       ↓
ServiceTitan API Update
```

---

## 🔄 Existing n8n Workflows

### 1. Invoice OCR with Price Book Sync

**File:** `n8n/workflows/invoice-ocr-sync.json`

**Trigger:** Webhook (email attachment or manual upload)

**Steps:**
1. Receive PDF/image invoice
2. Send to Claude AI for extraction
3. Parse pipe-delimited output
4. Normalize prices
5. Match to materials
6. Store in `vendor_prices` table
7. Notify user of matches/conflicts

**Claude AI Prompt Used:**

```
Extract all items from this invoice/pricebook.

Output format (CRITICAL - use EXACTLY this format):
Name | Product Code | Cost

Rules:
- Preserve order exactly as shown
- If field missing, leave blank: Name |  | Cost
- Keep price symbols ($, commas)
- Multiple prices? Choose "cost" label first, else lowest
- Merge multi-line items into single clean name
- NO commentary, ONLY the pipe-delimited rows
```

**Example Output:**

```
PVC Coupling 1.5" | CED-12345 | $2.47
Conduit Elbow 90° | CED-67890 | $8.99
Wire Nut, Red (100pk) |  | $14.50
```

---

### 2. Vendor Price Crawler (Scheduled)

**File:** `n8n/workflows/vendor-price-crawl.json`

**Trigger:** Cron (daily at 3am)

**Steps:**
1. Use Crawl4AI to fetch product pages
2. Extract pricing data via CSS selectors
3. Normalize formats
4. Store in `vendor_prices` table

**Vendor-Specific Selectors:**

```javascript
const selectors = {
  ced: {
    price: '.product-price .price-value',
    sku: '.product-code',
    name: '.product-title h1'
  },
  pool360: {
    price: '.pricing .unit-price',
    sku: '.item-number',
    name: '.product-name'
  },
  homedepot: {
    price: '[data-testid="price"]',
    sku: '.product-identifier',
    name: '.product-header h1'
  }
}
```

---

## 💰 Price Normalization

### Challenge: Different Pricing Units

Vendors use different pricing structures:

| Vendor | Pricing Unit | Example | Unit Price Calculation |
|--------|-------------|---------|----------------------|
| CED | Per 100 | $45.00/100 | $45.00 ÷ 100 = $0.45 each |
| Pool360 | Per pack (varies) | $89.99/6pk | $89.99 ÷ 6 = $15.00 each |
| Home Depot | Each | $12.47 ea | $12.47 each |

### Normalization Algorithm

```typescript
interface VendorPrice {
  vendor: string
  rawPrice: number
  priceUnit: 'each' | 'per-100' | 'per-pack' | 'per-1000'
  packQuantity?: number // Only for per-pack
}

function normalizeToUnitPrice(vendorPrice: VendorPrice): number {
  const { rawPrice, priceUnit, packQuantity } = vendorPrice
  
  switch (priceUnit) {
    case 'each':
      return rawPrice
    
    case 'per-100':
      return rawPrice / 100
    
    case 'per-1000':
      return rawPrice / 1000
    
    case 'per-pack':
      if (!packQuantity) throw new Error('Pack quantity required')
      return rawPrice / packQuantity
    
    default:
      throw new Error(`Unknown price unit: ${priceUnit}`)
  }
}
```

### Detecting Price Units from Text

```typescript
function detectPriceUnit(priceText: string): {
  unit: PriceUnit
  quantity?: number
} {
  // Examples: "$45.00/100", "$89.99/6pk", "$12.47 ea"
  
  // Per-100 patterns
  if (/\/100|per\s*100|C$/i.test(priceText)) {
    return { unit: 'per-100' }
  }
  
  // Per-1000 patterns
  if (/\/1000|per\s*1000|M$/i.test(priceText)) {
    return { unit: 'per-1000' }
  }
  
  // Per-pack patterns
  const packMatch = priceText.match(/\/(\d+)pk|(\d+)\s*pack/i)
  if (packMatch) {
    const qty = parseInt(packMatch[1] || packMatch[2])
    return { unit: 'per-pack', quantity: qty }
  }
  
  // Default to each
  return { unit: 'each' }
}
```

---

## 🔍 Material Matching Engine

### Matching Hierarchy (Priority Order)

1. **Exact Product Code Match** (99% confidence)
   ```sql
   SELECT * FROM pricebook_materials 
   WHERE code = 'CED-12345'
   ```

2. **Vendor Part Number Match** (95% confidence)
   ```sql
   SELECT * FROM pricebook_materials 
   WHERE vendor_part_number = '67890'
   ```

3. **Exact Name Match** (90% confidence)
   ```sql
   SELECT * FROM pricebook_materials 
   WHERE LOWER(name) = LOWER('PVC Coupling 1.5"')
   ```

4. **Fuzzy Name Match** (85% threshold)
   ```typescript
   import { levenshtein } from 'fast-levenshtein'
   
   const similarity = (a: string, b: string) => {
     const dist = levenshtein.get(a.toLowerCase(), b.toLowerCase())
     const maxLen = Math.max(a.length, b.length)
     return 1 - (dist / maxLen)
   }
   
   // Only accept if similarity >= 0.85
   const matches = materials.filter(m => 
     similarity(m.name, vendorName) >= 0.85
   )
   ```

5. **Manual Review** (if no match above 85%)
   - Store in `unmatched_vendor_items` table
   - Display in Retool dashboard
   - User can create new material or link to existing

### Matching Code Example

```typescript
async function matchVendorItem(
  vendorItem: VendorItem
): Promise<MaterialMatch> {
  
  // Step 1: Exact code match
  const exactCodeMatch = await prisma.pricebook_materials.findFirst({
    where: { code: vendorItem.productCode }
  })
  if (exactCodeMatch) {
    return { 
      material: exactCodeMatch, 
      confidence: 0.99, 
      method: 'exact_code' 
    }
  }
  
  // Step 2: Vendor part number
  const vendorPartMatch = await prisma.pricebook_materials.findFirst({
    where: { 
      vendor_part_number: vendorItem.productCode,
      primary_vendor: vendorItem.vendor
    }
  })
  if (vendorPartMatch) {
    return { 
      material: vendorPartMatch, 
      confidence: 0.95, 
      method: 'vendor_part' 
    }
  }
  
  // Step 3: Exact name match
  const exactNameMatch = await prisma.pricebook_materials.findFirst({
    where: { 
      name: { 
        equals: vendorItem.name, 
        mode: 'insensitive' 
      }
    }
  })
  if (exactNameMatch) {
    return { 
      material: exactNameMatch, 
      confidence: 0.90, 
      method: 'exact_name' 
    }
  }
  
  // Step 4: Fuzzy name match
  const allMaterials = await prisma.pricebook_materials.findMany({
    where: { deleted_at: null }
  })
  
  const fuzzyMatches = allMaterials
    .map(m => ({
      material: m,
      similarity: similarity(m.name, vendorItem.name)
    }))
    .filter(m => m.similarity >= 0.85)
    .sort((a, b) => b.similarity - a.similarity)
  
  if (fuzzyMatches.length > 0) {
    return {
      material: fuzzyMatches[0].material,
      confidence: fuzzyMatches[0].similarity,
      method: 'fuzzy_name',
      alternatives: fuzzyMatches.slice(1, 5) // Top 5 alternatives
    }
  }
  
  // Step 5: No match - manual review required
  return {
    material: null,
    confidence: 0,
    method: 'no_match',
    requiresManualReview: true
  }
}
```

---

## 📁 Database Schema

### vendor_prices Table

```sql
CREATE TABLE vendor_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Material linkage
  material_id BIGINT REFERENCES pricebook_materials(id),
  match_confidence DECIMAL(3,2), -- 0.00 to 1.00
  match_method TEXT, -- 'exact_code', 'vendor_part', 'exact_name', 'fuzzy_name'
  requires_review BOOLEAN DEFAULT FALSE,
  
  -- Vendor data
  vendor TEXT NOT NULL, -- 'ced', 'pool360', 'homedepot'
  vendor_sku TEXT,
  vendor_name TEXT,
  
  -- Pricing
  raw_price DECIMAL(10,2),
  price_unit TEXT, -- 'each', 'per-100', 'per-pack', 'per-1000'
  pack_quantity INTEGER,
  unit_price DECIMAL(10,4), -- Normalized price (always "per each")
  
  -- Metadata
  scraped_at TIMESTAMP DEFAULT NOW(),
  scraped_from TEXT, -- 'invoice', 'website', 'api'
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Price change tracking
  previous_price DECIMAL(10,4),
  price_changed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vendor_prices_material ON vendor_prices(material_id);
CREATE INDEX idx_vendor_prices_vendor ON vendor_prices(vendor);
CREATE INDEX idx_vendor_prices_review ON vendor_prices(requires_review);
```

### unmatched_vendor_items Table

```sql
CREATE TABLE unmatched_vendor_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  vendor TEXT NOT NULL,
  vendor_sku TEXT,
  vendor_name TEXT,
  raw_price DECIMAL(10,2),
  price_unit TEXT,
  
  -- Why it didn't match
  attempted_matches JSONB, -- List of materials considered
  reason TEXT, -- 'no_matches', 'low_confidence', 'multiple_matches'
  
  -- Manual resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  linked_material_id BIGINT REFERENCES pricebook_materials(id),
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🎨 Retool Price Dashboard

### Key Features

1. **Price Comparison Table**
   - Material name
   - Current ST price
   - Vendor prices (all 3 vendors)
   - Price difference % (highlight >10% changes)
   - Last updated timestamp

2. **Unmatched Items Queue**
   - Show all items requiring manual review
   - Search for potential matches
   - "Create New Material" button
   - "Link to Existing" dropdown

3. **Price History Chart**
   - Line chart showing price trends
   - Per material, across all vendors
   - Identify unusual spikes

4. **Bulk Update Actions**
   - Select multiple materials
   - "Update ST Prices" button
   - Confirmation dialog showing changes
   - Audit log of updates

### Retool Queries

```javascript
// Get all materials with vendor prices
{
  "queryName": "getMaterialsWithPrices",
  "endpoint": "/api/vendor-prices/materials-with-prices",
  "method": "GET"
}

// Update ST price from vendor price
{
  "queryName": "updateMaterialPrice",
  "endpoint": "/api/pricebook/materials/{{ table1.selectedRow.id }}",
  "method": "PATCH",
  "body": {
    "cost": {{ table1.selectedRow.vendor_price }}
  }
}

// Resolve unmatched item
{
  "queryName": "resolveUnmatched",
  "endpoint": "/api/vendor-prices/resolve-unmatched",
  "method": "POST",
  "body": {
    "unmatchedId": {{ table2.selectedRow.id }},
    "action": {{ radio1.value }}, // 'create_new' or 'link_existing'
    "materialId": {{ select1.value }} // Only if link_existing
  }
}
```

---

## 🔔 Price Change Alerts

### Alert Triggers

```typescript
interface PriceChangeAlert {
  material_id: number
  material_name: string
  old_price: number
  new_price: number
  change_percent: number
  vendor: string
  threshold: number // Alert if change > threshold
}

// Check for significant price changes
async function checkPriceAlerts() {
  const recentPrices = await prisma.vendor_prices.findMany({
    where: {
      price_changed_at: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24h
      }
    }
  })
  
  const alerts = recentPrices
    .filter(p => {
      const changePercent = Math.abs(
        (p.unit_price - p.previous_price) / p.previous_price
      ) * 100
      return changePercent > 10 // 10% threshold
    })
    .map(p => createAlert(p))
  
  // Send to Slack
  await sendSlackNotification({
    channel: '#price-alerts',
    text: `🚨 ${alerts.length} materials have significant price changes`,
    attachments: alerts
  })
}
```

### Slack Notification Format

```json
{
  "text": "🚨 Price Alert: PVC Coupling 1.5\"",
  "attachments": [{
    "color": "warning",
    "fields": [
      { "title": "Old Price", "value": "$2.47", "short": true },
      { "title": "New Price", "value": "$3.12", "short": true },
      { "title": "Change", "value": "+26.3%", "short": true },
      { "title": "Vendor", "value": "CED", "short": true }
    ],
    "actions": [{
      "type": "button",
      "text": "Update in ST",
      "url": "https://retool.app/apps/pricebook/materials/9404"
    }]
  }]
}
```

---

## 🧪 Testing Vendor Integration

### Test Cases

1. **Invoice OCR Accuracy**
   - Upload 10 sample invoices
   - Verify 95%+ extraction accuracy
   - Check price unit detection

2. **Material Matching**
   - 100 vendor items with known matches
   - Verify correct match in 90%+ cases
   - Check fuzzy matching doesn't false positive

3. **Price Normalization**
   - Test all price units (each, per-100, per-pack, per-1000)
   - Verify calculations correct
   - Handle edge cases (missing data, invalid formats)

4. **Conflict Detection**
   - Create scenario: ST price = $5, vendor price = $3
   - Verify system flags difference
   - Test alert notification

---

## 📊 Vendor Pricing Metrics

### KPIs to Track

- **Match Rate:** % of vendor items successfully matched
- **Manual Review Queue Size:** Unmatched items needing attention
- **Price Update Frequency:** How often ST prices updated from vendors
- **Price Variance:** Average % difference between ST and vendor prices
- **Cost Savings:** Estimated savings from vendor pricing updates

### Monthly Report (Automated)

```typescript
interface VendorPricingReport {
  period: string // 'December 2024'
  
  totalVendorItems: number
  matchedItems: number
  unmatchedItems: number
  
  priceUpdates: number // How many ST prices updated
  averagePriceChange: number // Average % change
  
  costSavings: {
    total: number
    byVendor: {
      ced: number
      pool360: number
      homedepot: number
    }
  }
  
  topPriceChanges: Array<{
    material: string
    oldPrice: number
    newPrice: number
    savingsPerUnit: number
  }>
}
```

---

## 🚀 Future Enhancements

1. **API Integration with Vendors**
   - CED API (if available)
   - Pool360 API (if available)
   - Real-time pricing instead of daily scrapes

2. **Bulk Ordering Integration**
   - Generate purchase orders based on job requirements
   - Compare vendor prices, choose cheapest
   - Track order history

3. **Inventory Management**
   - Link to warehouse stock levels
   - Auto-reorder when low
   - Track material usage per job

4. **Price Forecasting**
   - ML model to predict price trends
   - Alert when good time to bulk buy
   - Historical price analysis

---

## ✅ Success Criteria

Vendor integration is successful when:

- [ ] 90%+ materials have vendor pricing data
- [ ] Prices update daily automatically
- [ ] Manual review queue < 50 items
- [ ] No false matches (high confidence threshold)
- [ ] Price alerts working (Slack notifications)
- [ ] Audit log of all price changes

---

*Vendor pricing is a competitive advantage – treat this data as gold.*
