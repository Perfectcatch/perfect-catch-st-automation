/**
 * Route Aggregator - Refactored
 * Combines all route modules with one-file-per-endpoint pattern
 *
 * New modular routes:
 *   /ghl/*         - GHL integration (refactored)
 *   /health/*      - Health checks (refactored)
 *   /workers/*     - Worker management (new)
 *
 * Legacy routes (to be migrated):
 *   All other routes from original routes/index.js
 */

import { Router } from 'express';

// New modular routes
import ghlRoutes from './ghl/index.js';
import healthRoutes from './health/index.js';

// Legacy route imports (to maintain backwards compatibility)
// These will be gradually migrated to new pattern
import jobsRoutes from '../routes/jobs.routes.js';
import customersRoutes from '../routes/customers.routes.js';
import estimatesRoutes from '../routes/estimates.routes.js';
import opportunitiesRoutes from '../routes/opportunities.routes.js';
import accountingRoutes from '../routes/accounting.routes.js';
import dispatchRoutes from '../routes/dispatch.routes.js';
import pricebookRoutes from '../routes/pricebook.routes.js';
import payrollRoutes from '../routes/payroll.routes.js';
import settingsRoutes from '../routes/settings.routes.js';
import equipmentRoutes from '../routes/equipment.routes.js';
import jbceRoutes from '../routes/jbce.routes.js';
import formsRoutes from '../routes/forms.routes.js';
import inventoryRoutes from '../routes/inventory.routes.js';
import jpmRoutes from '../routes/jpm.routes.js';
import marketingRoutes from '../routes/marketing.routes.js';
import marketingadsRoutes from '../routes/marketingads.routes.js';
import reportingRoutes from '../routes/reporting.routes.js';
import taskmanagementRoutes from '../routes/taskmanagement.routes.js';
import telecomRoutes from '../routes/telecom.routes.js';
import timesheetsRoutes from '../routes/timesheets.routes.js';
import pricebookChatRoutes from '../routes/pricebook-chat.routes.js';
import imagesRoutes from '../routes/images.routes.js';
import scrapersRoutes from '../routes/scrapers.routes.js';
import vapiRoutes from '../routes/vapi.routes.js';
import dbSyncRoutes from '../routes/db-sync.routes.js';
import slackRoutes from '../routes/slack.routes.js';
import schedulingRoutes from '../routes/scheduling.routes.js';
import crmRoutes from '../routes/crm.routes.js';
import monitorRoutes from '../routes/monitor.routes.js';

// Worker management
import workers from '../workers-new/index.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// NEW MODULAR ROUTES
// ═══════════════════════════════════════════════════════════════

// Health endpoints (refactored)
router.use('/health', healthRoutes);

// GHL integration (refactored with webhooks)
router.use('/ghl', ghlRoutes);

// ═══════════════════════════════════════════════════════════════
// WORKER MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /workers/status - Get all worker status
router.get('/workers/status', (req, res) => {
  res.json({
    success: true,
    workers: workers.getWorkersStatus()
  });
});

// POST /workers/:name/run - Trigger a specific worker
router.post('/workers/:name/run', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await workers.runWorker(name);
    res.json({ success: true, result });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /workers/:name/enable - Enable a worker
router.post('/workers/:name/enable', (req, res) => {
  try {
    const { name } = req.params;
    workers.enableWorker(name);
    res.json({ success: true, message: `Worker ${name} enabled` });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// POST /workers/:name/disable - Disable a worker
router.post('/workers/:name/disable', (req, res) => {
  try {
    const { name } = req.params;
    workers.disableWorker(name);
    res.json({ success: true, message: `Worker ${name} disabled` });
  } catch (error) {
    res.status(404).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// LEGACY ROUTES (maintaining backwards compatibility)
// ═══════════════════════════════════════════════════════════════

router.use('/jobs', jobsRoutes);
router.use('/customers', customersRoutes);
router.use('/estimates', estimatesRoutes);
router.use('/opportunities', opportunitiesRoutes);
router.use('/accounting', accountingRoutes);
router.use('/dispatch', dispatchRoutes);
router.use('/pricebook', pricebookRoutes);
router.use('/payroll', payrollRoutes);
router.use('/settings', settingsRoutes);
router.use('/equipment', equipmentRoutes);
router.use('/jbce', jbceRoutes);
router.use('/forms', formsRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/jpm', jpmRoutes);
router.use('/marketing', marketingRoutes);
router.use('/marketing-ads', marketingadsRoutes);
router.use('/reporting', reportingRoutes);
router.use('/task-management', taskmanagementRoutes);
router.use('/telecom', telecomRoutes);
router.use('/timesheets', timesheetsRoutes);
router.use('/chat', pricebookChatRoutes);
router.use('/images', imagesRoutes);
router.use('/scrapers', scrapersRoutes);
router.use('/vapi', vapiRoutes);
router.use('/db', dbSyncRoutes);
router.use('/slack', slackRoutes);
router.use('/scheduling', schedulingRoutes);
router.use('/crm', crmRoutes);
router.use('/api/monitor', monitorRoutes);

export default router;
