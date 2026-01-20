/**
 * GHL Routes Aggregator
 * Combines all GHL route modules
 *
 * Routes:
 *   /ghl/pipelines/*         - Pipeline management
 *   /ghl/opportunities/*     - Opportunity tracking
 *   /ghl/sync/*              - Sync operations
 *   /ghl/webhooks/*          - Webhook handlers
 */

import { Router } from 'express';
import pipelinesRoutes from './pipelines/index.js';
import opportunitiesRoutes from './opportunities/index.js';
import syncRoutes from './sync/index.js';
import webhooksRoutes from './webhooks/index.js';

const router = Router();

// Pipeline management (install pipeline, etc.)
router.use('/', pipelinesRoutes);

// Opportunity tracking
router.use('/opportunities', opportunitiesRoutes);

// Sync operations
router.use('/sync', syncRoutes);

// Webhook handlers
router.use('/webhooks', webhooksRoutes);

export default router;
