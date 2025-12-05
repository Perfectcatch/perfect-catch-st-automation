/**
 * Forms Routes
 * ServiceTitan Forms API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import { createListHandler, createGetHandler } from '../controllers/generic.controller.js';

const router = Router();

// Forms
router.get('/forms', createListHandler(stEndpoints.forms.list));
router.get('/forms/:id', createGetHandler(stEndpoints.forms.get));

// Form Submissions
router.get('/form-submissions', createListHandler(stEndpoints.formSubmissions.list));
router.get('/form-submissions/:id', createGetHandler(stEndpoints.formSubmissions.get));

// Job Forms
router.get('/jobs/:jobId/forms', async (req, res, next) => {
  try {
    const { stRequest } = await import('../services/stClient.js');
    const result = await stRequest(stEndpoints.formJobs.list(req.params.jobId), {
      method: 'GET',
      query: req.query,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
});

export default router;
