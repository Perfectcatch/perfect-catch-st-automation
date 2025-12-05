/**
 * JPM Extended Routes
 * ServiceTitan Job Planning and Management API endpoints
 * Extended endpoints beyond the basic jobs routes
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createActionHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// Appointments
router.get('/appointments', createListHandler(stEndpoints.appointments.list));
router.get('/appointments/:id', createGetHandler(stEndpoints.appointments.get));
router.post('/appointments', createCreateHandler(stEndpoints.appointments.create));
router.patch('/appointments/:id', createUpdateHandler(stEndpoints.appointments.update, 'PATCH'));
router.post('/appointments/:id/cancel', createActionHandler(stEndpoints.appointments.cancel));
router.post('/appointments/:id/hold', createActionHandler(stEndpoints.appointments.hold));
router.post('/appointments/:id/reschedule', createActionHandler(stEndpoints.appointments.reschedule));

// Budget Codes
router.get('/budget-codes', createListHandler(stEndpoints.budgetCodes.list));
router.get('/budget-codes/:id', createGetHandler(stEndpoints.budgetCodes.get));

// Job Cancel Reasons
router.get('/job-cancel-reasons', createListHandler(stEndpoints.jobCancelReasons.list));
router.get('/job-cancel-reasons/:id', createGetHandler(stEndpoints.jobCancelReasons.get));

// Job Hold Reasons
router.get('/job-hold-reasons', createListHandler(stEndpoints.jobHoldReasons.list));
router.get('/job-hold-reasons/:id', createGetHandler(stEndpoints.jobHoldReasons.get));

// Job Types
router.get('/job-types', createListHandler(stEndpoints.jobTypes.list));
router.get('/job-types/:id', createGetHandler(stEndpoints.jobTypes.get));

// Projects
router.get('/projects', createListHandler(stEndpoints.projects.list));
router.get('/projects/:id', createGetHandler(stEndpoints.projects.get));
router.post('/projects', createCreateHandler(stEndpoints.projects.create));
router.patch('/projects/:id', createUpdateHandler(stEndpoints.projects.update, 'PATCH'));

// Project Statuses
router.get('/project-statuses', createListHandler(stEndpoints.projectStatuses.list));
router.get('/project-statuses/:id', createGetHandler(stEndpoints.projectStatuses.get));

// Project Sub-Statuses
router.get('/project-sub-statuses', createListHandler(stEndpoints.projectSubStatuses.list));
router.get('/project-sub-statuses/:id', createGetHandler(stEndpoints.projectSubStatuses.get));

// Project Types
router.get('/project-types', createListHandler(stEndpoints.projectTypes.list));
router.get('/project-types/:id', createGetHandler(stEndpoints.projectTypes.get));

export default router;
