/**
 * Base Worker with Heartbeat
 * Provides health check functionality for Docker workers
 *
 * Batch 10: Workers need file-based health checks since they
 * don't expose HTTP endpoints.
 */

import fs from 'fs';

const HEARTBEAT_FILE = '/tmp/worker-heartbeat';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

let heartbeatInterval = null;

/**
 * Update the heartbeat file timestamp
 */
function updateHeartbeat() {
  try {
    const data = JSON.stringify({
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime()
    });
    fs.writeFileSync(HEARTBEAT_FILE, data);
  } catch (error) {
    console.error('Failed to update heartbeat:', error.message);
  }
}

/**
 * Start the heartbeat for Docker health checks
 * Call this at worker startup
 */
export function startHeartbeat() {
  // Initial heartbeat
  updateHeartbeat();

  // Regular heartbeat
  heartbeatInterval = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL);

  console.log(`[Heartbeat] Started (interval: ${HEARTBEAT_INTERVAL / 1000}s, file: ${HEARTBEAT_FILE})`);

  return heartbeatInterval;
}

/**
 * Stop the heartbeat
 * Call this during graceful shutdown
 */
export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('[Heartbeat] Stopped');
  }
}

/**
 * Check if the heartbeat is healthy
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 120000 = 2 minutes)
 * @returns {boolean} - True if healthy
 */
export function isHealthy(maxAgeMs = 120000) {
  try {
    const stat = fs.statSync(HEARTBEAT_FILE);
    const age = Date.now() - stat.mtimeMs;
    return age < maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Get heartbeat status
 * @returns {Object} - Heartbeat status object
 */
export function getHeartbeatStatus() {
  try {
    const stat = fs.statSync(HEARTBEAT_FILE);
    const content = fs.readFileSync(HEARTBEAT_FILE, 'utf8');
    const data = JSON.parse(content);
    const age = Date.now() - stat.mtimeMs;

    return {
      healthy: age < 120000,
      lastUpdate: new Date(stat.mtimeMs).toISOString(),
      ageMs: age,
      ...data
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

export default {
  startHeartbeat,
  stopHeartbeat,
  isHealthy,
  getHeartbeatStatus,
  HEARTBEAT_FILE
};
