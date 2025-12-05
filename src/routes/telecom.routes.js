/**
 * Telecom Routes
 * ServiceTitan Telecom API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createExportHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// Calls
router.get('/calls', createListHandler(stEndpoints.calls.list));
router.get('/calls/export', createExportHandler(stEndpoints.calls.export));
router.get('/calls/:id', createGetHandler(stEndpoints.calls.get));

// Opt In/Out
router.get('/opt-in-out', createListHandler(stEndpoints.optInOut.list));
router.get('/opt-in-out/:id', createGetHandler(stEndpoints.optInOut.get));
router.post('/opt-in-out', createCreateHandler(stEndpoints.optInOut.create));
router.patch('/opt-in-out/:id', createUpdateHandler(stEndpoints.optInOut.update, 'PATCH'));

export default router;
