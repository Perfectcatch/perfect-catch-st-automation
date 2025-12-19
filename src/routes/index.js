/**
 * Route Aggregator
 * Combines all route modules and exports a single router
 * 
 * Total Modules: 19
 * Total Endpoints: 372+
 * Generated: 2025-12-04
 */

import { Router } from 'express';

// Health routes
import healthRoutes from './health.routes.js';

// Existing routes (jpm, crm, sales, salestech)
import jobsRoutes from './jobs.routes.js';
import customersRoutes from './customers.routes.js';
import estimatesRoutes from './estimates.routes.js';
import opportunitiesRoutes from './opportunities.routes.js';

// Core modules from OpenAPI specs
import accountingRoutes from './accounting.routes.js';
import dispatchRoutes from './dispatch.routes.js';
import pricebookRoutes from './pricebook.routes.js';
import payrollRoutes from './payroll.routes.js';
import settingsRoutes from './settings.routes.js';
import equipmentRoutes from './equipment.routes.js';
import jbceRoutes from './jbce.routes.js';

// New modules added
import formsRoutes from './forms.routes.js';
import inventoryRoutes from './inventory.routes.js';
import jpmRoutes from './jpm.routes.js';
import marketingRoutes from './marketing.routes.js';
import marketingadsRoutes from './marketingads.routes.js';
import reportingRoutes from './reporting.routes.js';
import taskmanagementRoutes from './taskmanagement.routes.js';
import telecomRoutes from './telecom.routes.js';
import timesheetsRoutes from './timesheets.routes.js';

// Chat routes
import pricebookChatRoutes from './pricebook-chat.routes.js';

// Image proxy routes
import imagesRoutes from './images.routes.js';

// Scraper routes
import scrapersRoutes from './scrapers.routes.js';

// VAPI routes (voice AI integration)
import vapiRoutes from './vapi.routes.js';

// Database sync routes (PostgreSQL job sync)
import dbSyncRoutes from './db-sync.routes.js';

// Slack integration routes
import slackRoutes from './slack.routes.js';

// Scheduling routes (hybrid architecture)
import schedulingRoutes from './scheduling.routes.js';

// GHL integration routes (pipeline management, sync status)
import ghlRoutes from './ghl.routes.js';

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
// CORE API ROUTES (from OpenAPI specs)
// ═══════════════════════════════════════════════════════════════
router.use('/accounting', accountingRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/pricebook', pricebookRoutes);
router.use('/payroll', payrollRoutes);
router.use('/settings', settingsRoutes);
router.use('/equipment', equipmentRoutes);
router.use('/jbce', jbceRoutes);

// ═══════════════════════════════════════════════════════════════
// NEW API ROUTES (added 2025-12-04)
// ═══════════════════════════════════════════════════════════════
router.use('/forms', formsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/jpm', jpmRoutes);
router.use('/marketing', marketingRoutes);
router.use('/marketing-ads', marketingadsRoutes);
router.use('/reporting', reportingRoutes);
router.use('/task-management', taskmanagementRoutes);
router.use('/telecom', telecomRoutes);
router.use('/timesheets', timesheetsRoutes);

// ═══════════════════════════════════════════════════════════════
// CHAT ROUTES (AI-powered conversational interface)
// ═══════════════════════════════════════════════════════════════
router.use('/chat', pricebookChatRoutes);

// ═══════════════════════════════════════════════════════════════
// IMAGE PROXY ROUTES (serves ST images from our domain)
// ═══════════════════════════════════════════════════════════════
router.use('/images', imagesRoutes);

// ═══════════════════════════════════════════════════════════════
// SCRAPER ROUTES (vendor price scraping)
// ═══════════════════════════════════════════════════════════════
router.use('/scrapers', scrapersRoutes);

// ═══════════════════════════════════════════════════════════════
// VAPI ROUTES (voice AI integration for real-time availability)
// ═══════════════════════════════════════════════════════════════
router.use('/vapi', vapiRoutes);

// ═══════════════════════════════════════════════════════════════
// DATABASE SYNC ROUTES (PostgreSQL job sync - replaces Airtable)
// ═══════════════════════════════════════════════════════════════
router.use('/db', dbSyncRoutes);

// ═══════════════════════════════════════════════════════════════
// SLACK INTEGRATION ROUTES (Batch 9 - conversational bot, commands)
// ═══════════════════════════════════════════════════════════════
router.use('/slack', slackRoutes);

// ═══════════════════════════════════════════════════════════════
// SCHEDULING ROUTES (hybrid architecture: cached + real-time)
// ═══════════════════════════════════════════════════════════════
router.use('/scheduling', schedulingRoutes);

// ═══════════════════════════════════════════════════════════════
// GHL INTEGRATION ROUTES (pipeline management, sync, Install Pipeline)
// ═══════════════════════════════════════════════════════════════
router.use('/ghl', ghlRoutes);

export default router;
