/**
 * POST /ghl/sync/backfill
 * Backfill existing opportunities with ST data and proper naming
 *
 * Query params:
 *   - limit: Max opportunities to process (default: 100)
 *   - dryRun: If true, don't actually update (default: false)
 *
 * POST /ghl/sync/backfill/:opportunityId
 * Backfill a single opportunity by GHL ID
 *
 * POST /ghl/sync/job-types
 * Sync job types from ServiceTitan
 */

import { asyncHandler } from '../../../middleware/asyncHandler.js';
import { createLogger } from '../../../lib/logger.js';
import { backfillAllOpportunities, backfillOpportunity } from '../../../integrations/ghl/backfill-opportunities.js';
import { syncJobTypes } from '../../../integrations/ghl/sync-job-types.js';

const logger = createLogger('ghl-routes:backfill');

export const runBackfill = asyncHandler(async (req, res) => {
  const { limit = 100, dryRun = 'false' } = req.query;

  logger.info('Starting opportunity backfill', { limit, dryRun });

  const result = await backfillAllOpportunities({
    limit: parseInt(limit),
    dryRun: dryRun === 'true'
  });

  res.json({
    success: true,
    message: dryRun === 'true' ? 'Dry run completed' : 'Backfill completed',
    stats: {
      total: result.total,
      updated: result.updated,
      failed: result.failed,
      skipped: result.skipped
    },
    details: result.details
  });
});

export const backfillSingle = asyncHandler(async (req, res) => {
  const { opportunityId } = req.params;

  logger.info('Backfilling single opportunity', { opportunityId });

  const result = await backfillOpportunity(opportunityId);

  if (result.success) {
    res.json({
      success: true,
      message: 'Opportunity updated',
      data: result
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error
    });
  }
});

export const syncJobTypesRoute = asyncHandler(async (req, res) => {
  logger.info('Syncing job types from ServiceTitan');

  const result = await syncJobTypes();

  res.json({
    success: true,
    message: 'Job types synced',
    stats: result
  });
});

export default (router) => {
  router.post('/backfill', runBackfill);
  router.post('/backfill/:opportunityId', backfillSingle);
  router.post('/job-types', syncJobTypesRoute);
};
