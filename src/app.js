/**
 * Express Application Setup
 * Configures middleware, routes, and error handling
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import routes from './routes/index.js';
import { requestLogger, errorHandler, apiKeyAuth, notFound } from './middleware/index.js';

// Create Express app
const app = express();

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
// ROUTES
// ---------------------------------------------------------------

// Mount all routes
app.use('/', routes);

// ---------------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------------

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

export default app;
