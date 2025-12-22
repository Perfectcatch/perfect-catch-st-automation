/**
 * AI-Powered Pricebook Search
 * Understands fuzzy queries and finds best matches
 */

import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';

const { Pool } = pg;

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
    const client = getAnthropicClient();
    
    try {
      const response = await client.messages.create({
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
    } catch (error) {
      console.error('Failed to expand query:', error.message);
    }
    
    return [query];
  }
  
  /**
   * Multi-strategy search
   */
  async multiStrategySearch(queries, category) {
    const allResults = [];
    const client = await getPool().connect();

    try {
      for (const query of queries) {
        const lowerQuery = query.toLowerCase();

        // Search equipment (pricebook schema, active items only by default)
        if (!category || category === 'equipment') {
          const equipResult = await client.query(`
            SELECT st_id as id, code as sku, name, description, cost, price, 'equipment' as category
            FROM raw_st_pricebook_equipment
            WHERE active = true AND (LOWER(name) LIKE $1 OR LOWER(code) LIKE $1 OR LOWER(description) LIKE $1)
            LIMIT 5
          `, [`%${lowerQuery}%`]);
          allResults.push(...equipResult.rows);
        }

        // Search materials
        if (!category || category === 'material') {
          const matResult = await client.query(`
            SELECT st_id as id, code as sku, name, description, cost, price, 'material' as category
            FROM raw_st_pricebook_materials
            WHERE active = true AND (LOWER(name) LIKE $1 OR LOWER(code) LIKE $1 OR LOWER(description) LIKE $1)
            LIMIT 5
          `, [`%${lowerQuery}%`]);
          allResults.push(...matResult.rows);
        }

        // Search services
        if (!category || category === 'labor' || category === 'service') {
          const svcResult = await client.query(`
            SELECT st_id as id, code as sku, name, description, price, 'service' as category
            FROM raw_st_pricebook_services
            WHERE active = true AND (LOWER(name) LIKE $1 OR LOWER(code) LIKE $1 OR LOWER(description) LIKE $1)
            LIMIT 5
          `, [`%${lowerQuery}%`]);
          allResults.push(...svcResult.rows);
        }
      }
    } finally {
      client.release();
    }

    // Deduplicate
    const seen = new Set();
    return allResults.filter(item => {
      const key = `${item.category}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Rank results by relevance using AI
   */
  async rankResults(results, originalQuery) {
    if (results.length === 0) return [];
    if (results.length <= 3) return results; // Skip AI for small result sets
    
    const client = getAnthropicClient();
    
    try {
      const response = await client.messages.create({
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
          content: `Query: "${originalQuery}"\n\nItems:\n${JSON.stringify(results.slice(0, 20).map(r => ({
            id: r.id,
            name: r.name,
            category: r.category
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
    } catch (error) {
      console.error('Failed to rank results:', error.message);
    }
    
    return results;
  }
  
  /**
   * Get item details with pricing
   */
  async getItemDetails(itemId, category) {
    const client = await getPool().connect();

    try {
      let table;
      switch (category) {
        case 'equipment': table = 'raw_st_pricebook_equipment'; break;
        case 'material': table = 'raw_st_pricebook_materials'; break;
        case 'service': table = 'raw_st_pricebook_services'; break;
        default: table = 'raw_st_pricebook_equipment';
      }

      const result = await client.query(`
        SELECT * FROM ${table} WHERE st_id = $1
      `, [itemId]);

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Get items by category
   */
  async getByCategory(category, limit = 50) {
    const client = await getPool().connect();

    try {
      let table;
      switch (category) {
        case 'equipment': table = 'raw_st_pricebook_equipment'; break;
        case 'material': table = 'raw_st_pricebook_materials'; break;
        case 'service': table = 'raw_st_pricebook_services'; break;
        default: return [];
      }

      const result = await client.query(`
        SELECT st_id as id, code as sku, name, cost, price
        FROM ${table}
        WHERE active = true
        ORDER BY name
        LIMIT $1
      `, [limit]);

      return result.rows;
    } finally {
      client.release();
    }
  }
}

export const pricebookAI = new PricebookAI();
