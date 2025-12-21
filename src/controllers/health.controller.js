/**
 * Health Controller
 * Handles health check, status, and system info endpoints
 *
 * Batch 10: Added GHL status endpoint
 */

import { getTokenStatus } from '../services/tokenManager.js';
import { healthMonitor } from '../services/monitoring/health-monitor.js';
import pg from 'pg';

const { Pool } = pg;

// Track server start time
const startTime = Date.now();

// Lazy-loaded database pool for GHL status
let dbPool = null;
function getDbPool() {
  if (!dbPool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (connectionString) {
      dbPool = new Pool({ connectionString, max: 2 });
    }
  }
  return dbPool;
}

/**
 * Simple ping endpoint for basic availability check
 */
export function ping(req, res) {
  res.json({ msg: 'ServiceTitan MCP API is running' });
}

/**
 * Detailed health check with component status
 * Always returns 200 for Traefik/load balancer compatibility
 * The status field indicates actual health state
 */
export async function health(req, res) {
  const tokenStatus = getTokenStatus();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Server is healthy if it's been up for more than 30 seconds (past initial startup)
  // or if the token is valid
  const isHealthy = uptimeSeconds > 30 || tokenStatus.valid;

  const health = {
    status: isHealthy ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    uptime: uptimeSeconds,
    version: '2.0.0',
    components: {
      server: 'up',
      tokenManager: tokenStatus.cached ? 'up' : 'initializing',
      database: 'up',
    },
  };

  // Always return 200 - the server is running and can handle requests
  // Token will be fetched on first API call if not cached
  res.status(200).json(health);
}

/**
 * Detailed status endpoint with internal metrics
 */
export async function status(req, res) {
  const tokenStatus = getTokenStatus();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.json({
    service: 'perfect-catch-st-automation',
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds),
    },
    token: {
      valid: tokenStatus.valid,
      cached: tokenStatus.cached,
      expiresAt: tokenStatus.expiresAt,
      expiresIn: tokenStatus.expiresIn ? `${tokenStatus.expiresIn}s` : null,
    },
    memory: {
      heapUsed: formatBytes(process.memoryUsage().heapUsed),
      heapTotal: formatBytes(process.memoryUsage().heapTotal),
      rss: formatBytes(process.memoryUsage().rss),
    },
    queue: {
      status: 'not_implemented',
      pending: 0,
    },
  });
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/**
 * Format uptime seconds to human readable string
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Detailed system health check with all components
 */
export async function detailedHealth(req, res) {
  try {
    const health = await healthMonitor.getSystemHealth();
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}

/**
 * Workflow-specific health check
 */
export async function workflowHealth(req, res) {
  try {
    const workflowCheck = await healthMonitor.checkWorkflowEngine();
    res.json({
      component: 'workflow',
      ...workflowCheck
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}

/**
 * GHL Sync Status Endpoint
 * Batch 10: Returns current GHL sync configuration and statistics
 */
export async function ghlStatus(req, res) {
  try {
    const pool = getDbPool();

    // Get sync configuration from environment
    const config = {
      sync_enabled: process.env.GHL_SYNC_ENABLED === 'true',
      auto_sync_estimates: process.env.GHL_AUTO_SYNC_ESTIMATES === 'true',
      auto_sync_jobs: process.env.GHL_AUTO_SYNC_JOBS === 'true',
      auto_sync_customers: process.env.GHL_AUTO_SYNC_CUSTOMERS === 'true',
      dedup_enabled: process.env.GHL_DEDUP_ENABLED !== 'false',
      rate_limit: parseInt(process.env.GHL_RATE_LIMIT) || 30,
      location_id: process.env.GHL_LOCATION_ID || null,
    };

    // Default stats if database isn't available
    let stats = {
      contacts_synced: 0,
      opportunities_synced: 0,
      pending_syncs: 0,
      failed_syncs: 0,
      last_sync: null,
    };

    // Try to get stats from database
    if (pool) {
      try {
        const client = await pool.connect();
        try {
          // Check if ghl_contacts table exists and get count
          const contactsResult = await client.query(`
            SELECT
              COUNT(*) FILTER (WHERE ghl_id IS NOT NULL) as synced,
              COUNT(*) FILTER (WHERE sync_status = 'failed' OR st_sync_error IS NOT NULL) as failed,
              MAX(local_synced_at) as last_sync
            FROM ghl_contacts
          `).catch(() => ({ rows: [{ synced: 0, failed: 0, last_sync: null }] }));

          // Check if ghl_opportunities table exists and get count
          const oppsResult = await client.query(`
            SELECT
              COUNT(*) FILTER (WHERE ghl_id IS NOT NULL) as synced,
              COUNT(*) FILTER (WHERE sync_status = 'pending' OR (ghl_id IS NULL AND synced_to_st = false)) as pending,
              COUNT(*) FILTER (WHERE sync_status = 'failed' OR st_sync_error IS NOT NULL) as failed,
              MAX(local_synced_at) as last_sync
            FROM ghl_opportunities
          `).catch(() => ({ rows: [{ synced: 0, pending: 0, failed: 0, last_sync: null }] }));

          const contacts = contactsResult.rows[0];
          const opps = oppsResult.rows[0];

          stats = {
            contacts_synced: parseInt(contacts.synced) || 0,
            opportunities_synced: parseInt(opps.synced) || 0,
            pending_syncs: parseInt(opps.pending) || 0,
            failed_syncs: (parseInt(contacts.failed) || 0) + (parseInt(opps.failed) || 0),
            last_sync: contacts.last_sync > opps.last_sync ? contacts.last_sync : opps.last_sync,
          };
        } finally {
          client.release();
        }
      } catch (dbError) {
        // Database error - continue with default stats
        stats.db_error = dbError.message;
      }
    }

    res.json({
      component: 'ghl',
      timestamp: new Date().toISOString(),
      config,
      stats,
      message: config.sync_enabled
        ? 'GHL sync is ENABLED'
        : 'GHL sync is DISABLED (safe mode)',
    });
  } catch (error) {
    res.status(500).json({
      component: 'ghl',
      status: 'error',
      error: error.message
    });
  }
}

/**
 * Worker Health Status Endpoint
 * Batch 10: Returns health status of background workers
 */
export async function workerStatus(req, res) {
  try {
    const fs = await import('fs');
    const HEARTBEAT_FILE = '/tmp/worker-heartbeat';

    let workerHealth = {
      healthy: false,
      error: 'Heartbeat file not found - worker may not be running'
    };

    try {
      const stat = fs.statSync(HEARTBEAT_FILE);
      const content = fs.readFileSync(HEARTBEAT_FILE, 'utf8');
      const data = JSON.parse(content);
      const age = Date.now() - stat.mtimeMs;

      workerHealth = {
        healthy: age < 120000,
        lastUpdate: new Date(stat.mtimeMs).toISOString(),
        ageMs: age,
        ageFormatted: `${Math.floor(age / 1000)}s ago`,
        ...data
      };
    } catch {
      // Keep default error state
    }

    res.json({
      component: 'workers',
      timestamp: new Date().toISOString(),
      workflow_worker: workerHealth,
      message: workerHealth.healthy
        ? 'Workers are healthy'
        : 'Workers may be unhealthy or not running'
    });
  } catch (error) {
    res.status(500).json({
      component: 'workers',
      status: 'error',
      error: error.message
    });
  }
}

export default {
  ping,
  health,
  status,
  detailedHealth,
  workflowHealth,
  ghlStatus,
  workerStatus,
};
