/**
 * GET /ghl/install-pipeline/pending
 * Get install jobs pending opportunity move
 * Shows install jobs where the customer has an opportunity in Job Sold stage
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { detectInstallJobsNeedingMove } from '../../../integrations/ghl/move-to-install-pipeline.js';

const logger = createLogger('ghl-routes:install-pending');

export const getPendingInstallMoves = asyncHandler(async (req, res) => {
  const pendingMoves = await detectInstallJobsNeedingMove();

  res.json({
    success: true,
    count: pendingMoves.length,
    description: 'Install jobs with opportunities still in Sales Pipeline (Job Sold stage)',
    data: pendingMoves
  });
});

export default (router) => {
  router.get('/install-pipeline/pending', getPendingInstallMoves);
};
