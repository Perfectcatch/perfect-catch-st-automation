/**
 * Salesforce Integration Service
 * Main Application Entry Point
 * 
 * This service provides:
 * - OAuth connection to Salesforce
 * - Customer sync (PerfectCatch ↔ Salesforce)
 * - Webhook handlers for real-time sync
 * - Background worker for async processing
 */

import express, { Express } from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import helmet from 'helmet';
import cors from 'cors';

import { getConfig, loadConfig } from './config/environment';
import { redis, checkRedisHealth } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler, requireSalesforceConnection } from './middleware/validation';
import { getSalesforceService } from './services/salesforce.service';

import salesforceRoutes from './routes/salesforce.routes';
import webhookRoutes from './routes/webhooks.routes';

// Load configuration
const config = loadConfig();

// Initialize Express app
const app: Express = express();

// ============================================================
// Middleware
// ============================================================

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session (required for OAuth state)
app.use(session({
  store: new RedisStore({ client: redis }),
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
    });
  });
  next();
});

// ============================================================
// Routes
// ============================================================

// Health check
app.get('/health', async (req, res) => {
  const redisHealthy = await checkRedisHealth();
  const sf = getSalesforceService();
  const sfConnected = sf.isConnected();
  
  const healthy = redisHealthy;
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    services: {
      redis: redisHealthy ? 'connected' : 'disconnected',
      salesforce: sfConnected ? 'connected' : 'disconnected',
    },
    timestamp: new Date().toISOString(),
  });
});

// Salesforce routes
app.use('/api/salesforce', salesforceRoutes);

// Protected sync routes require Salesforce connection
app.use('/api/salesforce/sync', requireSalesforceConnection);

// Webhook routes
app.use('/webhooks', webhookRoutes);

// Error handler (must be last)
app.use(errorHandler);

// ============================================================
// Startup
// ============================================================

async function startServer(): Promise<void> {
  try {
    // Verify Redis connection
    const redisHealthy = await checkRedisHealth();
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connection verified');

    // Initialize Salesforce service
    const sf = getSalesforceService(config.salesforce);
    const hasTokens = await sf.loadStoredTokens();
    if (hasTokens) {
      logger.info('Loaded existing Salesforce tokens');
    } else {
      logger.info('No Salesforce tokens found - OAuth required');
    }

    // Start server
    app.listen(config.port, () => {
      logger.info(`Server started on port ${config.port}`, {
        environment: config.nodeEnv,
        salesforceLoginUrl: config.salesforce.loginUrl,
      });
    });
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// Start worker in separate process or alongside server
async function startWorker(): Promise<void> {
  const { scheduleFullSync } = await import('./services/sync-worker');
  await scheduleFullSync();
  logger.info('Sync worker started');
}

// Main entry point
if (require.main === module) {
  startServer();
  
  // Start worker if not running as separate process
  if (process.env.RUN_WORKER !== 'false') {
    startWorker();
  }
}

export { app, startServer };
