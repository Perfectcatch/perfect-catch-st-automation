/**
 * Estimates Controller
 * Handles all estimate-related ServiceTitan API operations
 */

import { stRequest } from '../services/stClient.js';
import { stEndpoints } from '../lib/stEndpoints.js';

/**
 * List all estimates with query parameter support
 * GET /estimates
 */
export async function listEstimates(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.estimates.list(), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single estimate by ID
 * GET /estimates/:id
 */
export async function getEstimate(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.get(id), {
      method: 'GET',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new estimate
 * POST /estimates
 */
export async function createEstimate(req, res, next) {
  try {
    const result = await stRequest(stEndpoints.estimates.create(), {
      method: 'POST',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Update an estimate
 * PUT /estimates/:id
 */
export async function updateEstimate(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.update(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Sell an estimate
 * PUT /estimates/:id/sell
 */
export async function sellEstimate(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.sell(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Unsell an estimate
 * PUT /estimates/:id/unsell
 */
export async function unsellEstimate(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.unsell(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Dismiss an estimate
 * PUT /estimates/:id/dismiss
 */
export async function dismissEstimate(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.dismiss(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * List estimate items
 * GET /estimates/:id/items
 */
export async function listEstimateItems(req, res, next) {
  try {
    const { id } = req.params;

    // The ST API uses estimateId as query param for items list
    const result = await stRequest(stEndpoints.estimates.items.list(), {
      method: 'GET',
      query: { ...req.query, estimateId: id },
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Update estimate items
 * PUT /estimates/:id/items
 */
export async function updateEstimateItems(req, res, next) {
  try {
    const { id } = req.params;

    const result = await stRequest(stEndpoints.estimates.items.update(id), {
      method: 'PUT',
      body: req.body,
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an estimate item
 * DELETE /estimates/:id/items/:itemId
 */
export async function deleteEstimateItem(req, res, next) {
  try {
    const { id, itemId } = req.params;

    const result = await stRequest(stEndpoints.estimates.items.delete(id, itemId), {
      method: 'DELETE',
      query: req.query,
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    next(error);
  }
}

export default {
  listEstimates,
  getEstimate,
  createEstimate,
  updateEstimate,
  sellEstimate,
  unsellEstimate,
  dismissEstimate,
  listEstimateItems,
  updateEstimateItems,
  deleteEstimateItem,
};
