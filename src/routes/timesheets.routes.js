/**
 * Timesheets Routes
 * ServiceTitan Timesheets API endpoints
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

// Activities
router.get('/activities', createListHandler(stEndpoints.activities.list));
router.get('/activities/export', createExportHandler(stEndpoints.activities.export));
router.get('/activities/:id', createGetHandler(stEndpoints.activities.get));
router.post('/activities', createCreateHandler(stEndpoints.activities.create));
router.patch('/activities/:id', createUpdateHandler(stEndpoints.activities.update, 'PATCH'));
router.delete('/activities/:id', createDeleteHandler(stEndpoints.activities.delete));

// Activity Categories
router.get('/activity-categories', createListHandler(stEndpoints.activityCategories.list));
router.get('/activity-categories/:id', createGetHandler(stEndpoints.activityCategories.get));

// Activity Types
router.get('/activity-types', createListHandler(stEndpoints.activityTypes.list));
router.get('/activity-types/:id', createGetHandler(stEndpoints.activityTypes.get));

export default router;
