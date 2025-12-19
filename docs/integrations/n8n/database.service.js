/**
 * Database Service
 * PostgreSQL connection and query utilities
 */

import pkg from 'pg';
const { Pool } = pkg;
import config from '../config/index.js';
import logger from '../lib/logger.js';

// Create connection pool
const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.maxConnections || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Pool error handler
pool.on('error', (err) => {
  logger.error({ error: err }, 'Unexpected database pool error');
});

// Pool connect event
pool.on('connect', () => {
  logger.debug('New database connection established');
});

/**
 * Execute a query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug({
      query: text,
      duration,
      rows: result.rowCount
    }, 'Database query executed');
    
    return result;
  } catch (error) {
    logger.error({
      error,
      query: text,
      params
    }, 'Database query error');
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  const client = await pool.connect();
  
  // Add convenience methods
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout to prevent hanging connections
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for more than 30 seconds!');
  }, 30000);
  
  // Override release to clear timeout
  client.release = () => {
    clearTimeout(timeout);
    release();
  };
  
  client.query = query;
  
  return client;
}

/**
 * Execute queries within a transaction
 * @param {Function} callback - Async function that receives client
 * @returns {Promise<*>} Result of callback
 */
async function transaction(callback) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as current_time');
    logger.info({ 
      currentTime: result.rows[0].current_time 
    }, 'Database connection test successful');
    return true;
  } catch (error) {
    logger.error({ error }, 'Database connection test failed');
    return false;
  }
}

/**
 * Close all connections in the pool
 * @returns {Promise<void>}
 */
async function close() {
  logger.info('Closing database connection pool');
  await pool.end();
}

/**
 * Get pool statistics
 * @returns {Object} Pool statistics
 */
function getStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount
  };
}

export const db = {
  query,
  getClient,
  transaction,
  testConnection,
  close,
  getStats,
  pool
};

export default db;
