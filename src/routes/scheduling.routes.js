/**
 * Scheduling Routes
 * Main API endpoints for scheduling operations (availability, smart scheduling, etc.)
 *
 * Note: This is DIFFERENT from sync routes. These are the user-facing scheduling APIs
 * that use a hybrid approach (real-time ST API + cached reference data + intelligence).
 */

import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import {
  getCachedTechnicians,
  getCachedZones,
  getCachedTeams,
  getCapacity,
  getStats as getCacheStats,
  invalidateReferenceData,
} from '../services/scheduling-cache.js';
import { db } from '../services/database.js';
import { stRequest } from '../services/stClient.js';

const logger = createLogger('scheduling-routes');
const router = Router();

// ═══════════════════════════════════════════════════════════════
// REFERENCE DATA ENDPOINTS (from cached local database)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /technicians - Get all technicians with optional filters
 */
router.get('/technicians', async (req, res) => {
  try {
    const { active, teamId, zoneId, withSkills } = req.query;

    const technicians = await getCachedTechnicians({
      active: active !== undefined ? active === 'true' : true,
      teamId: teamId ? parseInt(teamId) : undefined,
      zoneId: zoneId ? parseInt(zoneId) : undefined,
    });

    res.json({
      success: true,
      count: technicians.length,
      data: technicians,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get technicians');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /technicians/:stId - Get a specific technician
 */
router.get('/technicians/:stId', async (req, res) => {
  try {
    const { stId } = req.params;

    const result = await db.query(
      `SELECT * FROM get_technician_with_skills($1)`,
      [parseInt(stId)]
    );

    if (!result.rows[0] || !result.rows[0].get_technician_with_skills) {
      return res.status(404).json({
        success: false,
        error: 'Technician not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0].get_technician_with_skills,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get technician');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /zones - Get all zones
 */
router.get('/zones', async (req, res) => {
  try {
    const { active } = req.query;

    const zones = await getCachedZones({
      active: active !== undefined ? active === 'true' : true,
    });

    res.json({
      success: true,
      count: zones.length,
      data: zones,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get zones');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /teams - Get all teams
 */
router.get('/teams', async (req, res) => {
  try {
    const { active } = req.query;

    const teams = await getCachedTeams({
      active: active !== undefined ? active === 'true' : true,
    });

    res.json({
      success: true,
      count: teams.length,
      data: teams,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get teams');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /job-types - Get all job types
 */
router.get('/job-types', async (req, res) => {
  try {
    const { active } = req.query;

    let query = 'SELECT * FROM scheduling_job_types WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get job types');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /job-profiles - Get all job profiles (local intelligence)
 */
router.get('/job-profiles', async (req, res) => {
  try {
    const { active } = req.query;

    let query = 'SELECT * FROM scheduling_job_profiles WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    query += ' ORDER BY name';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get job profiles');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AVAILABILITY ENDPOINTS (hybrid: cached + real-time)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /availability - Get availability for a date
 */
router.get('/availability', async (req, res) => {
  try {
    const { date, zoneId, teamId } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date parameter is required (YYYY-MM-DD)',
      });
    }

    const stClient = { stRequest };
    const capacity = await getCapacity(stClient, date, {
      zoneId: zoneId ? parseInt(zoneId) : undefined,
      teamId: teamId ? parseInt(teamId) : undefined,
    });

    res.json({
      success: true,
      date,
      filters: { zoneId, teamId },
      data: capacity,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get availability');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SKILL MATCHING ENDPOINTS (local intelligence)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /technicians/by-skills - Find technicians with specific skills
 */
router.get('/technicians/by-skills', async (req, res) => {
  try {
    const { skills, zoneId } = req.query;

    if (!skills) {
      return res.status(400).json({
        success: false,
        error: 'skills parameter is required (comma-separated)',
      });
    }

    const skillsArray = skills.split(',').map(s => s.trim());

    const result = await db.query(
      `SELECT * FROM find_technicians_by_skills($1, $2)`,
      [skillsArray, zoneId ? parseInt(zoneId) : null]
    );

    res.json({
      success: true,
      requiredSkills: skillsArray,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to find technicians by skills');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /technicians/:id/skills - Add skill to technician
 */
router.post('/technicians/:id/skills', async (req, res) => {
  try {
    const { id } = req.params;
    const { skillName, skillLevel, certified, certificationExpires, certificationName } = req.body;

    if (!skillName) {
      return res.status(400).json({
        success: false,
        error: 'skillName is required',
      });
    }

    // Get technician st_id
    const techResult = await db.query(
      'SELECT st_id FROM scheduling_technicians WHERE id = $1',
      [id]
    );

    if (techResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Technician not found',
      });
    }

    const technicianStId = techResult.rows[0].st_id;

    // Insert or update skill
    const result = await db.query(
      `INSERT INTO scheduling_technician_skills (
        technician_id, technician_st_id, skill_name, skill_level,
        certified, certification_name, certification_expires
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (technician_id, skill_name)
      DO UPDATE SET
        skill_level = EXCLUDED.skill_level,
        certified = EXCLUDED.certified,
        certification_name = EXCLUDED.certification_name,
        certification_expires = EXCLUDED.certification_expires,
        updated_at = NOW()
      RETURNING *`,
      [
        id,
        technicianStId,
        skillName,
        skillLevel || 'basic',
        certified || false,
        certificationName || null,
        certificationExpires || null,
      ]
    );

    // Invalidate technician cache
    invalidateReferenceData();

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to add skill');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /technicians/:id/skills/:skillName - Remove skill from technician
 */
router.delete('/technicians/:id/skills/:skillName', async (req, res) => {
  try {
    const { id, skillName } = req.params;

    const result = await db.query(
      'DELETE FROM scheduling_technician_skills WHERE technician_id = $1 AND skill_name = $2 RETURNING *',
      [id, skillName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Skill not found',
      });
    }

    // Invalidate technician cache
    invalidateReferenceData();

    res.json({
      success: true,
      message: 'Skill removed',
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to remove skill');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULING RULES ENDPOINTS (local intelligence)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /rules - Get all scheduling rules
 */
router.get('/rules', async (req, res) => {
  try {
    const { active, type } = req.query;

    let query = 'SELECT * FROM scheduling_rules WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (active !== undefined) {
      query += ` AND active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    if (type) {
      query += ` AND rule_type = $${paramIndex++}`;
      params.push(type);
    }

    query += ' ORDER BY priority DESC, rule_name';

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get rules');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /rules - Create a scheduling rule
 */
router.post('/rules', async (req, res) => {
  try {
    const { ruleName, description, ruleType, conditions, actions, priority, active } = req.body;

    if (!ruleName || !conditions || !actions) {
      return res.status(400).json({
        success: false,
        error: 'ruleName, conditions, and actions are required',
      });
    }

    const result = await db.query(
      `INSERT INTO scheduling_rules (
        rule_name, description, rule_type, conditions, actions, priority, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        ruleName,
        description || null,
        ruleType || 'preference',
        JSON.stringify(conditions),
        JSON.stringify(actions),
        priority || 50,
        active !== false,
      ]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to create rule');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /rules/:id - Update a scheduling rule
 */
router.patch('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { active, priority, conditions, actions, description } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      params.push(active);
    }

    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }

    if (conditions !== undefined) {
      updates.push(`conditions = $${paramIndex++}`);
      params.push(JSON.stringify(conditions));
    }

    if (actions !== undefined) {
      updates.push(`actions = $${paramIndex++}`);
      params.push(JSON.stringify(actions));
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No update fields provided',
      });
    }

    params.push(id);
    const result = await db.query(
      `UPDATE scheduling_rules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to update rule');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// STATS & CACHE MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /stats - Get scheduling stats
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM get_scheduling_stats()');
    const cacheStats = getCacheStats();

    res.json({
      success: true,
      entityStats: result.rows,
      cacheStats,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get stats');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /cache/invalidate - Invalidate reference data caches
 */
router.post('/cache/invalidate', async (req, res) => {
  try {
    invalidateReferenceData();

    res.json({
      success: true,
      message: 'Reference data caches invalidated',
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to invalidate cache');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG ENDPOINT
// ═══════════════════════════════════════════════════════════════

/**
 * GET /audit - Get scheduling audit log
 */
router.get('/audit', async (req, res) => {
  try {
    const { action, source, limit, offset } = req.query;

    let query = 'SELECT * FROM scheduling_audit_log WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(action);
    }

    if (source) {
      query += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    query += ' ORDER BY created_at DESC';

    if (limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(parseInt(limit) || 100);
    } else {
      query += ' LIMIT 100';
    }

    if (offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(parseInt(offset) || 0);
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get audit log');
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
