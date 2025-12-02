/**
 * Job Booking (JBCE) Routes
 * ServiceTitan Job Booking API endpoints
 * Includes: Call Reasons
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import { createListHandler } from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// CALL REASONS
// ═══════════════════════════════════════════════════════════════
router.get('/call-reasons', createListHandler(stEndpoints.callReasons.list));

export default router;
