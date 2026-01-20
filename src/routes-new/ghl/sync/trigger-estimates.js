/**
 * POST /ghl/sync/estimates
 * Trigger sync of pending estimates to GHL
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { syncPendingEstimatesToGHL } from '../../../integrations/ghl/index.js';

const logger = createLogger('ghl-routes:sync-estimates');

export const triggerEstimatesSync = asyncHandler(async (req, res) => {
  logger.info('Manual trigger: Estimates to GHL sync');

  const startTime = Date.now();
  const result = await syncPendingEstimatesToGHL();
  const duration = Date.now() - startTime;

  res.json({
    success: true,
    message: 'Estimates sync completed',
    durationMs: duration,
    result
  });
});

export default (router) => {
  router.post('/estimates', triggerEstimatesSync);
};
