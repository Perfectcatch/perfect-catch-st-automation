/**
 * Task Management Routes
 * ServiceTitan Task Management API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
} from '../controllers/generic.controller.js';
import { stRequest } from '../services/stClient.js';

const router = Router();

// Client Side Data
router.get('/data', async (req, res, next) => {
  try {
    const result = await stRequest(stEndpoints.taskData.get(), {
      method: 'GET',
      query: req.query,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
});

// Tasks
router.get('/tasks', createListHandler(stEndpoints.tasks.list));
router.get('/tasks/:id', createGetHandler(stEndpoints.tasks.get));
router.post('/tasks', createCreateHandler(stEndpoints.tasks.create));
router.patch('/tasks/:id', createUpdateHandler(stEndpoints.tasks.update, 'PATCH'));

export default router;
