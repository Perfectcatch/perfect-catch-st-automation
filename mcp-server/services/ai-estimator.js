/**
 * AI-Powered Estimation Engine
 * Understands natural language and builds intelligent quotes
 */

import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';

const { Pool } = pg;

// Lazy initialization
let anthropic = null;
let pool = null;

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

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
    const client = getAnthropicClient();
    
    const response = await client.messages.create({
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
   * Find matching pricebook items using search
   */
  async findMatchingItems(parsed) {
    const results = [];
    const client = await getPool().connect();
    
    try {
      // Search for equipment
      if (parsed.equipment) {
        const searchQuery = `${parsed.equipment} ${parsed.specifications || ''}`.trim();
        
        // Search in pricebook tables
        const equipmentResult = await client.query(`
          SELECT id, code as sku, description as name, price, 'equipment' as type
          FROM pb_equipment
          WHERE LOWER(description) LIKE $1
          ORDER BY description
          LIMIT 3
        `, [`%${searchQuery.toLowerCase()}%`]);
        
        if (equipmentResult.rows.length > 0) {
          const item = equipmentResult.rows[0];
          results.push({
            id: item.id,
            sku: item.sku,
            description: item.name,
            price: Number(item.price) || 0,
            quantity: 1,
            type: 'material',
            category: 'equipment',
            alternatives: equipmentResult.rows.slice(1)
          });
        }
      }
      
      // Search for services if repair/maintenance
      if (parsed.service_type === 'repair' || parsed.service_type === 'maintenance') {
        const serviceResult = await client.query(`
          SELECT id, code as sku, description as name, price, 'service' as type
          FROM pb_services
          WHERE LOWER(description) LIKE $1
          ORDER BY description
          LIMIT 2
        `, [`%${parsed.equipment?.toLowerCase() || 'service'}%`]);
        
        if (serviceResult.rows.length > 0) {
          results.push({
            id: serviceResult.rows[0].id,
            sku: serviceResult.rows[0].sku,
            description: serviceResult.rows[0].name,
            price: Number(serviceResult.rows[0].price) || 0,
            quantity: 1,
            type: 'labor',
            category: 'service'
          });
        }
      }
    } finally {
      client.release();
    }
    
    return results;
  }
  
  /**
   * Suggest required materials based on main items
   */
  async suggestMaterials(items) {
    if (items.length === 0) return [];
    
    const materials = [];
    const client = getAnthropicClient();
    
    for (const item of items) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: `You are a field service materials expert.

Given an equipment item, list ALL required materials for professional installation.

For pool equipment: pipes, valves, fittings, unions, glue, wire, breakers
For electrical: wire, conduit, boxes, breakers, connectors, tape

Return JSON array of material descriptions (max 5 items).`,
        messages: [{
          role: 'user',
          content: `What materials are required to install:\n${item.description}\n\nReturn JSON array.`
        }]
      });
      
      const text = response.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const materialDescriptions = JSON.parse(jsonMatch[0]);
        
        // Search for each material in pricebook
        const dbClient = await getPool().connect();
        try {
          for (const desc of materialDescriptions.slice(0, 5)) {
            const found = await dbClient.query(`
              SELECT id, code as sku, description as name, price
              FROM pb_materials
              WHERE LOWER(description) LIKE $1
              LIMIT 1
            `, [`%${desc.toLowerCase().split(' ')[0]}%`]);
            
            if (found.rows.length > 0) {
              materials.push({
                id: found.rows[0].id,
                sku: found.rows[0].sku,
                description: found.rows[0].name,
                price: Number(found.rows[0].price) || 0,
                quantity: this.estimateQuantity(desc),
                type: 'material',
                category: 'material',
                autoAdded: true
              });
            }
          }
        } finally {
          dbClient.release();
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
    const client = await getPool().connect();
    
    try {
      // Find labor rate for service type
      const laborResult = await client.query(`
        SELECT id, code as sku, description as name, price
        FROM pb_services
        WHERE LOWER(description) LIKE '%labor%' OR LOWER(description) LIKE '%service%'
        ORDER BY price DESC
        LIMIT 1
      `);
      
      if (laborResult.rows.length > 0) {
        const hours = await this.estimateHours(parsed, items);
        
        labor.push({
          id: laborResult.rows[0].id,
          sku: laborResult.rows[0].sku,
          description: `${laborResult.rows[0].name} (${hours} hours)`,
          price: Number(laborResult.rows[0].price) || 85,
          quantity: hours,
          type: 'labor',
          category: 'labor'
        });
      }
    } finally {
      client.release();
    }
    
    return labor;
  }
  
  /**
   * Estimate labor hours using AI
   */
  async estimateHours(parsed, items) {
    const client = getAnthropicClient();
    
    const response = await client.messages.create({
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
    const client = getAnthropicClient();
    
    const response = await client.messages.create({
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
      const lineTotal = (item.price || 0) * (item.quantity || 1);
      
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
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT 
          st_id,
          estimate_number,
          name,
          total,
          st_created_on,
          status
        FROM st_estimates
        WHERE status = 'Sold'
        ORDER BY st_created_on DESC
        LIMIT 5
      `);
      
      return result.rows.map(est => ({
        estimateNumber: est.estimate_number,
        name: est.name,
        total: Number(est.total),
        date: est.st_created_on,
        status: est.status
      }));
    } finally {
      client.release();
    }
  }
  
  /**
   * Create estimate in database
   */
  async createEstimate(data) {
    const { customerId, jobId, items, pricing, metadata } = data;
    const client = await getPool().connect();
    
    try {
      // Get next estimate number
      const lastResult = await client.query(`
        SELECT estimate_number FROM st_estimates
        ORDER BY estimate_number DESC
        LIMIT 1
      `);
      
      const nextNumber = lastResult.rows.length > 0 ? 
        parseInt(lastResult.rows[0].estimate_number) + 1 : 
        10000;
      
      const result = await client.query(`
        INSERT INTO st_estimates (
          st_id, customer_id, job_id, estimate_number, name,
          status, subtotal, total, full_data, st_created_on, st_modified_on, local_synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), NOW()
        )
        RETURNING id, estimate_number
      `, [
        Date.now(), // Temporary st_id
        customerId,
        jobId || null,
        nextNumber.toString(),
        `Auto-Generated ${new Date().toLocaleDateString()}`,
        'Open',
        pricing.subtotal,
        pricing.total,
        JSON.stringify({
          items,
          pricing,
          metadata,
          generated_by: 'ai',
          generated_at: new Date()
        })
      ]);
      
      return result.rows[0];
    } finally {
      client.release();
    }
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
      lineTotal: (item.price || 0) * (item.quantity || 1),
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
    score += (foundInPricebook / Math.max(items.length, 1)) * 0.3;
    
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
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT type FROM st_customers WHERE st_id = $1
      `, [customerId]);
      
      return result.rows[0]?.type?.toLowerCase() || 'residential';
    } finally {
      client.release();
    }
  }
}

export const aiEstimator = new AIEstimator();
