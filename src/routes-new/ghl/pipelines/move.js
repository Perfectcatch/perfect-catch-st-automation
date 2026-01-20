/**
 * POST /ghl/install-pipeline/move/:installJobId
 * Move specific opportunity to Install Pipeline
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { moveOpportunityToInstallPipeline } from '../../../integrations/ghl/move-to-install-pipeline.js';

const logger = createLogger('ghl-routes:install-move');

export const moveToInstallPipeline = asyncHandler(async (req, res) => {
  const { installJobId } = req.params;
  const { customerId } = req.body;

  if (!customerId) {
    return res.status(400).json({
      success: false,
      error: 'customerId is required in request body'
    });
  }

  logger.info('Manual move to Install Pipeline', { installJobId, customerId });

  const opportunityId = await moveOpportunityToInstallPipeline(
    parseInt(installJobId),
    parseInt(customerId)
  );

  res.json({
    success: true,
    message: opportunityId
      ? 'Opportunity moved to Install Pipeline'
      : 'No opportunity found in Job Sold stage',
    opportunityId
  });
});

export default (router) => {
  router.post('/install-pipeline/move/:installJobId', moveToInstallPipeline);
};
