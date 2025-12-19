/**
 * Estimate Tools Index
 * Exports all 15 estimate-related tools
 */

export { generateEstimateFromDescription } from './generate-estimate-from-description.js';
export { searchPricebook } from './search-pricebook.js';
export { addItemsToEstimate } from './add-items-to-estimate.js';
export { getEstimateDetails } from './get-estimate-details.js';

import pg from 'pg';
import { aiEstimator } from '../../services/ai-estimator.js';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

// Tool 5: Clone Estimate
export const cloneEstimate = {
  name: 'clone_estimate',
  description: 'Create a copy of an existing estimate for a new customer or job',
  inputSchema: {
    type: 'object',
    properties: {
      sourceEstimateId: { type: 'number', description: 'Source estimate ID to clone' },
      newCustomerId: { type: 'number', description: 'Customer ID for the new estimate' },
      newJobId: { type: 'number', description: 'Job ID for the new estimate (optional)' },
      adjustPricing: { type: 'boolean', description: 'Recalculate pricing with current rates', default: false }
    },
    required: ['sourceEstimateId', 'newCustomerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [params.sourceEstimateId]);
      if (result.rows.length === 0) return { success: false, error: 'Source estimate not found' };
      
      const source = result.rows[0];
      const newId = Date.now();
      const lastNum = await client.query('SELECT estimate_number FROM st_estimates ORDER BY estimate_number DESC LIMIT 1');
      const nextNumber = lastNum.rows.length > 0 ? parseInt(lastNum.rows[0].estimate_number) + 1 : 10000;
      
      await client.query(`
        INSERT INTO st_estimates (st_id, customer_id, job_id, estimate_number, name, status, subtotal, total, full_data, st_created_on, st_modified_on, local_synced_at)
        VALUES ($1, $2, $3, $4, $5, 'Open', $6, $7, $8, NOW(), NOW(), NOW())
      `, [newId, params.newCustomerId, params.newJobId || null, nextNumber.toString(), `Copy of ${source.name}`, source.subtotal, source.total, source.full_data]);
      
      return { success: true, newEstimateId: newId, estimateNumber: nextNumber.toString(), message: `Cloned estimate #${nextNumber}` };
    } finally { client.release(); }
  }
};

// Tool 6: Update Estimate Status
export const updateEstimateStatus = {
  name: 'update_estimate_status',
  description: 'Update the status of an estimate (Open, Sold, Dismissed)',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Estimate ID' },
      status: { type: 'string', enum: ['Open', 'Sold', 'Dismissed'], description: 'New status' },
      reason: { type: 'string', description: 'Reason for status change (optional)' }
    },
    required: ['estimateId', 'status']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'UPDATE st_estimates SET status = $1, st_modified_on = NOW() WHERE st_id = $2 RETURNING estimate_number',
        [params.status, params.estimateId]
      );
      if (result.rows.length === 0) return { success: false, error: 'Estimate not found' };
      return { success: true, estimateNumber: result.rows[0].estimate_number, newStatus: params.status };
    } finally { client.release(); }
  }
};

// Tool 7: Apply Discount to Estimate
export const applyDiscountToEstimate = {
  name: 'apply_discount_to_estimate',
  description: 'Apply a discount to an estimate',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Estimate ID' },
      discountType: { type: 'string', enum: ['percentage', 'fixed'], description: 'Type of discount' },
      discountAmount: { type: 'number', description: 'Discount amount (percentage or fixed dollar amount)' },
      reason: { type: 'string', description: 'Reason for discount' }
    },
    required: ['estimateId', 'discountType', 'discountAmount']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [params.estimateId]);
      if (result.rows.length === 0) return { success: false, error: 'Estimate not found' };
      
      const estimate = result.rows[0];
      const subtotal = Number(estimate.subtotal) || 0;
      
      let discount;
      if (params.discountType === 'percentage') {
        discount = subtotal * (params.discountAmount / 100);
      } else {
        discount = params.discountAmount;
      }
      
      const newTotal = subtotal - discount + (subtotal * 0.07); // Recalculate with tax
      
      await client.query(
        'UPDATE st_estimates SET total = $1, st_modified_on = NOW() WHERE st_id = $2',
        [newTotal, params.estimateId]
      );
      
      return { success: true, originalSubtotal: subtotal, discount, newTotal, message: `Applied $${discount.toFixed(2)} discount` };
    } finally { client.release(); }
  }
};

// Tool 8: Calculate Estimate Profit
export const calculateEstimateProfit = {
  name: 'calculate_estimate_profit',
  description: 'Calculate the profit margin for an estimate',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Estimate ID' }
    },
    required: ['estimateId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [params.estimateId]);
      if (result.rows.length === 0) return { success: false, error: 'Estimate not found' };
      
      const estimate = result.rows[0];
      const fullData = estimate.full_data || {};
      const items = fullData.items || [];
      
      let materialCost = 0;
      let laborCost = 0;
      
      for (const item of items) {
        const cost = (item.price || 0) * (item.quantity || 1);
        if (item.type === 'material') {
          materialCost += cost / 1.30; // Remove markup to get cost
        } else if (item.type === 'labor') {
          laborCost += cost * 0.4; // Assume 40% labor cost
        }
      }
      
      const totalCost = materialCost + laborCost;
      const revenue = Number(estimate.total) || 0;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      return {
        success: true,
        estimateId: params.estimateId,
        revenue,
        costs: { materials: materialCost, labor: laborCost, total: totalCost },
        profit,
        marginPercent: margin.toFixed(1)
      };
    } finally { client.release(); }
  }
};

// Tool 9: Get Similar Estimates
export const getSimilarEstimates = {
  name: 'get_similar_estimates',
  description: 'Find similar historical estimates for comparison and pricing validation',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Description of work to find similar estimates for' },
      limit: { type: 'number', description: 'Maximum results', default: 5 }
    },
    required: ['description']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT st_id, estimate_number, name, total, status, st_created_on
        FROM st_estimates
        WHERE status = 'Sold'
        ORDER BY st_created_on DESC
        LIMIT $1
      `, [params.limit || 5]);
      
      return {
        success: true,
        count: result.rows.length,
        estimates: result.rows.map(e => ({
          id: Number(e.st_id),
          number: e.estimate_number,
          name: e.name,
          total: Number(e.total),
          status: e.status,
          date: e.st_created_on
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 10: Get Estimate Analytics
export const getEstimateAnalytics = {
  name: 'get_estimate_analytics',
  description: 'Get analytics on estimates: conversion rates, average values, trends',
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: { type: 'number', description: 'Number of days to analyze', default: 30 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    const days = params.dateRange || 30;
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'Sold') as sold,
          COUNT(*) FILTER (WHERE status = 'Dismissed') as dismissed,
          COUNT(*) FILTER (WHERE status = 'Open') as open,
          COALESCE(AVG(total), 0) as avg_value,
          COALESCE(SUM(total) FILTER (WHERE status = 'Sold'), 0) as sold_value
        FROM st_estimates
        WHERE st_created_on >= NOW() - INTERVAL '${days} days'
      `);
      
      const data = result.rows[0];
      const total = Number(data.total);
      const sold = Number(data.sold);
      
      return {
        success: true,
        dateRange: `Last ${days} days`,
        metrics: {
          total,
          sold,
          dismissed: Number(data.dismissed),
          open: Number(data.open),
          conversionRate: total > 0 ? ((sold / total) * 100).toFixed(1) + '%' : '0%',
          avgValue: Number(data.avg_value).toFixed(2),
          totalSoldValue: Number(data.sold_value)
        }
      };
    } finally { client.release(); }
  }
};

// Tool 11: Delete Estimate Item
export const deleteEstimateItem = {
  name: 'delete_estimate_item',
  description: 'Remove an item from an estimate by SKU or index',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Estimate ID' },
      sku: { type: 'string', description: 'SKU of item to remove' },
      itemIndex: { type: 'number', description: 'Index of item to remove (0-based)' }
    },
    required: ['estimateId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [params.estimateId]);
      if (result.rows.length === 0) return { success: false, error: 'Estimate not found' };
      
      const estimate = result.rows[0];
      const fullData = estimate.full_data || {};
      let items = fullData.items || [];
      
      let removedItem;
      if (params.sku) {
        const idx = items.findIndex(i => i.sku === params.sku);
        if (idx === -1) return { success: false, error: 'Item not found' };
        removedItem = items.splice(idx, 1)[0];
      } else if (params.itemIndex !== undefined) {
        if (params.itemIndex < 0 || params.itemIndex >= items.length) return { success: false, error: 'Invalid index' };
        removedItem = items.splice(params.itemIndex, 1)[0];
      } else {
        return { success: false, error: 'Either sku or itemIndex required' };
      }
      
      const pricing = aiEstimator.calculatePricing(items);
      
      await client.query(
        'UPDATE st_estimates SET subtotal = $1, total = $2, full_data = $3, st_modified_on = NOW() WHERE st_id = $4',
        [pricing.subtotal, pricing.total, JSON.stringify({ ...fullData, items, pricing }), params.estimateId]
      );
      
      return { success: true, removedItem: removedItem?.description, newTotal: pricing.total };
    } finally { client.release(); }
  }
};

// Tool 12: Send Estimate to Customer
export const sendEstimateToCustomer = {
  name: 'send_estimate_to_customer',
  description: 'Send an estimate to the customer via email or SMS',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Estimate ID' },
      method: { type: 'string', enum: ['email', 'sms', 'both'], description: 'Delivery method' },
      message: { type: 'string', description: 'Custom message to include' }
    },
    required: ['estimateId', 'method']
  },
  async handler(params) {
    // This would integrate with messaging system
    return {
      success: true,
      estimateId: params.estimateId,
      method: params.method,
      message: `Estimate would be sent via ${params.method}. Integration pending.`
    };
  }
};

// Tool 13: Compare Estimates
export const compareEstimates = {
  name: 'compare_estimates',
  description: 'Compare two or more estimates side by side',
  inputSchema: {
    type: 'object',
    properties: {
      estimateIds: { type: 'array', items: { type: 'number' }, description: 'Array of estimate IDs to compare' }
    },
    required: ['estimateIds']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'SELECT st_id, estimate_number, name, status, subtotal, total, st_created_on FROM st_estimates WHERE st_id = ANY($1::bigint[])',
        [params.estimateIds]
      );
      
      return {
        success: true,
        estimates: result.rows.map(e => ({
          id: Number(e.st_id),
          number: e.estimate_number,
          name: e.name,
          status: e.status,
          subtotal: Number(e.subtotal),
          total: Number(e.total),
          date: e.st_created_on
        })),
        comparison: {
          avgTotal: result.rows.reduce((s, e) => s + Number(e.total), 0) / result.rows.length,
          minTotal: Math.min(...result.rows.map(e => Number(e.total))),
          maxTotal: Math.max(...result.rows.map(e => Number(e.total)))
        }
      };
    } finally { client.release(); }
  }
};

// Tool 14: Generate Estimate Variations
export const generateEstimateVariations = {
  name: 'generate_estimate_variations',
  description: 'Generate good/better/best variations of an estimate',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: { type: 'number', description: 'Base estimate ID' }
    },
    required: ['estimateId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [params.estimateId]);
      if (result.rows.length === 0) return { success: false, error: 'Estimate not found' };
      
      const estimate = result.rows[0];
      const baseTotal = Number(estimate.total) || 0;
      
      return {
        success: true,
        variations: [
          { tier: 'Good', description: 'Basic option', total: baseTotal * 0.85, savings: baseTotal * 0.15 },
          { tier: 'Better', description: 'Standard option (current)', total: baseTotal, savings: 0 },
          { tier: 'Best', description: 'Premium option with upgrades', total: baseTotal * 1.25, additionalValue: 'Extended warranty, premium materials' }
        ]
      };
    } finally { client.release(); }
  }
};

// Tool 15: Build Interactive Estimate
export const buildInteractiveEstimate = {
  name: 'build_interactive_estimate',
  description: 'Build an estimate step-by-step by adding specific items with SKUs',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      jobId: { type: 'number', description: 'Job ID (optional)' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            quantity: { type: 'number' },
            priceOverride: { type: 'number' }
          },
          required: ['sku', 'quantity']
        },
        description: 'Array of items with SKU and quantity'
      },
      name: { type: 'string', description: 'Estimate name' }
    },
    required: ['customerId', 'items']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Look up items from pricebook
      const items = [];
      for (const item of params.items) {
        const result = await client.query(`
          SELECT code as sku, description, price FROM pb_equipment WHERE code = $1
          UNION SELECT code, description, price FROM pb_materials WHERE code = $1
          UNION SELECT code, description, price FROM pb_services WHERE code = $1
          LIMIT 1
        `, [item.sku]);
        
        if (result.rows.length > 0) {
          items.push({
            sku: result.rows[0].sku,
            description: result.rows[0].description,
            price: item.priceOverride || Number(result.rows[0].price) || 0,
            quantity: item.quantity,
            type: 'material'
          });
        }
      }
      
      if (items.length === 0) {
        return { success: false, error: 'No valid items found' };
      }
      
      const pricing = aiEstimator.calculatePricing(items);
      
      // Create estimate
      const newId = Date.now();
      const lastNum = await client.query('SELECT estimate_number FROM st_estimates ORDER BY estimate_number DESC LIMIT 1');
      const nextNumber = lastNum.rows.length > 0 ? parseInt(lastNum.rows[0].estimate_number) + 1 : 10000;
      
      await client.query(`
        INSERT INTO st_estimates (st_id, customer_id, job_id, estimate_number, name, status, subtotal, total, full_data, st_created_on, st_modified_on, local_synced_at)
        VALUES ($1, $2, $3, $4, $5, 'Open', $6, $7, $8, NOW(), NOW(), NOW())
      `, [newId, params.customerId, params.jobId || null, nextNumber.toString(), params.name || `Estimate ${nextNumber}`, pricing.subtotal, pricing.total, JSON.stringify({ items, pricing })]);
      
      return {
        success: true,
        estimateId: newId,
        estimateNumber: nextNumber.toString(),
        itemCount: items.length,
        total: pricing.total,
        message: `Created estimate #${nextNumber} with ${items.length} items for $${pricing.total.toFixed(2)}`
      };
    } finally { client.release(); }
  }
};
