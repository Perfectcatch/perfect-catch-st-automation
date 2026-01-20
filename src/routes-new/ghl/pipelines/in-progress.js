/**
 * POST /ghl/install-pipeline/in-progress
 * Process opportunities that need to move to "In Progress / On Site" stage
 * Checks for dispatched or working appointments and moves the opportunity
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { processInProgressMoves, detectOpportunitiesNeedingInProgressMove } from '../../../integrations/ghl/move-to-in-progress.js';

const logger = createLogger('ghl-routes:in-progress');

/**
 * Process all opportunities that need to move to In Progress stage
 */
export const processInProgress = asyncHandler(async (req, res) => {
  logger.info('Manual trigger: Processing in-progress stage moves');

  const result = await processInProgressMoves();

  res.json({
    success: true,
    message: `Moved ${result.moved} opportunities to In Progress / On Site`,
    result
  });
});

/**
 * Check which opportunities would be moved (dry run)
 */
export const checkInProgress = asyncHandler(async (req, res) => {
  logger.info('Checking opportunities eligible for In Progress move');

  const opportunities = await detectOpportunitiesNeedingInProgressMove();

  res.json({
    success: true,
    message: `Found ${opportunities.length} opportunities with active appointments`,
    count: opportunities.length,
    opportunities
  });
});

export default (router) => {
  router.post('/install-pipeline/in-progress', processInProgress);
  router.get('/install-pipeline/in-progress/check', checkInProgress);
};
