/**
 * Database Connection Validator
 * Prevents accidental connections to wrong databases by validating expected tables
 */

import { createLogger } from '../lib/logger.js';

const logger = createLogger('db-validator');

/**
 * Expected tables for each database type
 */
export const DATABASE_SCHEMAS = {
  // Pricebook database (st-pricebook-postgres:5451)
  pricebook: {
    required: [
      'pricebook_categories',
      'pricebook_materials', 
      'pricebook_services',
      'pricebook_equipment',
    ],
    optional: [
      'pricebook_sync_log',
      'pricebook_sync_conflicts',
      'pricebook_changes',
      'pricebook_webhook_subscriptions',
      'chat_sessions',
      'pb_categories',
      'pb_materials',
      'pb_services',
      'pb_equipment',
      'pb_vendors',
    ],
    forbidden: [
      'st_jobs',
      'st_customers',
      'st_estimates',
      'workflow_definitions',
      'messaging_templates',
    ],
  },

  // Automation database (postgres:6432)
  automation: {
    required: [
      'st_jobs',
      'st_customers',
      'st_estimates',
      'st_invoices',
      'workflow_definitions',
      'messaging_templates',
    ],
    optional: [
      'st_appointments',
      'st_business_units',
      'st_employees',
      'st_technicians',
      'st_locations',
      'st_payments',
      'st_campaigns',
      'st_job_types',
      'st_call_reasons',
      'st_tag_types',
      'st_custom_fields',
      'st_installed_equipment',
      'st_sync_log',
      'workflow_instances',
      'workflow_step_executions',
      'messaging_log',
      'ghl_contacts',
      'ghl_opportunities',
      'ghl_sync_log',
      'callrail_calls',
      'callrail_conversion_log',
      'customer_communication_preferences',
      'sync_logs',
      'sync_state',
    ],
    forbidden: [
      'pricebook_categories',
      'pricebook_materials',
      'pricebook_services',
      'pricebook_equipment',
    ],
  },
};

/**
 * Validate database connection matches expected schema
 * @param {Pool|PrismaClient} client - Database client
 * @param {string} expectedType - 'pricebook' or 'automation'
 * @param {object} options - Validation options
 * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateDatabaseConnection(client, expectedType, options = {}) {
  const { strict = false, throwOnError = false } = options;
  const schema = DATABASE_SCHEMAS[expectedType];
  
  if (!schema) {
    throw new Error(`Unknown database type: ${expectedType}. Use 'pricebook' or 'automation'.`);
  }

  const errors = [];
  const warnings = [];

  try {
    // Get list of tables in database
    let tables;
    
    // Handle both pg Pool and Prisma client
    if (client.$queryRaw) {
      // Prisma client
      const result = await client.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      tables = result.map(r => r.table_name);
    } else {
      // pg Pool
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      tables = result.rows.map(r => r.table_name);
    }

    // Check required tables exist
    for (const required of schema.required) {
      if (!tables.includes(required)) {
        errors.push(`Missing required table: ${required}`);
      }
    }

    // Check forbidden tables don't exist
    for (const forbidden of schema.forbidden) {
      if (tables.includes(forbidden)) {
        const msg = `Forbidden table found: ${forbidden} - This suggests wrong database connection!`;
        if (strict) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }

    // Check for unexpected tables
    const allExpected = [...schema.required, ...schema.optional];
    const unexpected = tables.filter(t => !allExpected.includes(t));
    if (unexpected.length > 0) {
      warnings.push(`Unexpected tables: ${unexpected.join(', ')}`);
    }

    // Log results
    if (errors.length > 0) {
      logger.error({ errors, expectedType }, 'Database validation FAILED');
    } else if (warnings.length > 0) {
      logger.warn({ warnings, expectedType }, 'Database validation passed with warnings');
    } else {
      logger.info({ expectedType, tableCount: tables.length }, 'Database validation passed');
    }

    const valid = errors.length === 0;

    if (!valid && throwOnError) {
      throw new Error(`Database validation failed for ${expectedType}: ${errors.join('; ')}`);
    }

    return { valid, errors, warnings };

  } catch (error) {
    if (error.message.includes('Database validation failed')) {
      throw error;
    }
    logger.error({ error: error.message }, 'Database validation error');
    throw new Error(`Failed to validate database: ${error.message}`);
  }
}

/**
 * Validate pricebook database connection
 */
export async function validatePricebookConnection(client, options = {}) {
  return validateDatabaseConnection(client, 'pricebook', options);
}

/**
 * Validate automation database connection
 */
export async function validateAutomationConnection(client, options = {}) {
  return validateDatabaseConnection(client, 'automation', options);
}

/**
 * Get database type from connection string
 * @param {string} connectionString - PostgreSQL connection string
 * @returns {string|null} - 'pricebook', 'automation', or null if unknown
 */
export function inferDatabaseType(connectionString) {
  if (!connectionString) return null;
  
  const url = connectionString.toLowerCase();
  
  // Check by port
  if (url.includes(':5451')) return 'pricebook';
  if (url.includes(':6432')) return 'automation';
  
  // Check by database name
  if (url.includes('/pricebook')) return 'pricebook';
  if (url.includes('/perfectcatch_automation')) return 'automation';
  
  // Check by container/host name
  if (url.includes('st-pricebook-postgres')) return 'pricebook';
  if (url.includes('pricebook_admin@')) return 'pricebook';
  
  return null;
}

/**
 * Middleware to validate database on first query
 * Use with Express apps
 */
export function createValidationMiddleware(pool, expectedType) {
  let validated = false;
  
  return async (req, res, next) => {
    if (!validated) {
      try {
        const result = await validateDatabaseConnection(pool, expectedType, { 
          strict: true, 
          throwOnError: true 
        });
        validated = true;
        logger.info(`Database validated as ${expectedType}`);
      } catch (error) {
        logger.error({ error: error.message }, 'Database validation failed - blocking request');
        return res.status(500).json({
          error: 'Database configuration error',
          message: 'Application is connected to wrong database. Check DATABASE_URL configuration.',
        });
      }
    }
    next();
  };
}

export default {
  validateDatabaseConnection,
  validatePricebookConnection,
  validateAutomationConnection,
  inferDatabaseType,
  createValidationMiddleware,
  DATABASE_SCHEMAS,
};
