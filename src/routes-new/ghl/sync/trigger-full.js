/**
 * POST /ghl/sync/full
 * Trigger a full GHL sync (contacts and opportunities)
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { syncAllFromGHL } from '../../../integrations/ghl/index.js';

const logger = createLogger('ghl-routes:sync-full');

export const triggerFullSync = asyncHandler(async (req, res) => {
  logger.info('Manual trigger: Full GHL sync');

  const startTime = Date.now();
  const result = await syncAllFromGHL();
  const duration = Date.now() - startTime;

  res.json({
    success: true,
    message: 'Full GHL sync completed',
    durationMs: duration,
    result
  });
});

export default (router) => {
  router.post('/full', triggerFullSync);
};
