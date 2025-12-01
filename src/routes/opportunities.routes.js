/**
 * Opportunities Routes
 * ServiceTitan Salestech Opportunity endpoints
 */

import { Router } from 'express';
import {
  listOpportunities,
  getOpportunity,
  getOpportunityFollowups,
} from '../controllers/opportunities.controller.js';

const router = Router();

// List all opportunities - GET /opportunities
router.get('/', listOpportunities);

// Get single opportunity - GET /opportunities/:id
router.get('/:id', getOpportunity);

// Get opportunity follow-ups - GET /opportunities/:id/followups
router.get('/:id/followups', getOpportunityFollowups);

export default router;
