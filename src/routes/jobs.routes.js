/**
 * Jobs Routes
 * ServiceTitan Job Management endpoints
 */

import { Router } from 'express';
import { listJobs, getJob, getJobNotes, getJobHistory } from '../controllers/jobs.controller.js';

const router = Router();

// List all jobs - GET /jobs
router.get('/', listJobs);

// Get single job - GET /jobs/:id
router.get('/:id', getJob);

// Get job notes - GET /jobs/:id/notes
router.get('/:id/notes', getJobNotes);

// Get job history - GET /jobs/:id/history
router.get('/:id/history', getJobHistory);

export default router;
