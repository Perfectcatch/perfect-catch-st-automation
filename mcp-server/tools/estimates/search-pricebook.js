/**
 * Smart Pricebook Search Tool
 * AI-powered fuzzy search with synonym expansion
 */

import { pricebookAI } from '../../services/pricebook-ai.js';

export const searchPricebook = {
  name: 'search_pricebook',
  description: 'Intelligently search the pricebook with fuzzy matching. Understands synonyms and variations. Examples: "pump", "heater repair labor", "2 inch PVC pipe"',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (natural language)'
      },
      category: {
        type: 'string',
        description: 'Filter by category',
        enum: ['equipment', 'material', 'labor', 'service']
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return',
        default: 10
      },
      includeAlternatives: {
        type: 'boolean',
        description: 'Include alternative options',
        default: true
      }
    },
    required: ['query']
  },
  
  async handler(params) {
    try {
      const results = await pricebookAI.smartSearch(params);
      
      return {
        success: true,
        count: results.length,
        items: results.map(item => ({
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description,
          price: Number(item.price) || 0,
          category: item.category,
          alternatives: item.alternatives?.map(a => ({
            id: a.id,
            sku: a.sku,
            name: a.name,
            price: Number(a.price) || 0
          }))
        }))
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
