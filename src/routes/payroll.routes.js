/**
 * Payroll Routes
 * ServiceTitan Payroll API endpoints
 * Includes: Timesheets, Job Splits, Payroll Adjustments, Activity Codes, etc.
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
} from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// TIMESHEETS
// ═══════════════════════════════════════════════════════════════
router.get('/timesheets', createListHandler(stEndpoints.timesheets.list));
router.get('/timesheets/export', createExportHandler(stEndpoints.timesheets.export));

// ═══════════════════════════════════════════════════════════════
// TIMESHEET CODES
// ═══════════════════════════════════════════════════════════════
router.get('/timesheet-codes', createListHandler(stEndpoints.timesheetCodes.list));
router.get('/timesheet-codes/export', createExportHandler(stEndpoints.timesheetCodes.export));
router.get('/timesheet-codes/:id', createGetHandler(stEndpoints.timesheetCodes.get));

// ═══════════════════════════════════════════════════════════════
// JOB SPLITS
// ═══════════════════════════════════════════════════════════════
router.get('/job-splits', createListHandler(stEndpoints.jobSplits.list));
router.get('/job-splits/export', createExportHandler(stEndpoints.jobSplits.export));
router.get('/job-splits/:jobId', createGetHandler(stEndpoints.jobSplits.get));
router.put('/job-splits/:jobId', createUpdateHandler(stEndpoints.jobSplits.update, 'PUT'));

// ═══════════════════════════════════════════════════════════════
// GROSS PAY ITEMS
// ═══════════════════════════════════════════════════════════════
router.get('/gross-pay-items', createListHandler(stEndpoints.grossPayItems.list));
router.get('/gross-pay-items/export', createExportHandler(stEndpoints.grossPayItems.export));
router.get('/gross-pay-items/:id', createGetHandler(stEndpoints.grossPayItems.get));
router.post('/gross-pay-items', createCreateHandler(stEndpoints.grossPayItems.create));
router.patch('/gross-pay-items/:id', createUpdateHandler(stEndpoints.grossPayItems.update, 'PATCH'));
router.delete('/gross-pay-items/:id', createDeleteHandler(stEndpoints.grossPayItems.delete));

// ═══════════════════════════════════════════════════════════════
// PAYROLL ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════
router.get('/payroll-adjustments', createListHandler(stEndpoints.payrollAdjustments.list));
router.get('/payroll-adjustments/export', createExportHandler(stEndpoints.payrollAdjustments.export));
router.get('/payroll-adjustments/:id', createGetHandler(stEndpoints.payrollAdjustments.get));
router.post('/payroll-adjustments', createCreateHandler(stEndpoints.payrollAdjustments.create));
router.patch('/payroll-adjustments/:id', createUpdateHandler(stEndpoints.payrollAdjustments.update, 'PATCH'));
router.delete('/payroll-adjustments/:id', createDeleteHandler(stEndpoints.payrollAdjustments.delete));

// ═══════════════════════════════════════════════════════════════
// PAYROLLS
// ═══════════════════════════════════════════════════════════════
router.get('/payrolls', createListHandler(stEndpoints.payrolls.list));
router.get('/payrolls/export', createExportHandler(stEndpoints.payrolls.export));
router.get('/payrolls/:id', createGetHandler(stEndpoints.payrolls.get));

// ═══════════════════════════════════════════════════════════════
// PAYROLL SETTINGS
// ═══════════════════════════════════════════════════════════════
router.get('/payroll-settings', createListHandler(stEndpoints.payrollSettings.get));

// ═══════════════════════════════════════════════════════════════
// ACTIVITY CODES
// ═══════════════════════════════════════════════════════════════
router.get('/activity-codes', createListHandler(stEndpoints.activityCodes.list));
router.get('/activity-codes/export', createExportHandler(stEndpoints.activityCodes.export));
router.get('/activity-codes/:id', createGetHandler(stEndpoints.activityCodes.get));

// ═══════════════════════════════════════════════════════════════
// LOCATION LABOR TYPES
// ═══════════════════════════════════════════════════════════════
router.get('/location-labor-types', createListHandler(stEndpoints.locationLaborTypes.list));
router.get('/location-labor-types/:id', createGetHandler(stEndpoints.locationLaborTypes.get));

export default router;
