/**
 * Estimates Routes
 * ServiceTitan Sales Estimate endpoints
 */

import { Router } from 'express';
import {
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
} from '../controllers/estimates.controller.js';

const router = Router();

// List all estimates - GET /estimates
router.get('/', listEstimates);

// Create estimate - POST /estimates
router.post('/', createEstimate);

// Get single estimate - GET /estimates/:id
router.get('/:id', getEstimate);

// Update estimate - PUT /estimates/:id
router.put('/:id', updateEstimate);

// Sell estimate - PUT /estimates/:id/sell
router.put('/:id/sell', sellEstimate);

// Unsell estimate - PUT /estimates/:id/unsell
router.put('/:id/unsell', unsellEstimate);

// Dismiss estimate - PUT /estimates/:id/dismiss
router.put('/:id/dismiss', dismissEstimate);

// List estimate items - GET /estimates/:id/items
router.get('/:id/items', listEstimateItems);

// Update estimate items - PUT /estimates/:id/items
router.put('/:id/items', updateEstimateItems);

// Delete estimate item - DELETE /estimates/:id/items/:itemId
router.delete('/:id/items/:itemId', deleteEstimateItem);

export default router;
