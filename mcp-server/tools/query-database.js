/**
 * Database Query Tool
 * Execute SQL queries on the ServiceTitan mirror database
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection pool (lazy initialized)
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured. Set SERVICETITAN_DATABASE_URL or DATABASE_URL.');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

// Allowed tables for security (whitelist)
const ALLOWED_TABLES = [
  // ServiceTitan tables
  'st_customers', 'st_locations', 'st_business_units', 'st_jobs', 
  'st_estimates', 'st_appointments', 'st_invoices', 'st_payments',
  'st_technicians', 'st_installed_equipment', 'st_campaigns',
  'st_call_reasons', 'st_job_types', 'st_tag_types', 'st_custom_fields',
  'st_sync_log',
  // Workflow tables
  'workflow_definitions', 'workflow_instances', 'workflow_step_executions',
  'customer_communication_preferences',
  // CallRail tables
  'callrail_calls', 'callrail_conversion_log',
  // Messaging tables
  'messaging_log', 'messaging_templates',
  // Raw ServiceTitan tables
  'raw_st_customers', 'raw_st_locations', 'raw_st_customer_contacts', 'raw_st_location_contacts',
  'raw_st_jobs', 'raw_st_appointments', 'raw_st_invoices', 'raw_st_payments',
  'raw_st_technicians', 'raw_st_employees', 'raw_st_business_units',
  'raw_st_job_types', 'raw_st_tag_types', 'raw_st_campaigns', 'raw_st_estimates',
  'raw_st_installed_equipment', 'raw_st_teams', 'raw_st_zones', 'raw_st_appointment_assignments',
  // Raw Pricebook tables
  'raw_st_pricebook_services', 'raw_st_pricebook_materials', 'raw_st_pricebook_equipment',
  'raw_st_pricebook_categories',
  // Sync state
  'raw_sync_state',
  // Views
  'v_active_jobs', 'v_open_estimates', 'v_outstanding_invoices',
  'v_active_workflows', 'v_workflow_performance', 'v_pending_workflow_actions',
  'v_unmatched_calls', 'v_conversion_funnel', 'v_pending_gads_conversions',
  'v_call_attribution_by_campaign', 'v_messaging_daily_summary',
  'v_template_performance', 'v_customer_communication_history', 'v_failed_messages',
];

// Dangerous keywords to block
const BLOCKED_KEYWORDS = [
  'DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE',
  'GRANT', 'REVOKE', 'EXECUTE', 'COPY', 'pg_', 'information_schema'
];

/**
 * Validate query for safety
 */
function validateQuery(query) {
  const upperQuery = query.toUpperCase().trim();
  
  // Must be a SELECT query
  if (!upperQuery.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are allowed');
  }
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (upperQuery.includes(keyword.toUpperCase())) {
      throw new Error(`Query contains blocked keyword: ${keyword}`);
    }
  }
  
  return true;
}

/**
 * Execute a read-only SQL query
 */
export async function queryDatabase(query, params = []) {
  validateQuery(query);
  
  const client = await getPool().connect();
  try {
    // Set statement timeout for safety
    await client.query('SET statement_timeout = 30000'); // 30 seconds max
    
    const result = await client.query(query, params);
    return {
      success: true,
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields?.map(f => ({ name: f.name, dataType: f.dataTypeID })),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Get table schema information
 */
export async function getTableSchema(tableName) {
  if (!ALLOWED_TABLES.includes(tableName.toLowerCase())) {
    throw new Error(`Table '${tableName}' is not in the allowed list`);
  }
  
  const query = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `;
  
  const client = await getPool().connect();
  try {
    const result = await client.query(query, [tableName.toLowerCase()]);
    return {
      success: true,
      tableName,
      columns: result.rows,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * List available tables
 */
export async function listTables() {
  return {
    success: true,
    tables: ALLOWED_TABLES,
    categories: {
      servicetitan: ALLOWED_TABLES.filter(t => t.startsWith('st_')),
      raw_servicetitan: ALLOWED_TABLES.filter(t => t.startsWith('raw_st_') && !t.includes('pricebook')),
      raw_pricebook: ALLOWED_TABLES.filter(t => t.startsWith('raw_st_pricebook_')),
      workflow: ALLOWED_TABLES.filter(t => t.startsWith('workflow_') || t === 'customer_communication_preferences'),
      callrail: ALLOWED_TABLES.filter(t => t.startsWith('callrail_')),
      messaging: ALLOWED_TABLES.filter(t => t.startsWith('messaging_')),
      views: ALLOWED_TABLES.filter(t => t.startsWith('v_')),
    },
  };
}

/**
 * Test database connection
 */
export async function testConnection() {
  try {
    const client = await getPool().connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as database');
    client.release();
    return {
      success: true,
      connected: true,
      ...result.rows[0],
    };
  } catch (error) {
    return {
      success: false,
      connected: false,
      error: error.message,
    };
  }
}

// Tool definition for MCP
export const toolDefinition = {
  name: 'query_database',
  description: 'Execute read-only SQL queries on the ServiceTitan mirror database. Supports querying customers, jobs, estimates, workflows, messaging logs, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL SELECT query to execute (read-only)',
      },
      params: {
        type: 'array',
        items: { type: 'string' },
        description: 'Query parameters for parameterized queries (optional)',
      },
    },
    required: ['query'],
  },
};

export const listTablesDefinition = {
  name: 'list_database_tables',
  description: 'List all available database tables that can be queried',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const testConnectionDefinition = {
  name: 'test_database_connection',
  description: 'Test the database connection',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export default {
  queryDatabase,
  getTableSchema,
  listTables,
  testConnection,
  toolDefinition,
  listTablesDefinition,
  testConnectionDefinition,
};
