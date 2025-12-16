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
 * GET /technicians/by-skills - Find technicians with specific skills
 * NOTE: This route MUST be defined before /technicians/:stId to avoid route conflicts
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

    // Safely parse zoneId - ensure we don't pass NaN to PostgreSQL
    const parsedZoneId = zoneId ? parseInt(zoneId, 10) : null;
    const safeZoneId = parsedZoneId && !Number.isNaN(parsedZoneId) ? parsedZoneId : null;

    const result = await db.query(
      `SELECT * FROM find_technicians_by_skills($1, $2)`,
      [skillsArray, safeZoneId]
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
// ARRIVAL WINDOWS ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /arrival-windows - Get all arrival windows
 */
router.get('/arrival-windows', async (req, res) => {
  try {
    const config = (await import('../config/index.js')).default;
    const tenantId = config.serviceTitan.tenantId;
    const url = `https://api.servicetitan.io/dispatch/v2/tenant/${tenantId}/arrival-windows`;
    const response = await stRequest(url);

    res.json({
      success: true,
      count: response?.data?.data?.length || 0,
      data: response?.data?.data || [],
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get arrival windows');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// DISPATCH MONITORING ENDPOINTS (real-time job status)
// ═══════════════════════════════════════════════════════════════

/**
 * GET /dispatch/status - Get today's dispatch status with job states
 * Returns all appointments for the day with their current status
 */
router.get('/dispatch/status', async (req, res) => {
  try {
    const { date } = req.query;
    const config = (await import('../config/index.js')).default;
    const tenantId = config.serviceTitan.tenantId;

    // Default to today
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startsOnOrAfter = `${targetDate}T00:00:00Z`;
    const endsOnOrBefore = `${targetDate}T23:59:59Z`;

    // Fetch appointments for the date
    const appointmentsUrl = `https://api.servicetitan.io/jpm/v2/tenant/${tenantId}/appointments?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${endsOnOrBefore}`;
    const appointmentsResponse = await stRequest(appointmentsUrl);
    const appointments = appointmentsResponse?.data?.data || [];

    // Get appointment IDs for assignments
    const appointmentIds = appointments.map(a => a.id);
    let assignments = [];
    if (appointmentIds.length > 0) {
      const assignmentsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${tenantId}/appointment-assignments?appointmentIds=${appointmentIds.join(',')}`;
      const assignmentsResponse = await stRequest(assignmentsUrl);
      assignments = assignmentsResponse?.data?.data || [];
    }

    // Build assignment lookup by appointment ID
    const assignmentsByAppointment = {};
    assignments.forEach(a => {
      if (!assignmentsByAppointment[a.appointmentId]) {
        assignmentsByAppointment[a.appointmentId] = [];
      }
      assignmentsByAppointment[a.appointmentId].push({
        technicianId: a.technicianId,
        technicianName: a.technicianName,
        status: a.status,
        isPaused: a.isPaused,
      });
    });

    // Categorize appointments by status
    const scheduled = [];
    const dispatched = [];
    const working = [];
    const completed = [];
    const canceled = [];

    appointments.forEach(apt => {
      const aptData = {
        appointmentId: apt.id,
        jobId: apt.jobId,
        status: apt.status,
        start: apt.start,
        end: apt.end,
        arrivalWindowStart: apt.arrivalWindowStart,
        arrivalWindowEnd: apt.arrivalWindowEnd,
        technicians: assignmentsByAppointment[apt.id] || [],
      };

      switch (apt.status) {
        case 'Scheduled': scheduled.push(aptData); break;
        case 'Dispatched': dispatched.push(aptData); break;
        case 'Working': working.push(aptData); break;
        case 'Done': completed.push(aptData); break;
        case 'Canceled': canceled.push(aptData); break;
        default: scheduled.push(aptData);
      }
    });

    res.json({
      success: true,
      date: targetDate,
      summary: {
        total: appointments.length,
        scheduled: scheduled.length,
        dispatched: dispatched.length,
        working: working.length,
        completed: completed.length,
        canceled: canceled.length,
      },
      appointments: {
        scheduled,
        dispatched,
        working,
        completed,
        canceled,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get dispatch status');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /dispatch/late - Get technicians running late
 * Checks if technicians haven't arrived within their arrival window
 */
router.get('/dispatch/late', async (req, res) => {
  try {
    const { date, thresholdMinutes } = req.query;
    const config = (await import('../config/index.js')).default;
    const tenantId = config.serviceTitan.tenantId;

    // Default to today
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startsOnOrAfter = `${targetDate}T00:00:00Z`;
    const endsOnOrBefore = `${targetDate}T23:59:59Z`;
    const threshold = parseInt(thresholdMinutes) || 0; // Extra minutes past arrival window

    // Fetch appointments
    const appointmentsUrl = `https://api.servicetitan.io/jpm/v2/tenant/${tenantId}/appointments?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${endsOnOrBefore}`;
    const appointmentsResponse = await stRequest(appointmentsUrl);
    const appointments = appointmentsResponse?.data?.data || [];

    // Get assignments
    const appointmentIds = appointments.map(a => a.id);
    let assignments = [];
    if (appointmentIds.length > 0) {
      const assignmentsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${tenantId}/appointment-assignments?appointmentIds=${appointmentIds.join(',')}`;
      const assignmentsResponse = await stRequest(assignmentsUrl);
      assignments = assignmentsResponse?.data?.data || [];
    }

    // Build assignment lookup
    const assignmentsByAppointment = {};
    assignments.forEach(a => {
      if (!assignmentsByAppointment[a.appointmentId]) {
        assignmentsByAppointment[a.appointmentId] = [];
      }
      assignmentsByAppointment[a.appointmentId].push(a);
    });

    const now = new Date();
    const lateAppointments = [];

    appointments.forEach(apt => {
      // Only check scheduled or dispatched (not yet working/done)
      if (apt.status !== 'Scheduled' && apt.status !== 'Dispatched') return;

      const arrivalEnd = new Date(apt.arrivalWindowEnd);
      const lateThreshold = new Date(arrivalEnd.getTime() + threshold * 60 * 1000);

      if (now > lateThreshold) {
        const techs = assignmentsByAppointment[apt.id] || [];
        const minutesLate = Math.round((now - arrivalEnd) / 60000);

        lateAppointments.push({
          appointmentId: apt.id,
          jobId: apt.jobId,
          status: apt.status,
          arrivalWindowStart: apt.arrivalWindowStart,
          arrivalWindowEnd: apt.arrivalWindowEnd,
          minutesLate,
          technicians: techs.map(t => ({
            id: t.technicianId,
            name: t.technicianName,
            status: t.status,
          })),
        });
      }
    });

    // Sort by most late first
    lateAppointments.sort((a, b) => b.minutesLate - a.minutesLate);

    res.json({
      success: true,
      date: targetDate,
      currentTime: now.toISOString(),
      thresholdMinutes: threshold,
      lateCount: lateAppointments.length,
      lateAppointments,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get late technicians');
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /dispatch/notifications - Get dispatch notifications/alerts
 * Returns status changes and alerts for monitoring dashboards
 */
router.get('/dispatch/notifications', async (req, res) => {
  try {
    const { date, includeCompleted } = req.query;
    const config = (await import('../config/index.js')).default;
    const tenantId = config.serviceTitan.tenantId;

    const targetDate = date || new Date().toISOString().split('T')[0];
    const startsOnOrAfter = `${targetDate}T00:00:00Z`;
    const endsOnOrBefore = `${targetDate}T23:59:59Z`;

    // Fetch appointments
    const appointmentsUrl = `https://api.servicetitan.io/jpm/v2/tenant/${tenantId}/appointments?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${endsOnOrBefore}`;
    const appointmentsResponse = await stRequest(appointmentsUrl);
    const appointments = appointmentsResponse?.data?.data || [];

    // Get assignments
    const appointmentIds = appointments.map(a => a.id);
    let assignments = [];
    if (appointmentIds.length > 0) {
      const assignmentsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${tenantId}/appointment-assignments?appointmentIds=${appointmentIds.join(',')}`;
      const assignmentsResponse = await stRequest(assignmentsUrl);
      assignments = assignmentsResponse?.data?.data || [];
    }

    const assignmentsByAppointment = {};
    assignments.forEach(a => {
      if (!assignmentsByAppointment[a.appointmentId]) {
        assignmentsByAppointment[a.appointmentId] = [];
      }
      assignmentsByAppointment[a.appointmentId].push(a);
    });

    const now = new Date();
    const notifications = [];

    appointments.forEach(apt => {
      const techs = assignmentsByAppointment[apt.id] || [];
      const techNames = techs.map(t => t.technicianName).join(', ') || 'Unassigned';

      // Dispatched notification
      if (apt.status === 'Dispatched') {
        notifications.push({
          type: 'dispatched',
          priority: 'info',
          appointmentId: apt.id,
          jobId: apt.jobId,
          message: `Job dispatched to ${techNames}`,
          technicians: techNames,
          start: apt.start,
          timestamp: apt.modifiedOn || apt.start,
        });
      }

      // Working (arrived) notification
      if (apt.status === 'Working') {
        notifications.push({
          type: 'arrived',
          priority: 'info',
          appointmentId: apt.id,
          jobId: apt.jobId,
          message: `${techNames} arrived on site`,
          technicians: techNames,
          start: apt.start,
          timestamp: apt.modifiedOn || now.toISOString(),
        });
      }

      // Completed notification
      if (apt.status === 'Done' && includeCompleted === 'true') {
        notifications.push({
          type: 'completed',
          priority: 'success',
          appointmentId: apt.id,
          jobId: apt.jobId,
          message: `Job completed by ${techNames}`,
          technicians: techNames,
          start: apt.start,
          end: apt.end,
          timestamp: apt.modifiedOn || apt.end,
        });
      }

      // Late alert
      if ((apt.status === 'Scheduled' || apt.status === 'Dispatched')) {
        const arrivalEnd = new Date(apt.arrivalWindowEnd);
        if (now > arrivalEnd) {
          const minutesLate = Math.round((now - arrivalEnd) / 60000);
          notifications.push({
            type: 'late',
            priority: 'warning',
            appointmentId: apt.id,
            jobId: apt.jobId,
            message: `${techNames} is ${minutesLate} minutes late`,
            technicians: techNames,
            minutesLate,
            arrivalWindowEnd: apt.arrivalWindowEnd,
            timestamp: now.toISOString(),
          });
        }
      }
    });

    // Sort by priority (warning first) then by timestamp
    const priorityOrder = { warning: 0, info: 1, success: 2 };
    notifications.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.json({
      success: true,
      date: targetDate,
      currentTime: now.toISOString(),
      notificationCount: notifications.length,
      notifications,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get dispatch notifications');
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
// SKILL MANAGEMENT ENDPOINTS (local intelligence)
// ═══════════════════════════════════════════════════════════════

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
