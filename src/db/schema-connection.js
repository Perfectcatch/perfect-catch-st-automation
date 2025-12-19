/**
 * Schema-Aware Database Connection Module
 * Consolidated PostgreSQL with schema-based separation
 * 
 * Schemas:
 * - servicetitan: ST jobs, customers, invoices, estimates, employees
 * - pricebook: services, materials, equipment, categories, vendors
 * - automation: workflows, messaging templates
 * - integrations: GHL contacts/opportunities, CallRail
 * - public: shared utilities (sync_state, audit_logs)
 */

import pg from 'pg';
import { createLogger } from '../lib/logger.js';

const { Pool } = pg;
const logger = createLogger('db-schema');

// Schema names
export const SCHEMAS = {
  SERVICETITAN: 'servicetitan',
  PRICEBOOK: 'pricebook',
  AUTOMATION: 'automation',
  INTEGRATIONS: 'integrations',
  PUBLIC: 'public',
};

// Main database pool
let pool = null;

/**
 * Get or create the database pool
 */
export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.SERVICETITAN_DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL or SERVICETITAN_DATABASE_URL must be set');
    }
    
    pool = new Pool({
      connectionString,
      max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    pool.on('error', (err) => {
      logger.error({ error: err.message }, 'Unexpected pool error');
    });
    
    logger.info('Database pool created');
  }
  return pool;
}

/**
 * Execute query with specific schema context
 * @param {string} schema - Schema name
 * @param {string} sql - SQL query
 * @param {any[]} params - Query parameters
 */
export async function queryWithSchema(schema, sql, params = []) {
  const client = await getPool().connect();
  try {
    await client.query(`SET search_path TO ${schema}, public`);
    const result = await client.query(sql, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute raw query on default search path
 */
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

/**
 * Get a client with transaction support
 */
export async function getClient() {
  return getPool().connect();
}

// ============================================
// Schema-specific query helpers
// ============================================

export const servicetitan = {
  query: (sql, params) => queryWithSchema(SCHEMAS.SERVICETITAN, sql, params),
  
  // Convenience methods
  async getJobs(where = '', params = []) {
    const sql = `SELECT * FROM st_jobs ${where ? 'WHERE ' + where : ''} ORDER BY created_on DESC`;
    return this.query(sql, params);
  },
  
  async getCustomers(where = '', params = []) {
    const sql = `SELECT * FROM st_customers ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async getInvoices(where = '', params = []) {
    const sql = `SELECT * FROM st_invoices ${where ? 'WHERE ' + where : ''} ORDER BY created_on DESC`;
    return this.query(sql, params);
  },
  
  async getEstimates(where = '', params = []) {
    const sql = `SELECT * FROM st_estimates ${where ? 'WHERE ' + where : ''} ORDER BY created_on DESC`;
    return this.query(sql, params);
  },
  
  async getEmployees(where = '', params = []) {
    const sql = `SELECT * FROM st_employees ${where ? 'WHERE ' + where : ''}`;
    return this.query(sql, params);
  },
};

export const pricebook = {
  query: (sql, params) => queryWithSchema(SCHEMAS.PRICEBOOK, sql, params),
  
  async getMaterials(where = '', params = []) {
    const sql = `SELECT * FROM pricebook_materials ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async getServices(where = '', params = []) {
    const sql = `SELECT * FROM pricebook_services ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async getEquipment(where = '', params = []) {
    const sql = `SELECT * FROM pricebook_equipment ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async getCategories(where = '', params = []) {
    const sql = `SELECT * FROM pricebook_categories ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async searchItems(searchTerm, limit = 50) {
    const sql = `
      SELECT 'material' as type, st_id, code, name, price, description 
      FROM pricebook_materials WHERE name ILIKE $1 OR code ILIKE $1
      UNION ALL
      SELECT 'service' as type, st_id, code, name, price, description 
      FROM pricebook_services WHERE name ILIKE $1 OR code ILIKE $1
      UNION ALL
      SELECT 'equipment' as type, st_id, code, name, price, description 
      FROM pricebook_equipment WHERE name ILIKE $1 OR code ILIKE $1
      LIMIT $2
    `;
    return this.query(sql, [`%${searchTerm}%`, limit]);
  },
};

export const automation = {
  query: (sql, params) => queryWithSchema(SCHEMAS.AUTOMATION, sql, params),
  
  async getWorkflows(where = '', params = []) {
    const sql = `SELECT * FROM workflow_definitions ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
  
  async getWorkflowInstances(workflowId) {
    const sql = `SELECT * FROM workflow_instances WHERE workflow_definition_id = $1 ORDER BY created_at DESC`;
    return this.query(sql, [workflowId]);
  },
  
  async getMessageTemplates(where = '', params = []) {
    const sql = `SELECT * FROM messaging_templates ${where ? 'WHERE ' + where : ''} ORDER BY name`;
    return this.query(sql, params);
  },
};

export const integrations = {
  query: (sql, params) => queryWithSchema(SCHEMAS.INTEGRATIONS, sql, params),
  
  async getGhlContacts(where = '', params = []) {
    const sql = `SELECT * FROM ghl_contacts ${where ? 'WHERE ' + where : ''} ORDER BY local_synced_at DESC`;
    return this.query(sql, params);
  },
  
  async getGhlOpportunities(where = '', params = []) {
    const sql = `SELECT * FROM ghl_opportunities ${where ? 'WHERE ' + where : ''} ORDER BY ghl_created_at DESC`;
    return this.query(sql, params);
  },
  
  async getCallrailCalls(where = '', params = []) {
    const sql = `SELECT * FROM callrail_calls ${where ? 'WHERE ' + where : ''} ORDER BY created_at DESC`;
    return this.query(sql, params);
  },
};

// ============================================
// Health check and utilities
// ============================================

/**
 * Check database connection and schema availability
 */
export async function checkConnection() {
  try {
    const result = await query('SELECT NOW() as time, current_database() as db');
    logger.info({ db: result.rows[0].db }, 'Database connected');
    
    // Check schemas exist
    const schemas = await query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name IN ('servicetitan', 'pricebook', 'automation', 'integrations')
      ORDER BY schema_name
    `);
    
    const schemaNames = schemas.rows.map(r => r.schema_name);
    logger.info({ schemas: schemaNames }, 'Available schemas');
    
    // Check table counts per schema
    const tableCounts = await query(`
      SELECT schemaname as schema, count(*) as tables
      FROM pg_stat_user_tables 
      WHERE schemaname IN ('servicetitan', 'pricebook', 'automation', 'integrations', 'public')
      GROUP BY schemaname
      ORDER BY schemaname
    `);
    
    logger.info({ tableCounts: tableCounts.rows }, 'Schema table counts');
    
    return {
      connected: true,
      database: result.rows[0].db,
      schemas: schemaNames,
      tableCounts: tableCounts.rows,
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Database connection check failed');
    return { connected: false, error: error.message };
  }
}

/**
 * Close the database pool
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

// Default export with all schema helpers
export default {
  query,
  queryWithSchema,
  getPool,
  getClient,
  closePool,
  checkConnection,
  servicetitan,
  pricebook,
  automation,
  integrations,
  SCHEMAS,
};
