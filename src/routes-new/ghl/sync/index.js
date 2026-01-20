/**
 * GHL Sync Routes Aggregator
 */

import { Router } from 'express';
import statusRoute from './status.js';
import triggerFullRoute from './trigger-full.js';
import triggerEstimatesRoute from './trigger-estimates.js';
import backfillRoute from './backfill.js';

const router = Router();

statusRoute(router);
triggerFullRoute(router);
triggerEstimatesRoute(router);
backfillRoute(router);

export default router;
