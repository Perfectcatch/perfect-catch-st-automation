/**
 * Health Controller
 * Handles health check, status, and system info endpoints
 */

import { getTokenStatus } from '../services/tokenManager.js';

// Track server start time
const startTime = Date.now();

/**
 * Simple ping endpoint for basic availability check
 */
export function ping(req, res) {
  res.json({ msg: 'ServiceTitan MCP API is running' });
}

/**
 * Detailed health check with component status
 */
export async function health(req, res) {
  const tokenStatus = getTokenStatus();

  const health = {
    status: tokenStatus.valid ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: '2.0.0',
    components: {
      server: 'up',
      tokenManager: tokenStatus.cached ? 'up' : 'unknown',
    },
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
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

export default {
  ping,
  health,
  status,
};
