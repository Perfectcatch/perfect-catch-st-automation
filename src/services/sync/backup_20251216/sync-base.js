/**
 * Base Sync Module
 * Shared utilities for all sync modules
 */

import pg from 'pg';
import { createLogger } from '../../lib/logger.js';

const { Pool } = pg;

// Shared database pool
let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 10 });
  }
  return pool;
}

/**
 * Start a sync log entry
 */
export async function startSyncLog(module, syncType, triggeredBy = 'scheduled') {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      INSERT INTO st_sync_log (module, sync_type, status, triggered_by, started_at)
      VALUES ($1, $2, 'started', $3, NOW())
      RETURNING id
    `, [module, syncType, triggeredBy]);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Complete a sync log entry
 */
export async function completeSyncLog(id, stats, startTime) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE st_sync_log 
      SET status = 'completed',
          records_fetched = $2,
          records_created = $3,
          records_updated = $4,
          records_failed = $5,
          completed_at = NOW(),
          duration_ms = $6
      WHERE id = $1
    `, [
      id,
      stats.fetched || 0,
      stats.created || 0,
      stats.updated || 0,
      stats.failed || 0,
      Date.now() - startTime
    ]);
  } finally {
    client.release();
  }
}

/**
 * Fail a sync log entry
 */
export async function failSyncLog(id, error) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE st_sync_log 
      SET status = 'failed',
          error_message = $2,
          completed_at = NOW()
      WHERE id = $1
    `, [id, error.message]);
  } finally {
    client.release();
  }
}

/**
 * Rate limiting delay between API pages
 */
export function delay(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert BigInt for JSON serialization
 */
export function serializeBigInt(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

export default {
  getPool,
  startSyncLog,
  completeSyncLog,
  failSyncLog,
  delay,
  serializeBigInt
};
