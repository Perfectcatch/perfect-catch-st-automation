/**
 * GET /health/live
 * Kubernetes liveness probe endpoint
 * Returns 200 if app process is running
 */

import { asyncHandler } from '../../middleware/asyncHandler.js';

export const healthLive = asyncHandler(async (req, res) => {
  res.json({
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

export default (router) => {
  router.get('/live', healthLive);
};
