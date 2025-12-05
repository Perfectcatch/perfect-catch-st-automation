/**
 * Reporting Routes
 * ServiceTitan Reporting API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import { createListHandler, createGetHandler } from '../controllers/generic.controller.js';
import { stRequest } from '../services/stClient.js';

const router = Router();

// Dynamic Value Sets
router.get('/dynamic-value-sets/:dynamicSetId', async (req, res, next) => {
  try {
    const result = await stRequest(stEndpoints.dynamicValueSets.get(req.params.dynamicSetId), {
      method: 'GET',
      query: req.query,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
});

// Report Categories
router.get('/report-categories', createListHandler(stEndpoints.reportCategories.list));
router.get('/report-categories/:id', createGetHandler(stEndpoints.reportCategories.get));

// Reports (nested under categories)
router.get('/report-categories/:categoryId/reports', async (req, res, next) => {
  try {
    const result = await stRequest(stEndpoints.reports.list(req.params.categoryId), {
      method: 'GET',
      query: req.query,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
});

router.get('/report-categories/:categoryId/reports/:reportId', async (req, res, next) => {
  try {
    const result = await stRequest(stEndpoints.reports.get(req.params.categoryId, req.params.reportId), {
      method: 'GET',
      query: req.query,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
});

export default router;
