/**
 * Add Items to Estimate Tool
 * Add items to an existing estimate using natural language
 */

import { aiEstimator } from '../../services/ai-estimator.js';
import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export const addItemsToEstimate = {
  name: 'add_items_to_estimate',
  description: 'Add items to an existing estimate using natural language. Examples: "add electrical upgrade", "add permit and inspection", "add 20 feet of PVC pipe"',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: {
        type: 'number',
        description: 'Estimate ID to add items to'
      },
      items: {
        type: 'string',
        description: 'Natural language description of items to add'
      },
      quantity: {
        type: 'number',
        description: 'Quantity (optional, will be inferred if not provided)'
      }
    },
    required: ['estimateId', 'items']
  },
  
  async handler(params) {
    const client = await getPool().connect();
    
    try {
      // Get existing estimate
      const result = await client.query(
        'SELECT * FROM st_estimates WHERE st_id = $1',
        [params.estimateId]
      );
      
      const estimate = result.rows[0];
      
      if (!estimate) {
        return { success: false, error: 'Estimate not found' };
      }
      
      // Parse new items
      const parsed = await aiEstimator.parseDescription(params.items);
      
      // Find matching pricebook items
      const newItems = await aiEstimator.findMatchingItems(parsed);
      
      // Apply quantity override if provided
      if (params.quantity) {
        newItems.forEach(item => item.quantity = params.quantity);
      }
      
      // Get existing items
      let existingItems = [];
      try {
        existingItems = JSON.parse(estimate.full_data?.items || '[]');
      } catch (e) {
        existingItems = [];
      }
      
      const allItems = [...existingItems, ...newItems];
      
      // Recalculate pricing
      const pricing = aiEstimator.calculatePricing(allItems);
      
      // Update estimate
      await client.query(`
        UPDATE st_estimates 
        SET 
          subtotal = $1,
          total = $2,
          full_data = $3,
          st_modified_on = NOW()
        WHERE st_id = $4
      `, [
        pricing.subtotal,
        pricing.total,
        JSON.stringify({
          ...estimate.full_data,
          items: allItems,
          pricing,
          last_modified: new Date()
        }),
        params.estimateId
      ]);
      
      return {
        success: true,
        estimateId: params.estimateId,
        itemsAdded: newItems.length,
        newItems: newItems.map(i => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          price: i.price
        })),
        newTotal: pricing.total,
        message: `Added ${newItems.length} items. New total: $${pricing.total.toFixed(2)}`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }
};
