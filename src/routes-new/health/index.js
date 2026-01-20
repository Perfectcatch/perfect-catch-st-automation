/**
 * Health Routes Aggregator
 *
 * Routes:
 *   GET /health/ready     - Kubernetes readiness probe
 *   GET /health/live      - Kubernetes liveness probe
 *   GET /health/detailed  - Detailed component health
 *   GET /health/metrics   - Prometheus metrics
 */

import { Router } from 'express';
import readyRoute from './ready.js';
import liveRoute from './live.js';
import detailedRoute from './detailed.js';
import metricsRoute from './metrics.js';

const router = Router();

readyRoute(router);
liveRoute(router);
detailedRoute(router);
metricsRoute(router);

// Simple health check at root
router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
