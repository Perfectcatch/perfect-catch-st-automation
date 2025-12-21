/**
 * Express Application Setup
 * Configures middleware, routes, and error handling
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import config from './config/index.js';
import routes from './routes/index.js';
import { requestLogger, errorHandler, apiKeyAuth, notFound } from './middleware/index.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('app');

// Handle BigInt serialization for JSON responses
BigInt.prototype.toJSON = function() {
  return this.toString();
};

// Create Express app
const app = express();

// ---------------------------------------------------------------
// OPTIONAL: PRICEBOOK ENGINE INITIALIZATION (requires DATABASE_URL)
// ---------------------------------------------------------------

let syncEngine = null;
let syncScheduler = null;
let schedulingSyncEngine = null;
let schedulingSyncScheduler = null;

/**
 * Initialize optional pricebook sync engine
 * Only initializes if DATABASE_URL is configured and modules exist
 */
async function initializeOptionalEngines() {
  // Skip if DATABASE_URL not configured
  if (!process.env.DATABASE_URL) {
    logger.info('DATABASE_URL not configured - Sync engine features disabled (this is OK)');
    return;
  }

  try {
    // Dynamically import optional modules (they may not exist in all deployments)
    const { getPrismaClient, checkDatabaseConnection } = await import('./db/prisma.js');
    const { stRequest } = await import('./services/stClient.js');
    
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed - Sync engine disabled');
      return;
    }

    const prisma = getPrismaClient();
    const stClient = { stRequest };

    // Try to load pricebook sync engine (optional)
    try {
      const { PricebookSyncEngine, SyncScheduler, createSyncRouter } = await import('./sync/pricebook/index.js');
      syncEngine = new PricebookSyncEngine(prisma, stClient);
      syncScheduler = new SyncScheduler(syncEngine, {
        enabled: process.env.SYNC_SCHEDULER_ENABLED !== 'false',
      });
      app.set('syncEngine', syncEngine);
      app.set('syncScheduler', syncScheduler);

      if (process.env.SYNC_SCHEDULER_ENABLED !== 'false') {
        syncScheduler.start();
      }
      logger.info('Pricebook sync engine initialized');
    } catch (e) {
      logger.debug('Pricebook sync engine modules not available (optional)');
    }

    // Try to load scheduling sync engine (optional)
    try {
      const { SchedulingSyncEngine, SchedulingSyncScheduler, createSchedulingSyncRouter } = await import('./sync/scheduling/index.js');
      schedulingSyncEngine = new SchedulingSyncEngine(stClient);
      schedulingSyncScheduler = new SchedulingSyncScheduler(schedulingSyncEngine, {
        enabled: process.env.SCHEDULING_SYNC_ENABLED !== 'false',
      });
      app.set('schedulingSyncEngine', schedulingSyncEngine);
      app.set('schedulingSyncScheduler', schedulingSyncScheduler);

      if (process.env.SCHEDULING_SYNC_ENABLED !== 'false') {
        schedulingSyncScheduler.start();
      }
      logger.info('Scheduling sync engine initialized');
    } catch (e) {
      logger.debug('Scheduling sync engine modules not available (optional)');
    }

    // Try to load n8n integration (optional)
    try {
      const { N8nWebhookHandler, WebhookSender, pricebookEvents } = await import('./integrations/n8n/index.js');
      const n8nHandler = new N8nWebhookHandler(prisma, stClient);
      const webhookSender = new WebhookSender(prisma);
      pricebookEvents.setWebhookSender(webhookSender);
      app.set('n8nHandler', n8nHandler);
      app.set('webhookSender', webhookSender);
      logger.info('n8n webhook integration initialized');
    } catch (e) {
      logger.debug('n8n integration modules not available (optional)');
    }

    app.set('prisma', prisma);
  } catch (error) {
    logger.warn({ error: error.message }, 'Optional engine initialization skipped');
  }
}

// Initialize optional engines (non-blocking)
initializeOptionalEngines();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ---------------------------------------------------------------
// GLOBAL MIDDLEWARE
// ---------------------------------------------------------------

// Request logging
app.use(requestLogger);

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (if configured)
if (config.rateLimit.maxRequests > 0) {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    },
  });
  app.use(limiter);
}

// Optional API key authentication (if API_KEY is set)
app.use(apiKeyAuth);

// CORS headers for n8n and other clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, ST-App-Key');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// ---------------------------------------------------------------
// STATIC FILES (monitoring dashboard)
// ---------------------------------------------------------------
app.use('/dashboard', express.static(path.join(__dirname, '..', 'public')));

// Serve monitor dashboard at /monitor
app.get('/monitor', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'monitor.html'));
});

// ---------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------

// Mount all routes
app.use('/', routes);

// Mount pricebook sync routes (conditionally - requires sync engine)
app.use('/api/sync/pricebook', async (req, res, next) => {
  const syncEngine = app.get('syncEngine');
  const syncScheduler = app.get('syncScheduler');
  
  if (!syncEngine || !syncScheduler) {
    return res.status(503).json({
      success: false,
      error: 'Pricebook sync engine not initialized. Check DATABASE_URL configuration.',
    });
  }
  
  try {
    const { createSyncRouter } = await import('./sync/pricebook/index.js');
    const syncRouter = createSyncRouter(syncEngine, syncScheduler);
    syncRouter(req, res, next);
  } catch (e) {
    return res.status(503).json({ success: false, error: 'Sync module not available' });
  }
});

// Mount scheduling sync routes (conditionally - requires scheduling sync engine)
app.use('/api/sync/scheduling', async (req, res, next) => {
  const schedulingSyncEngine = app.get('schedulingSyncEngine');
  const schedulingSyncScheduler = app.get('schedulingSyncScheduler');

  if (!schedulingSyncEngine || !schedulingSyncScheduler) {
    return res.status(503).json({
      success: false,
      error: 'Scheduling sync engine not initialized. Check DATABASE_URL configuration.',
    });
  }

  try {
    const { createSchedulingSyncRouter } = await import('./sync/scheduling/index.js');
    const schedulingSyncRouter = createSchedulingSyncRouter(schedulingSyncEngine, schedulingSyncScheduler);
    schedulingSyncRouter(req, res, next);
  } catch (e) {
    return res.status(503).json({ success: false, error: 'Scheduling sync module not available' });
  }
});

// Mount Salesforce routes (conditionally - requires Redis)
app.use('/api/salesforce', async (req, res, next) => {
  try {
    const salesforceRoutes = (await import('./routes/salesforce.routes.js')).default;
    salesforceRoutes(req, res, next);
  } catch (e) {
    return res.status(503).json({ success: false, error: 'Salesforce module not available: ' + e.message });
  }
});

// Mount n8n routes (conditionally - requires n8n integration)
app.use('/api/n8n', async (req, res, next) => {
  const n8nHandler = app.get('n8nHandler');
  const webhookSender = app.get('webhookSender');
  const prisma = app.get('prisma');
  
  if (!n8nHandler || !webhookSender || !prisma) {
    return res.status(503).json({
      success: false,
      error: 'n8n integration not initialized. Check DATABASE_URL configuration.',
    });
  }
  
  try {
    const { createN8nRouter } = await import('./integrations/n8n/index.js');
    const n8nRouter = createN8nRouter(n8nHandler, webhookSender, prisma);
    n8nRouter(req, res, next);
  } catch (e) {
    return res.status(503).json({ success: false, error: 'n8n module not available' });
  }
});

// ---------------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------------

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

export default app;
