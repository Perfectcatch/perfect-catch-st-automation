# PART A: AI ESTIMATION ENGINE & ESTIMATE TOOLS

## File 1: AI Estimation Engine Core

**File:** `mcp-server/services/ai-estimator.js`

```javascript
/**
 * AI-Powered Estimation Engine
 * Understands natural language and builds intelligent quotes
 */

import Anthropic from '@anthropic-ai/sdk';
import { PricebookAI } from './pricebook-ai.js';
import { NLPParser } from './nlp-parser.js';
import { PrismaClient } from '@prisma/client';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const prisma = new PrismaClient();
const pricebookAI = new PricebookAI();
const nlp = new NLPParser();

export class AIEstimator {
  
  /**
   * Generate estimate from natural language description
   */
  async generateFromDescription(input) {
    const {
      customerId,
      jobId,
      description,
      includeOptions = true,
      includeMaterials = true,
      applyDiscounts = false
    } = input;
    
    // Step 1: Parse description with AI
    const parsed = await this.parseDescription(description);
    
    // Step 2: Find matching pricebook items
    const items = await this.findMatchingItems(parsed);
    
    // Step 3: Add required materials automatically
    if (includeMaterials) {
      const materials = await this.suggestMaterials(items);
      items.push(...materials);
    }
    
    // Step 4: Add labor
    const labor = await this.calculateLabor(parsed, items);
    items.push(...labor);
    
    // Step 5: Find optional add-ons
    const addons = includeOptions ? await this.suggestAddons(parsed, items) : [];
    
    // Step 6: Calculate pricing
    const pricing = this.calculatePricing(items, {
      applyDiscounts,
      customerType: await this.getCustomerType(customerId)
    });
    
    // Step 7: Find similar estimates for validation
    const similar = await this.findSimilarEstimates(parsed);
    
    // Step 8: Create estimate in database
    const estimate = await this.createEstimate({
      customerId,
      jobId,
      items,
      pricing,
      metadata: { parsed, similar, addons }
    });
    
    return {
      estimateId: estimate.id,
      estimateNumber: estimate.estimate_number,
      ...pricing,
      items: items.map(this.formatItem),
      suggestedAddons: addons,
      similarEstimates: similar,
      confidence: this.calculateConfidence(items, similar)
    };
  }
  
  /**
   * Parse natural language description into structured data
   */
  async parseDescription(description) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a field service estimation expert for pool and electrical services.

Parse customer service descriptions into structured data for quote generation.

Extract:
- service_type: (installation, repair, replacement, maintenance, inspection)
- equipment: (pump, heater, filter, panel, wiring, etc.)
- specifications: (size, capacity, model, brand)
- scope: (what needs to be done)
- urgency: (emergency, standard, scheduled)
- location_notes: (roof access, tight space, etc.)

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Parse this service description:\n\n"${description}"\n\nReturn structured JSON.`
      }]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('Failed to parse description');
    }
    
    return JSON.parse(jsonMatch[0]);
  }
  
  /**
   * Find matching pricebook items using AI search
   */
  async findMatchingItems(parsed) {
    const results = [];
    
    // Search for equipment
    if (parsed.equipment) {
      const equipment = await pricebookAI.smartSearch({
        query: `${parsed.equipment} ${parsed.specifications || ''}`,
        category: 'equipment',
        limit: 3
      });
      
      // Pick best match or offer alternatives
      if (equipment.length > 0) {
        results.push({
          ...equipment[0],
          quantity: 1,
          type: 'material',
          category: 'equipment'
        });
        
        // Store alternatives
        if (equipment.length > 1) {
          results[0].alternatives = equipment.slice(1);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Suggest required materials based on main items
   */
  async suggestMaterials(items) {
    const materials = [];
    
    for (const item of items) {
      // Use AI to determine required materials
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: `You are a field service materials expert.

Given an equipment item, list ALL required materials for professional installation.

For pool equipment: pipes, valves, fittings, unions, glue, wire, breakers
For electrical: wire, conduit, boxes, breakers, connectors, tape

Return JSON array of material descriptions.`,
        messages: [{
          role: 'user',
          content: `What materials are required to install:\n${item.description}\n\nReturn JSON array.`
        }]
      });
      
      const text = response.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const materialDescriptions = JSON.parse(jsonMatch[0]);
        
        // Find each material in pricebook
        for (const desc of materialDescriptions) {
          const found = await pricebookAI.smartSearch({
            query: desc,
            category: 'material',
            limit: 1
          });
          
          if (found.length > 0) {
            materials.push({
              ...found[0],
              quantity: this.estimateQuantity(desc),
              type: 'material',
              category: 'material',
              autoAdded: true
            });
          }
        }
      }
    }
    
    return materials;
  }
  
  /**
   * Calculate labor requirements
   */
  async calculateLabor(parsed, items) {
    const labor = [];
    
    // Determine labor type from service type
    let laborCategory;
    switch (parsed.service_type) {
      case 'installation':
        laborCategory = 'installation';
        break;
      case 'repair':
        laborCategory = 'service';
        break;
      case 'replacement':
        laborCategory = 'replacement';
        break;
      default:
        laborCategory = 'service';
    }
    
    // Find labor rate for equipment type
    const laborRate = await pricebookAI.smartSearch({
      query: `${laborCategory} ${parsed.equipment || 'general'}`,
      category: 'labor',
      limit: 1
    });
    
    if (laborRate.length > 0) {
      // Estimate hours based on complexity
      const hours = await this.estimateHours(parsed, items);
      
      labor.push({
        ...laborRate[0],
        quantity: hours,
        type: 'labor',
        category: 'labor'
      });
    }
    
    return labor;
  }
  
  /**
   * Estimate labor hours using AI
   */
  async estimateHours(parsed, items) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: `You are a field service scheduling expert.

Estimate labor hours for service jobs considering:
- Travel/setup: 0.5-1 hour
- Simple tasks: 1-2 hours
- Standard installs: 2-4 hours
- Complex jobs: 4-8 hours
- Emergency surcharge: +1 hour

Return ONLY a number (hours).`,
      messages: [{
        role: 'user',
        content: `Estimate hours for:\nService: ${parsed.service_type}\nEquipment: ${parsed.equipment}\nItems: ${items.length}\n\nReturn number only.`
      }]
    });
    
    const hours = parseFloat(response.content[0].text.trim());
    return isNaN(hours) ? 2 : hours;
  }
  
  /**
   * Suggest optional add-ons
   */
  async suggestAddons(parsed, items) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `You are a sales consultant for pool and electrical services.

Suggest relevant upgrades and add-ons that provide value:
- Warranties
- Maintenance plans
- Upgrades
- Related services
- Preventive work

Return JSON array of suggestions with descriptions and estimated pricing.`,
      messages: [{
        role: 'user',
        content: `Customer is getting:\n${JSON.stringify(parsed)}\n\nItems: ${items.map(i => i.description).join(', ')}\n\nSuggest add-ons (JSON array).`
      }]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [];
  }
  
  /**
   * Calculate total pricing with markup and discounts
   */
  calculatePricing(items, options = {}) {
    const { applyDiscounts, customerType } = options;
    
    let subtotalMaterials = 0;
    let subtotalLabor = 0;
    let subtotalOther = 0;
    
    for (const item of items) {
      const lineTotal = item.price * item.quantity;
      
      if (item.type === 'material') {
        subtotalMaterials += lineTotal;
      } else if (item.type === 'labor') {
        subtotalLabor += lineTotal;
      } else {
        subtotalOther += lineTotal;
      }
    }
    
    // Apply material markup (30%)
    const materialsWithMarkup = subtotalMaterials * 1.30;
    
    let subtotal = materialsWithMarkup + subtotalLabor + subtotalOther;
    
    // Apply customer discount
    let discount = 0;
    if (applyDiscounts) {
      if (customerType === 'vip') discount = subtotal * 0.10;
      else if (customerType === 'commercial') discount = subtotal * 0.05;
    }
    
    const total = subtotal - discount;
    const tax = total * 0.07; // 7% tax
    const grandTotal = total + tax;
    
    return {
      subtotalMaterials,
      subtotalLabor,
      subtotalOther,
      materialsMarkup: materialsWithMarkup - subtotalMaterials,
      subtotal,
      discount,
      tax,
      total: grandTotal,
      breakdown: {
        materials: materialsWithMarkup,
        labor: subtotalLabor,
        other: subtotalOther
      }
    };
  }
  
  /**
   * Find similar estimates for validation
   */
  async findSimilarEstimates(parsed) {
    const similar = await prisma.$queryRaw`
      SELECT 
        st_id,
        estimate_number,
        name,
        total,
        st_created_on,
        status
      FROM st_estimates
      WHERE 
        full_data->>'equipment_type' = ${parsed.equipment}
        AND status = 'Sold'
      ORDER BY st_created_on DESC
      LIMIT 5
    `;
    
    return similar.map(est => ({
      estimateNumber: est.estimate_number,
      name: est.name,
      total: Number(est.total),
      date: est.st_created_on,
      status: est.status
    }));
  }
  
  /**
   * Create estimate in database
   */
  async createEstimate(data) {
    const { customerId, jobId, items, pricing, metadata } = data;
    
    // Get next estimate number
    const lastEstimate = await prisma.st_estimates.findFirst({
      orderBy: { estimate_number: 'desc' }
    });
    
    const nextNumber = lastEstimate ? 
      parseInt(lastEstimate.estimate_number) + 1 : 
      10000;
    
    const estimate = await prisma.st_estimates.create({
      data: {
        st_id: BigInt(Date.now()), // Temporary ID
        customer_id: BigInt(customerId),
        job_id: jobId ? BigInt(jobId) : null,
        estimate_number: nextNumber.toString(),
        name: `Auto-Generated ${new Date().toLocaleDateString()}`,
        status: 'Open',
        subtotal: pricing.subtotal,
        total: pricing.total,
        items: JSON.stringify(items),
        full_data: {
          items,
          pricing,
          metadata,
          generated_by: 'ai',
          generated_at: new Date()
        }
      }
    });
    
    return estimate;
  }
  
  /**
   * Format item for display
   */
  formatItem(item) {
    return {
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: item.price * item.quantity,
      type: item.type,
      category: item.category,
      autoAdded: item.autoAdded || false,
      alternatives: item.alternatives || []
    };
  }
  
  /**
   * Calculate confidence score
   */
  calculateConfidence(items, similarEstimates) {
    let score = 0.5; // Base confidence
    
    // Higher confidence if we found similar estimates
    if (similarEstimates.length > 0) {
      score += 0.2;
    }
    
    // Higher confidence if all items found in pricebook
    const foundInPricebook = items.filter(i => i.sku).length;
    score += (foundInPricebook / items.length) * 0.3;
    
    return Math.min(score, 1.0);
  }
  
  /**
   * Estimate quantity for materials
   */
  estimateQuantity(description) {
    const lower = description.toLowerCase();
    
    // Pipes, wire: estimate 10-50 feet
    if (lower.includes('pipe') || lower.includes('wire')) {
      return 20;
    }
    
    // Small fittings: 2-4 pieces
    if (lower.includes('fitting') || lower.includes('union')) {
      return 2;
    }
    
    // Default: 1
    return 1;
  }
  
  /**
   * Get customer type
   */
  async getCustomerType(customerId) {
    const customer = await prisma.st_customers.findUnique({
      where: { st_id: BigInt(customerId) }
    });
    
    return customer?.type?.toLowerCase() || 'residential';
  }
}

export const aiEstimator = new AIEstimator();
```

---

## File 2: Pricebook AI Search

**File:** `mcp-server/services/pricebook-ai.js`

```javascript
/**
 * AI-Powered Pricebook Search
 * Understands fuzzy queries and finds best matches
 */

import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const prisma = new PrismaClient();

export class PricebookAI {
  
  /**
   * Smart pricebook search with fuzzy matching
   */
  async smartSearch(params) {
    const {
      query,
      category = null,
      limit = 10,
      includeAlternatives = true
    } = params;
    
    // Step 1: Expand query with synonyms and variations
    const expandedQueries = await this.expandQuery(query);
    
    // Step 2: Search database with multiple strategies
    const results = await this.multiStrategySearch(expandedQueries, category);
    
    // Step 3: Rank results by relevance
    const ranked = await this.rankResults(results, query);
    
    // Step 4: Include alternatives if requested
    if (includeAlternatives && ranked.length > 0) {
      ranked[0].alternatives = ranked.slice(1, limit);
    }
    
    return ranked.slice(0, limit);
  }
  
  /**
   * Expand query with synonyms
   */
  async expandQuery(query) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: `Generate search term variations and synonyms for pricebook search.

Examples:
- "pump" → ["pump", "circulation pump", "pool pump", "spa pump"]
- "heater" → ["heater", "pool heater", "spa heater", "gas heater", "heat pump"]
- "filter" → ["filter", "pool filter", "cartridge filter", "sand filter"]

Return JSON array of variations.`,
      messages: [{
        role: 'user',
        content: `Generate variations for: "${query}"\n\nReturn JSON array.`
      }]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return [query];
  }
  
  /**
   * Multi-strategy search
   */
  async multiStrategySearch(queries, category) {
    const allResults = [];
    
    for (const query of queries) {
      // Strategy 1: Exact match
      const exact = await prisma.$queryRaw`
        SELECT * FROM pricebook
        WHERE LOWER(name) = LOWER(${query})
        ${category ? Prisma.sql`AND category = ${category}` : Prisma.empty}
        LIMIT 5
      `;
      allResults.push(...exact);
      
      // Strategy 2: LIKE match
      const like = await prisma.$queryRaw`
        SELECT * FROM pricebook
        WHERE LOWER(name) LIKE ${`%${query.toLowerCase()}%`}
        ${category ? Prisma.sql`AND category = ${category}` : Prisma.empty}
        LIMIT 10
      `;
      allResults.push(...like);
      
      // Strategy 3: Word match
      const words = query.split(' ');
      for (const word of words) {
        if (word.length > 3) {
          const wordMatch = await prisma.$queryRaw`
            SELECT * FROM pricebook
            WHERE LOWER(name) LIKE ${`%${word.toLowerCase()}%`}
            ${category ? Prisma.sql`AND category = ${category}` : Prisma.empty}
            LIMIT 5
          `;
          allResults.push(...wordMatch);
        }
      }
    }
    
    // Deduplicate
    const seen = new Set();
    return allResults.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
  
  /**
   * Rank results by relevance using AI
   */
  async rankResults(results, originalQuery) {
    if (results.length === 0) return [];
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `You are a pricebook search relevance expert.

Rank items by relevance to the search query. Consider:
- Exact matches rank highest
- Partial matches rank medium
- Related items rank lower

Return JSON array of item IDs in ranked order.`,
      messages: [{
        role: 'user',
        content: `Query: "${originalQuery}"\n\nItems:\n${JSON.stringify(results.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description
        })))}\n\nReturn ranked IDs (JSON array).`
      }]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      const rankedIds = JSON.parse(jsonMatch[0]);
      
      // Reorder results
      const ordered = [];
      for (const id of rankedIds) {
        const item = results.find(r => r.id === id);
        if (item) ordered.push(item);
      }
      
      // Add any missed items
      for (const item of results) {
        if (!ordered.find(r => r.id === item.id)) {
          ordered.push(item);
        }
      }
      
      return ordered;
    }
    
    return results;
  }
  
  /**
   * Get item details with pricing
   */
  async getItemDetails(itemId) {
    return prisma.pricebook.findUnique({
      where: { id: itemId }
    });
  }
  
  /**
   * Get items by category
   */
  async getByCategory(category, limit = 50) {
    return prisma.pricebook.findMany({
      where: { category },
      take: limit,
      orderBy: { name: 'asc' }
    });
  }
}

export const pricebookAI = new PricebookAI();
```

---

## File 3: NLP Parser

**File:** `mcp-server/services/nlp-parser.js`

```javascript
/**
 * Natural Language Processing Parser
 * Extracts entities and intent from text
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export class NLPParser {
  
  /**
   * Extract entities from text
   */
  async extractEntities(text) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Extract entities from text.

Entities to find:
- equipment: (pump, heater, filter, panel, etc.)
- quantity: (numbers)
- units: (feet, hours, gallons, etc.)
- location: (roof, basement, yard, etc.)
- brand: (Hayward, Pentair, etc.)
- model: (model numbers)
- action: (install, repair, replace, inspect)

Return JSON object with found entities.`,
      messages: [{
        role: 'user',
        content: `Extract entities from:\n\n"${text}"\n\nReturn JSON.`
      }]
    });
    
    const jsonText = response.content[0].text;
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {};
  }
  
  /**
   * Detect intent
   */
  async detectIntent(text) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: `Detect user intent from text.

Intents:
- create_estimate
- add_to_estimate
- search_pricebook
- find_customer
- schedule_job
- check_availability

Return JSON: { intent: "...", confidence: 0-1 }`,
      messages: [{
        role: 'user',
        content: `What is the intent?\n\n"${text}"\n\nReturn JSON.`
      }]
    });
    
    const jsonText = response.content[0].text;
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { intent: 'unknown', confidence: 0 };
  }
}

export const nlpParser = new NLPParser();
```

---

Due to length limits, this is Part 1. Should I continue with:
- **Part 2:** All 15 Estimate/Sales MCP Tools
- **Part 3:** Customer & Scheduling Tools (20 tools)
- **Part 4:** Operations Tools (22 tools)
- **Part 5:** Windsurf Deployment Prompts

Total will be ~10,000-15,000 lines across multiple files.

**Continue with Part 2?**
