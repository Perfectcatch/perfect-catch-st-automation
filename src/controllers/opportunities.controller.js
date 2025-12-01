/**
 * Opportunities Controller
 * Handles all opportunity-related ServiceTitan API operations
 */

import { stRequest } from '../services/stClient.js';
import { stEndpoints } from '../lib/stEndpoints.js';

/**
 * List all opportunities with query parameter support
 * GET /opportunities
 */
export async function listOpportunities(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.opportunities.list(), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single opportunity by ID
 * GET /opportunities/:id
 */
export async function getOpportunity(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.opportunities.get(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get opportunity follow-ups
 * GET /opportunities/:id/followups
 */
export async function getOpportunityFollowups(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.opportunities.followups(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

export default {
  listOpportunities,
  getOpportunity,
  getOpportunityFollowups,
};
