/**
 * Marketing Ads Routes
 * ServiceTitan Marketing Ads API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import { createListHandler, createCreateHandler } from '../controllers/generic.controller.js';

const router = Router();

// Attributed Leads
router.get('/attributed-leads', createListHandler(stEndpoints.attributedLeads.list));

// Capacity Awareness Warning
router.get('/capacity-awareness-warning', createListHandler(stEndpoints.capacityAwarenessWarning.list));

// External Call Attributions
router.post('/external-call-attributions', createCreateHandler(stEndpoints.externalCallAttributions.create));

// Performance
router.get('/performance', createListHandler(stEndpoints.marketingPerformance.list));

// Scheduled Job Attributions
router.get('/scheduled-job-attributions', createListHandler(stEndpoints.scheduledJobAttributions.list));

// Web Booking Attributions
router.get('/web-booking-attributions', createListHandler(stEndpoints.webBookingAttributions.list));

// Web Lead Form Attributions
router.get('/web-lead-form-attributions', createListHandler(stEndpoints.webLeadFormAttributions.list));

export default router;
