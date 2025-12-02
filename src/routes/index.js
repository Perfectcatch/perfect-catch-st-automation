/**
 * Route Aggregator
 * Combines all route modules and exports a single router
 * 
 * Total Modules: 11
 * - Existing: jobs, customers, estimates, opportunities
 * - New: accounting, dispatch, pricebook, payroll, settings, equipment, jbce
 */

import { Router } from 'express';

// Health routes
import healthRoutes from './health.routes.js';

// Existing routes (jpm, crm, sales, salestech)
import jobsRoutes from './jobs.routes.js';
import customersRoutes from './customers.routes.js';
import estimatesRoutes from './estimates.routes.js';
import opportunitiesRoutes from './opportunities.routes.js';

// New routes from OpenAPI specs
import accountingRoutes from './accounting.routes.js';
import dispatchRoutes from './dispatch.routes.js';
import pricebookRoutes from './pricebook.routes.js';
import payrollRoutes from './payroll.routes.js';
import settingsRoutes from './settings.routes.js';
import equipmentRoutes from './equipment.routes.js';
import jbceRoutes from './jbce.routes.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK ROUTES (mounted at root)
// ═══════════════════════════════════════════════════════════════
router.use('/', healthRoutes);

// ═══════════════════════════════════════════════════════════════
// EXISTING API ROUTES
// ═══════════════════════════════════════════════════════════════
router.use('/jobs', jobsRoutes);
router.use('/customers', customersRoutes);
router.use('/estimates', estimatesRoutes);
router.use('/opportunities', opportunitiesRoutes);

// ═══════════════════════════════════════════════════════════════
// NEW API ROUTES (from OpenAPI specs)
// ═══════════════════════════════════════════════════════════════
router.use('/accounting', accountingRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/pricebook', pricebookRoutes);
router.use('/payroll', payrollRoutes);
router.use('/settings', settingsRoutes);
router.use('/equipment', equipmentRoutes);
router.use('/jbce', jbceRoutes);

export default router;
