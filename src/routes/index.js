/**
 * Route Aggregator
 * Combines all route modules and exports a single router
 */

import { Router } from 'express';
import healthRoutes from './health.routes.js';
import jobsRoutes from './jobs.routes.js';
import customersRoutes from './customers.routes.js';
import estimatesRoutes from './estimates.routes.js';
import opportunitiesRoutes from './opportunities.routes.js';

const router = Router();

// Health check routes (mounted at root)
router.use('/', healthRoutes);

// API resource routes
router.use('/jobs', jobsRoutes);
router.use('/customers', customersRoutes);
router.use('/estimates', estimatesRoutes);
router.use('/opportunities', opportunitiesRoutes);

export default router;
