/**
 * POST /ghl/install-pipeline/process
 * Process all pending install job moves
 * Moves opportunities from Sales Pipeline to Install Pipeline
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { processInstallJobMoves } from '../../../integrations/ghl/move-to-install-pipeline.js';

const logger = createLogger('ghl-routes:install-process');

export const processInstallMoves = asyncHandler(async (req, res) => {
  logger.info('Manual trigger: Processing install job moves');

  const result = await processInstallJobMoves();

  res.json({
    success: true,
    message: `Processed ${result.total} install jobs`,
    result
  });
});

export default (router) => {
  router.post('/install-pipeline/process', processInstallMoves);
};
