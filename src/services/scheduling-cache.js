/**
 * Scheduling Cache Service
 * In-memory caching for scheduling data with TTL support
 *
 * This follows the same pattern as tokenManager.js for in-memory caching.
 * Can be upgraded to Redis later by changing the storage implementation.
 */

import { createLogger } from '../lib/logger.js';
import { db } from './database.js';

const logger = createLogger('scheduling-cache');

// In-memory cache storage
const caches = {
  capacity: new Map(),      // Key: `${date}_${zoneId}_${teamId}` -> { data, expiresAt }
  availability: new Map(),  // Key: `${technicianStId}_${date}` -> { data, expiresAt }
  technicians: new Map(),   // Key: `all` or specific filters -> { data, expiresAt }
  zones: new Map(),         // Key: `all` -> { data, expiresAt }
  teams: new Map(),         // Key: `all` -> { data, expiresAt }
};

// Default TTLs in milliseconds
const DEFAULT_TTLS = {
  capacity: 15 * 60 * 1000,      // 15 minutes
  availability: 15 * 60 * 1000,  // 15 minutes
  technicians: 60 * 60 * 1000,   // 1 hour
  zones: 24 * 60 * 60 * 1000,    // 24 hours
  teams: 24 * 60 * 60 * 1000,    // 24 hours
};

/**
 * Generate a cache key from parameters
 * @param {Object} params
 * @returns {string}
 */
function generateKey(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('_') || 'default';
}

/**
 * Check if a cache entry is expired
 * @param {Object} entry
 * @returns {boolean}
 */
function isExpired(entry) {
  return !entry || Date.now() > entry.expiresAt;
}

/**
 * Get item from cache
 * @param {string} cacheType
 * @param {string} key
 * @returns {*|null}
 */
export function get(cacheType, key) {
  const cache = caches[cacheType];
  if (!cache) {
    logger.warn({ cacheType }, 'Unknown cache type');
    return null;
  }

  const entry = cache.get(key);
  if (isExpired(entry)) {
    cache.delete(key);
    return null;
  }

  logger.debug({ cacheType, key }, 'Cache hit');
  return entry.data;
}

/**
 * Set item in cache
 * @param {string} cacheType
 * @param {string} key
 * @param {*} data
 * @param {number} [ttlMs] - TTL in milliseconds (optional, uses default if not provided)
 */
export function set(cacheType, key, data, ttlMs) {
  const cache = caches[cacheType];
  if (!cache) {
    logger.warn({ cacheType }, 'Unknown cache type');
    return;
  }

  const ttl = ttlMs || DEFAULT_TTLS[cacheType] || 15 * 60 * 1000;
  const entry = {
    data,
    cachedAt: Date.now(),
    expiresAt: Date.now() + ttl,
  };

  cache.set(key, entry);
  logger.debug({ cacheType, key, ttl }, 'Cache set');
}

/**
 * Delete item from cache
 * @param {string} cacheType
 * @param {string} key
 */
export function del(cacheType, key) {
  const cache = caches[cacheType];
  if (cache) {
    cache.delete(key);
    logger.debug({ cacheType, key }, 'Cache deleted');
  }
}

/**
 * Clear all items from a specific cache type
 * @param {string} cacheType
 */
export function clearCache(cacheType) {
  const cache = caches[cacheType];
  if (cache) {
    cache.clear();
    logger.info({ cacheType }, 'Cache cleared');
  }
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  for (const cacheType of Object.keys(caches)) {
    caches[cacheType].clear();
  }
  logger.info('All caches cleared');
}

/**
 * Clean up expired entries from all caches
 * @returns {Object} Count of cleaned entries per cache type
 */
export function cleanupExpired() {
  const cleaned = {};

  for (const [cacheType, cache] of Object.entries(caches)) {
    let count = 0;
    for (const [key, entry] of cache.entries()) {
      if (isExpired(entry)) {
        cache.delete(key);
        count++;
      }
    }
    cleaned[cacheType] = count;
  }

  if (Object.values(cleaned).some(c => c > 0)) {
    logger.info({ cleaned }, 'Expired cache entries cleaned');
  }

  return cleaned;
}

/**
 * Get cache statistics
 * @returns {Object}
 */
export function getStats() {
  const stats = {};

  for (const [cacheType, cache] of Object.entries(caches)) {
    let validCount = 0;
    let expiredCount = 0;

    for (const entry of cache.values()) {
      if (isExpired(entry)) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    stats[cacheType] = {
      total: cache.size,
      valid: validCount,
      expired: expiredCount,
      defaultTtlMs: DEFAULT_TTLS[cacheType],
    };
  }

  return stats;
}

// ============================================
// High-Level Caching Functions
// ============================================

/**
 * Get or fetch capacity data
 * @param {Object} stClient - ServiceTitan API client
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {Object} options - { zoneId, teamId }
 * @returns {Promise<Object>}
 */
export async function getCapacity(stClient, date, options = {}) {
  const key = generateKey({ date, zoneId: options.zoneId, teamId: options.teamId });
  const cached = get('capacity', key);

  if (cached) {
    return cached;
  }

  const { default: config } = await import('../config/index.js');
  const tenantId = config.serviceTitan.tenantId;

  // Format date with time for accurate filtering
  const startsOnOrAfter = `${date}T00:00:00Z`;
  const endsOnOrBefore = `${date}T23:59:59Z`;

  // Step 1: Fetch appointments for the date
  const appointmentsUrl = `https://api.servicetitan.io/jpm/v2/tenant/${tenantId}/appointments?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${endsOnOrBefore}`;
  const appointmentsResponse = await stClient.stRequest(appointmentsUrl);
  const appointments = appointmentsResponse?.data?.data || [];

  // Step 2: Get appointment IDs to fetch assignments
  const appointmentIds = appointments.map(a => a.id);
  let assignments = [];
  if (appointmentIds.length > 0) {
    const assignmentsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${tenantId}/appointment-assignments?appointmentIds=${appointmentIds.join(',')}`;
    const assignmentsResponse = await stClient.stRequest(assignmentsUrl);
    assignments = assignmentsResponse?.data?.data || [];
  }

  // Step 3: Fetch active technicians
  const techParams = new URLSearchParams({ active: 'true' });
  if (options.teamId) techParams.append('teamId', options.teamId);
  const techUrl = `https://api.servicetitan.io/settings/v2/tenant/${tenantId}/technicians?${techParams}`;
  const techResponse = await stClient.stRequest(techUrl);
  const technicians = techResponse?.data?.data || [];

  // Build appointment lookup
  const appointmentMap = {};
  appointments.forEach(apt => {
    appointmentMap[apt.id] = apt;
  });

  // Build technician schedules
  const technicianSchedules = {};
  technicians.forEach(tech => {
    technicianSchedules[tech.id] = {
      technicianId: tech.id,
      technicianName: tech.name,
      businessUnitId: tech.businessUnitId,
      appointments: [],
    };
  });

  // Map assignments to technicians
  assignments.forEach(assignment => {
    const apt = appointmentMap[assignment.appointmentId];
    if (apt && technicianSchedules[assignment.technicianId]) {
      technicianSchedules[assignment.technicianId].appointments.push({
        appointmentId: apt.id,
        jobId: apt.jobId,
        start: apt.start,
        end: apt.end,
        status: apt.status,
      });
    }
  });

  // Calculate availability summary
  const schedules = Object.values(technicianSchedules);
  const available = schedules.filter(t => t.appointments.length === 0);
  const booked = schedules.filter(t => t.appointments.length > 0);

  const data = {
    date,
    totalTechnicians: technicians.length,
    totalAppointments: appointments.length,
    availableCount: available.length,
    bookedCount: booked.length,
    availableTechnicians: available.map(t => ({ id: t.technicianId, name: t.technicianName })),
    bookedTechnicians: booked.map(t => ({
      id: t.technicianId,
      name: t.technicianName,
      appointmentCount: t.appointments.length,
      appointments: t.appointments,
    })),
  };

  set('capacity', key, data);

  // Also persist to database cache for backup
  try {
    await db.query(
      `INSERT INTO scheduling_capacity_cache (cache_date, zone_st_id, team_st_id, data, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (cache_date, zone_st_id, team_st_id)
       DO UPDATE SET data = $4, cached_at = NOW(), expires_at = NOW() + INTERVAL '15 minutes'`,
      [date, options.zoneId || null, options.teamId || null, JSON.stringify(data)]
    );
  } catch (dbError) {
    logger.warn({ error: dbError.message }, 'Failed to persist capacity to DB cache');
  }

  return data;
}

/**
 * Get or fetch technician availability
 * @param {Object} stClient - ServiceTitan API client
 * @param {number} technicianStId - ServiceTitan technician ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>}
 */
export async function getTechnicianAvailability(stClient, technicianStId, date) {
  const key = generateKey({ technicianStId, date });
  const cached = get('availability', key);

  if (cached) {
    return cached;
  }

  // Fetch technician shifts from ServiceTitan
  const { stEndpoints } = await import('../lib/stEndpoints.js');
  const url = stEndpoints.technicianShifts.list();

  const response = await stClient.stRequest(url, {
    method: 'GET',
    query: {
      technicianId: technicianStId,
      startsOnOrAfter: date,
      endsOnOrBefore: date,
    },
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch technician availability: ${response.status}`);
  }

  const data = response.data;
  set('availability', key, data);

  // Persist to database cache
  try {
    await db.query(
      `INSERT INTO scheduling_availability_cache (technician_st_id, cache_date, data, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (technician_st_id, cache_date)
       DO UPDATE SET data = $3, cached_at = NOW(), expires_at = NOW() + INTERVAL '15 minutes'`,
      [technicianStId, date, JSON.stringify(data)]
    );
  } catch (dbError) {
    logger.warn({ error: dbError.message }, 'Failed to persist availability to DB cache');
  }

  return data;
}

/**
 * Get cached technicians (from local DB, not ST API)
 * @param {Object} filters - { active, teamId, zoneId }
 * @returns {Promise<Array>}
 */
export async function getCachedTechnicians(filters = {}) {
  const key = generateKey(filters);
  const cached = get('technicians', key);

  if (cached) {
    return cached;
  }

  // Fetch from local database
  let query = `
    SELECT t.*,
      COALESCE(json_agg(s.*) FILTER (WHERE s.id IS NOT NULL), '[]') as skills
    FROM raw_st_technicians t
    LEFT JOIN scheduling_technician_skills s ON s.technician_id = t.id
    WHERE t.deleted_at IS NULL
  `;
  const params = [];
  let paramIndex = 1;

  if (filters.active !== undefined) {
    query += ` AND t.active = $${paramIndex++}`;
    params.push(filters.active);
  }

  if (filters.teamId) {
    query += ` AND t.team_id = $${paramIndex++}`;
    params.push(filters.teamId);
  }

  if (filters.zoneId) {
    query += ` AND $${paramIndex++} = ANY(t.zone_ids)`;
    params.push(filters.zoneId);
  }

  query += ' GROUP BY t.id ORDER BY t.name';

  const result = await db.query(query, params);
  const data = result.rows;

  set('technicians', key, data);
  return data;
}

/**
 * Get cached zones (from local DB)
 * @param {Object} filters - { active }
 * @returns {Promise<Array>}
 */
export async function getCachedZones(filters = {}) {
  const key = generateKey(filters);
  const cached = get('zones', key);

  if (cached) {
    return cached;
  }

  let query = 'SELECT * FROM raw_st_zones WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.active !== undefined) {
    query += ` AND active = $${paramIndex++}`;
    params.push(filters.active);
  }

  query += ' ORDER BY name';

  const result = await db.query(query, params);
  const data = result.rows;

  set('zones', key, data);
  return data;
}

/**
 * Get cached teams (from local DB)
 * @param {Object} filters - { active }
 * @returns {Promise<Array>}
 */
export async function getCachedTeams(filters = {}) {
  const key = generateKey(filters);
  const cached = get('teams', key);

  if (cached) {
    return cached;
  }

  let query = 'SELECT * FROM raw_st_teams WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.active !== undefined) {
    query += ` AND active = $${paramIndex++}`;
    params.push(filters.active);
  }

  query += ' ORDER BY name';

  const result = await db.query(query, params);
  const data = result.rows;

  set('teams', key, data);
  return data;
}

/**
 * Invalidate reference data caches (call after sync)
 */
export function invalidateReferenceData() {
  clearCache('technicians');
  clearCache('zones');
  clearCache('teams');
  logger.info('Reference data caches invalidated');
}

// Export cache service object
export const schedulingCache = {
  get,
  set,
  del,
  clearCache,
  clearAllCaches,
  cleanupExpired,
  getStats,
  getCapacity,
  getTechnicianAvailability,
  getCachedTechnicians,
  getCachedZones,
  getCachedTeams,
  invalidateReferenceData,
};

export default schedulingCache;
