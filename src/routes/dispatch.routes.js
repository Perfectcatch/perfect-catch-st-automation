/**
 * Dispatch Routes
 * ServiceTitan Dispatch API endpoints
 * Includes: Appointments, Technician Shifts, Teams, Zones, GPS, etc.
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
  createExportHandler,
  createActionHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// APPOINTMENT ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════
router.get('/appointment-assignments', createListHandler(stEndpoints.appointmentAssignments.list));
router.post('/appointment-assignments/assign-technicians', createActionHandler(stEndpoints.appointmentAssignments.assignTechnicians));
router.post('/appointment-assignments/unassign-technicians', createActionHandler(stEndpoints.appointmentAssignments.unassignTechnicians));

// ═══════════════════════════════════════════════════════════════
// ARRIVAL WINDOWS
// ═══════════════════════════════════════════════════════════════
router.get('/arrival-windows', createListHandler(stEndpoints.arrivalWindows.list));
router.get('/arrival-windows/:id', createGetHandler(stEndpoints.arrivalWindows.get));

// ═══════════════════════════════════════════════════════════════
// BUSINESS HOURS
// ═══════════════════════════════════════════════════════════════
router.get('/business-hours', createListHandler(stEndpoints.businessHours.list));
router.get('/business-hours/:id', createGetHandler(stEndpoints.businessHours.get));

// ═══════════════════════════════════════════════════════════════
// CAPACITY
// ═══════════════════════════════════════════════════════════════
router.get('/capacity', createListHandler(stEndpoints.capacity.list));

// ═══════════════════════════════════════════════════════════════
// NON-JOB APPOINTMENTS
// ═══════════════════════════════════════════════════════════════
router.get('/non-job-appointments', createListHandler(stEndpoints.nonJobAppointments.list));
router.get('/non-job-appointments/:id', createGetHandler(stEndpoints.nonJobAppointments.get));
router.post('/non-job-appointments', createCreateHandler(stEndpoints.nonJobAppointments.create));
router.patch('/non-job-appointments/:id', createUpdateHandler(stEndpoints.nonJobAppointments.update, 'PATCH'));
router.delete('/non-job-appointments/:id', createDeleteHandler(stEndpoints.nonJobAppointments.delete));

// ═══════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════
router.get('/teams', createListHandler(stEndpoints.teams.list));
router.get('/teams/:id', createGetHandler(stEndpoints.teams.get));

// ═══════════════════════════════════════════════════════════════
// TECHNICIAN SHIFTS
// ═══════════════════════════════════════════════════════════════
router.get('/technician-shifts', createListHandler(stEndpoints.technicianShifts.list));
router.get('/technician-shifts/export', createExportHandler(stEndpoints.technicianShifts.export));
router.get('/technician-shifts/:id', createGetHandler(stEndpoints.technicianShifts.get));
router.post('/technician-shifts', createCreateHandler(stEndpoints.technicianShifts.create));
router.patch('/technician-shifts/:id', createUpdateHandler(stEndpoints.technicianShifts.update, 'PATCH'));
router.delete('/technician-shifts/:id', createDeleteHandler(stEndpoints.technicianShifts.delete));

// ═══════════════════════════════════════════════════════════════
// TECHNICIAN TRACKING
// ═══════════════════════════════════════════════════════════════
router.get('/technician-tracking', createListHandler(stEndpoints.technicianTracking.list));

// ═══════════════════════════════════════════════════════════════
// ZONES
// ═══════════════════════════════════════════════════════════════
router.get('/zones', createListHandler(stEndpoints.zones.list));
router.get('/zones/:id', createGetHandler(stEndpoints.zones.get));

export default router;
