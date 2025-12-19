/**
 * Get Estimate Details Tool
 * Retrieve complete estimate information
 */

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

export const getEstimateDetails = {
  name: 'get_estimate_details',
  description: 'Get complete details for an estimate including items, pricing, and customer info',
  inputSchema: {
    type: 'object',
    properties: {
      estimateId: {
        type: 'number',
        description: 'Estimate ID'
      },
      estimateNumber: {
        type: 'string',
        description: 'Estimate number (alternative to ID)'
      }
    }
  },
  
  async handler(params) {
    const client = await getPool().connect();
    
    try {
      let query, queryParams;
      
      if (params.estimateId) {
        query = `
          SELECT e.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
          FROM st_estimates e
          LEFT JOIN st_customers c ON e.customer_id = c.st_id
          WHERE e.st_id = $1
        `;
        queryParams = [params.estimateId];
      } else if (params.estimateNumber) {
        query = `
          SELECT e.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
          FROM st_estimates e
          LEFT JOIN st_customers c ON e.customer_id = c.st_id
          WHERE e.estimate_number = $1
        `;
        queryParams = [params.estimateNumber];
      } else {
        return { success: false, error: 'Either estimateId or estimateNumber is required' };
      }
      
      const result = await client.query(query, queryParams);
      const estimate = result.rows[0];
      
      if (!estimate) {
        return { success: false, error: 'Estimate not found' };
      }
      
      // Parse full_data if it exists
      let items = [];
      let pricing = {};
      try {
        const fullData = estimate.full_data || {};
        items = fullData.items || [];
        pricing = fullData.pricing || {};
      } catch (e) {
        // Ignore parse errors
      }
      
      return {
        success: true,
        estimate: {
          id: Number(estimate.st_id),
          estimateNumber: estimate.estimate_number,
          name: estimate.name,
          status: estimate.status,
          subtotal: Number(estimate.subtotal) || 0,
          total: Number(estimate.total) || 0,
          createdOn: estimate.st_created_on,
          modifiedOn: estimate.st_modified_on,
          customer: {
            id: Number(estimate.customer_id),
            name: estimate.customer_name,
            email: estimate.customer_email,
            phone: estimate.customer_phone
          },
          items: items.map(i => ({
            sku: i.sku,
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.price,
            lineTotal: (i.price || 0) * (i.quantity || 1),
            type: i.type,
            category: i.category
          })),
          pricing: {
            subtotalMaterials: pricing.subtotalMaterials || 0,
            subtotalLabor: pricing.subtotalLabor || 0,
            markup: pricing.materialsMarkup || 0,
            discount: pricing.discount || 0,
            tax: pricing.tax || 0,
            total: pricing.total || Number(estimate.total) || 0
          }
        }
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
