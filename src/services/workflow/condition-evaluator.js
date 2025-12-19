/**
 * Condition Evaluator
 * Evaluates workflow conditions and expressions
 */

import pg from 'pg';
import { createLogger } from '../../lib/logger.js';

const { Pool } = pg;
const logger = createLogger('condition-evaluator');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

/**
 * Evaluate a condition string against workflow instance
 * @param {string} condition - Condition expression (e.g., "estimate.status == 'Sold'")
 * @param {object} workflowInstance - The workflow instance
 * @returns {Promise<boolean>}
 */
export async function evaluateCondition(condition, workflowInstance) {
  try {
    // Get current entity state
    const entity = await getEntityCurrentState(
      workflowInstance.entity_type,
      workflowInstance.entity_id
    );

    // Check customer opt-out status
    const customerOptedOut = await isCustomerOptedOut(workflowInstance.customer_id);

    // Build evaluation context
    const context = {
      estimate: workflowInstance.entity_type === 'estimate' ? entity : null,
      job: workflowInstance.entity_type === 'job' ? entity : null,
      invoice: workflowInstance.entity_type === 'invoice' ? entity : null,
      workflow: {
        message_count: workflowInstance.message_count || 0
      },
      customer: {
        opted_out: customerOptedOut
      }
    };

    // Evaluate the expression
    return evaluateExpression(condition, context);

  } catch (error) {
    logger.error('Error evaluating condition', { 
      condition, 
      error: error.message 
    });
    return false;
  }
}

/**
 * Get current state of an entity from database
 */
async function getEntityCurrentState(entityType, entityId) {
  const client = await getPool().connect();
  try {
    let result;
    switch (entityType) {
      case 'estimate':
        result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [entityId]);
        break;
      case 'job':
        result = await client.query('SELECT * FROM st_jobs WHERE st_id = $1', [entityId]);
        break;
      case 'invoice':
        result = await client.query('SELECT * FROM st_invoices WHERE st_id = $1', [entityId]);
        break;
      default:
        return null;
    }
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Check if customer has opted out of communications
 */
async function isCustomerOptedOut(customerId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT sms_opted_out, email_opted_out 
      FROM customer_communication_preferences 
      WHERE customer_id = $1
    `, [customerId]);
    
    if (result.rows.length === 0) {
      return false;
    }
    
    return result.rows[0].sms_opted_out || result.rows[0].email_opted_out;
  } catch (error) {
    // Table might not exist or other error - assume not opted out
    return false;
  } finally {
    client.release();
  }
}

/**
 * Evaluate a simple expression
 * Supports: ==, !=, >, <, >=, <=
 * Example: "estimate.status == 'Sold'"
 */
function evaluateExpression(expression, context) {
  // Handle common stop conditions
  if (expression === "estimate.status == 'Sold'") {
    return context.estimate?.status === 'Sold';
  }
  
  if (expression === "estimate.status == 'Dismissed'") {
    return context.estimate?.status === 'Dismissed';
  }
  
  if (expression === "job.job_status == 'Completed'") {
    return context.job?.job_status === 'Completed';
  }
  
  if (expression === "invoice.status == 'Paid'") {
    return context.invoice?.status === 'Paid';
  }
  
  if (expression === 'customer.opted_out == true') {
    return context.customer?.opted_out === true;
  }

  // Parse expression
  const operators = ['==', '!=', '>=', '<=', '>', '<'];
  let operator = null;
  let parts = [];

  for (const op of operators) {
    if (expression.includes(op)) {
      operator = op;
      parts = expression.split(op).map(s => s.trim());
      break;
    }
  }

  if (!operator || parts.length !== 2) {
    logger.warn('Could not parse expression', { expression });
    return false;
  }

  const [left, right] = parts;
  const leftValue = getNestedValue(context, left);
  const rightValue = parseValue(right);

  switch (operator) {
    case '==':
      return leftValue == rightValue;
    case '!=':
      return leftValue != rightValue;
    case '>':
      return leftValue > rightValue;
    case '<':
      return leftValue < rightValue;
    case '>=':
      return leftValue >= rightValue;
    case '<=':
      return leftValue <= rightValue;
    default:
      return false;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Parse a value string into its proper type
 */
function parseValue(str) {
  // Remove quotes
  if ((str.startsWith("'") && str.endsWith("'")) ||
      (str.startsWith('"') && str.endsWith('"'))) {
    return str.slice(1, -1);
  }

  // Parse number
  if (!isNaN(str)) {
    return Number(str);
  }

  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;

  return str;
}

export default {
  evaluateCondition
};
