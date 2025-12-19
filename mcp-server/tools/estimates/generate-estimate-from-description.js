/**
 * Generate Estimate from Description Tool
 * The most important tool - creates estimates from natural language
 */

import { aiEstimator } from '../../services/ai-estimator.js';

export const generateEstimateFromDescription = {
  name: 'generate_estimate_from_description',
  description: 'Generate a complete estimate from natural language description. Just describe what the customer needs and Claude will build the quote with items, materials, labor, and pricing. Examples: "replace pool heater 400k BTU", "install new variable speed pump", "repair electrical panel"',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: {
        type: 'number',
        description: 'Customer ID'
      },
      jobId: {
        type: 'number',
        description: 'Job ID (optional)'
      },
      description: {
        type: 'string',
        description: 'Natural language description of work needed'
      },
      includeOptions: {
        type: 'boolean',
        description: 'Include suggested add-ons and upgrades',
        default: true
      },
      includeMaterials: {
        type: 'boolean',
        description: 'Automatically include required materials',
        default: true
      },
      applyDiscounts: {
        type: 'boolean',
        description: 'Apply customer-specific discounts',
        default: false
      }
    },
    required: ['customerId', 'description']
  },
  
  async handler(params) {
    try {
      const estimate = await aiEstimator.generateFromDescription(params);
      
      return {
        success: true,
        estimate,
        message: `Generated estimate #${estimate.estimateNumber} for $${estimate.total.toFixed(2)}`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
