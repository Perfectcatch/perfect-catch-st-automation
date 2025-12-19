/**
 * VAPI Routes
 * Endpoints designed for VAPI voice AI integration
 * Provides real-time technician availability checks
 */

import { Router } from 'express';
import { stRequest } from '../services/stClient.js';
import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('vapi');

/**
 * GET /vapi/technician-availability
 * Check real-time technician availability for a given date
 * Shows scheduled appointments and which technicians are booked
 * 
 * Query params:
 *   - date: Target date (YYYY-MM-DD), defaults to today
 *   - technicianIds: Comma-separated list of technician IDs (optional)
 *   - businessUnitId: Filter by business unit (optional)
 * 
 * Example VAPI request:
 *   GET https://st.perfectcatchai.com/vapi/technician-availability?date=2025-12-16
 */
router.get('/technician-availability', async (req, res) => {
  try {
    const { date, technicianIds, businessUnitId } = req.query;
    
    // Default to today if no date provided
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startsOnOrAfter = `${targetDate}T00:00:00Z`;
    const endsOnOrBefore = `${targetDate}T23:59:59Z`;

    logger.info({ targetDate, technicianIds, businessUnitId }, 'VAPI availability check');

    // Fetch appointments for the date
    const appointmentsUrl = `https://api.servicetitan.io/jpm/v2/tenant/${config.serviceTitan.tenantId}/appointments?startsOnOrAfter=${startsOnOrAfter}&endsOnOrBefore=${endsOnOrBefore}`;
    const appointmentsResponse = await stRequest(appointmentsUrl);
    const appointments = appointmentsResponse?.data?.data || [];

    // Get appointment IDs to fetch assignments
    const appointmentIds = appointments.map(a => a.id);
    
    // Fetch appointment assignments to see which technicians are assigned
    let assignments = [];
    if (appointmentIds.length > 0) {
      const assignmentsUrl = `https://api.servicetitan.io/dispatch/v2/tenant/${config.serviceTitan.tenantId}/appointment-assignments?appointmentIds=${appointmentIds.join(',')}`;
      const assignmentsResponse = await stRequest(assignmentsUrl);
      assignments = assignmentsResponse?.data?.data || [];
    }

    // Fetch active technicians
    const techParams = new URLSearchParams({ active: 'true' });
    if (businessUnitId) {
      techParams.append('businessUnitId', businessUnitId);
    }
    const techUrl = `https://api.servicetitan.io/settings/v2/tenant/${config.serviceTitan.tenantId}/technicians?${techParams}`;
    const techResponse = await stRequest(techUrl);
    const allTechnicians = techResponse?.data?.data || [];

    // Filter technicians if specific IDs requested
    let technicians = allTechnicians;
    if (technicianIds) {
      const requestedIds = technicianIds.split(',').map(id => parseInt(id.trim()));
      technicians = allTechnicians.filter(t => requestedIds.includes(t.id));
    }

    // Build appointment lookup by ID
    const appointmentMap = {};
    appointments.forEach(apt => {
      appointmentMap[apt.id] = apt;
    });

    // Build technician schedule - who is booked when
    const technicianSchedules = {};
    technicians.forEach(tech => {
      technicianSchedules[tech.id] = {
        technicianId: tech.id,
        technicianName: tech.name,
        businessUnitId: tech.businessUnitId,
        appointments: [],
      };
    });

    // Map assignments to technicians with appointment times
    assignments.forEach(assignment => {
      const apt = appointmentMap[assignment.appointmentId];
      if (apt && technicianSchedules[assignment.technicianId]) {
        technicianSchedules[assignment.technicianId].appointments.push({
          appointmentId: apt.id,
          jobId: apt.jobId,
          start: apt.start,
          end: apt.end,
          arrivalWindowStart: apt.arrivalWindowStart,
          arrivalWindowEnd: apt.arrivalWindowEnd,
          status: apt.status,
        });
      }
    });

    // Convert to array and calculate availability
    const availability = Object.values(technicianSchedules).map(tech => ({
      ...tech,
      totalAppointments: tech.appointments.length,
      isAvailable: tech.appointments.length === 0,
    }));

    // Summary stats
    const availableTechs = availability.filter(t => t.isAvailable);
    const bookedTechs = availability.filter(t => !t.isAvailable);

    // Return VAPI-friendly response
    res.json({
      success: true,
      date: targetDate,
      summary: {
        totalTechnicians: availability.length,
        available: availableTechs.length,
        booked: bookedTechs.length,
        totalAppointments: appointments.length,
      },
      availableTechnicians: availableTechs.map(t => ({
        technicianId: t.technicianId,
        technicianName: t.technicianName,
      })),
      bookedTechnicians: bookedTechs.map(t => ({
        technicianId: t.technicianId,
        technicianName: t.technicianName,
        appointments: t.appointments,
      })),
      message: `${availableTechs.length} technician(s) available, ${bookedTechs.length} booked on ${targetDate}`,
    });

  } catch (error) {
    logger.error({ error: error.message }, 'VAPI availability check failed');
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to check technician availability',
    });
  }
});

/**
 * GET /vapi/technicians
 * List all active technicians (simplified for VAPI)
 * 
 * Query params:
 *   - businessUnitId: Filter by business unit (optional)
 *   - active: Filter by active status (default: true)
 */
router.get('/technicians', async (req, res) => {
  try {
    const { businessUnitId, active = 'true' } = req.query;

    const params = new URLSearchParams({ active });
    if (businessUnitId) {
      params.append('businessUnitId', businessUnitId);
    }

    const url = `https://api.servicetitan.io/settings/v2/tenant/${config.serviceTitan.tenantId}/technicians?${params}`;
    const response = await stRequest(url);
    const techData = response?.data?.data || [];

    // Simplify response for VAPI
    const technicians = techData.map(tech => ({
      id: tech.id,
      name: tech.name,
      businessUnitId: tech.businessUnitId,
      active: tech.active,
    }));

    res.json({
      success: true,
      totalTechnicians: technicians.length,
      technicians,
      message: `Found ${technicians.length} technician(s)`,
    });

  } catch (error) {
    logger.error({ error: error.message }, 'VAPI technicians list failed');
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to list technicians',
    });
  }
});

/**
 * GET /vapi/capacity
 * Get dispatch capacity for scheduling
 * 
 * Query params:
 *   - startsOnOrAfter: Start date filter
 *   - endsOnOrBefore: End date filter
 *   - businessUnitIds: Comma-separated business unit IDs
 */
router.get('/capacity', async (req, res) => {
  try {
    const { startsOnOrAfter, endsOnOrBefore, businessUnitIds } = req.query;

    const params = new URLSearchParams();
    if (startsOnOrAfter) params.append('startsOnOrAfter', startsOnOrAfter);
    if (endsOnOrBefore) params.append('endsOnOrBefore', endsOnOrBefore);
    if (businessUnitIds) params.append('businessUnitIds', businessUnitIds);

    const url = `https://api.servicetitan.io/dispatch/v2/tenant/${config.serviceTitan.tenantId}/capacity?${params}`;
    const response = await stRequest(url);
    const capacityData = response?.data?.data || [];

    res.json({
      success: true,
      capacity: capacityData,
      message: `Retrieved capacity data`,
    });

  } catch (error) {
    logger.error({ error: error.message }, 'VAPI capacity check failed');
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get capacity',
    });
  }
});

export default router;
