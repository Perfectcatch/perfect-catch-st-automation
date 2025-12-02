/**
 * Settings Routes
 * ServiceTitan Settings API endpoints
 * Includes: Employees, Technicians, Business Units, User Roles, Tag Types
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createExportHandler,
  createActionHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════
router.get('/employees', createListHandler(stEndpoints.employees.list));
router.get('/employees/export', createExportHandler(stEndpoints.employees.export));
router.get('/employees/:id', createGetHandler(stEndpoints.employees.get));
router.post('/employees', createCreateHandler(stEndpoints.employees.create));
router.patch('/employees/:id', createUpdateHandler(stEndpoints.employees.update, 'PATCH'));
router.post('/employees/:id/account-actions', createActionHandler(stEndpoints.employees.accountActions));

// ═══════════════════════════════════════════════════════════════
// TECHNICIANS
// ═══════════════════════════════════════════════════════════════
router.get('/technicians', createListHandler(stEndpoints.technicians.list));
router.get('/technicians/export', createExportHandler(stEndpoints.technicians.export));
router.get('/technicians/:id', createGetHandler(stEndpoints.technicians.get));
router.post('/technicians', createCreateHandler(stEndpoints.technicians.create));
router.patch('/technicians/:id', createUpdateHandler(stEndpoints.technicians.update, 'PATCH'));

// ═══════════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════════
router.get('/business-units', createListHandler(stEndpoints.businessUnits.list));
router.get('/business-units/:id', createGetHandler(stEndpoints.businessUnits.get));
router.post('/business-units', createCreateHandler(stEndpoints.businessUnits.create));
router.patch('/business-units/:id', createUpdateHandler(stEndpoints.businessUnits.update, 'PATCH'));

// ═══════════════════════════════════════════════════════════════
// USER ROLES
// ═══════════════════════════════════════════════════════════════
router.get('/user-roles', createListHandler(stEndpoints.userRoles.list));
router.get('/user-roles/:id', createGetHandler(stEndpoints.userRoles.get));

// ═══════════════════════════════════════════════════════════════
// TAG TYPES
// ═══════════════════════════════════════════════════════════════
router.get('/tag-types', createListHandler(stEndpoints.tagTypes.list));
router.get('/tag-types/:id', createGetHandler(stEndpoints.tagTypes.get));
router.post('/tag-types', createCreateHandler(stEndpoints.tagTypes.create));
router.patch('/tag-types/:id', createUpdateHandler(stEndpoints.tagTypes.update, 'PATCH'));

export default router;
