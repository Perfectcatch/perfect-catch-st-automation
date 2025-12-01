/**
 * Jobs Controller
 * Handles all job-related ServiceTitan API operations
 */

import { stRequest } from '../services/stClient.js';
import { stEndpoints } from '../lib/stEndpoints.js';

/**
 * List all jobs with query parameter support
 * GET /jobs
 */
export async function listJobs(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.jobs.list(), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single job by ID
 * GET /jobs/:id
 */
export async function getJob(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.jobs.get(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get job notes
 * GET /jobs/:id/notes
 */
export async function getJobNotes(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.jobs.notes(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get job history
 * GET /jobs/:id/history
 */
export async function getJobHistory(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.jobs.history(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

export default {
  listJobs,
  getJob,
  getJobNotes,
  getJobHistory,
};
