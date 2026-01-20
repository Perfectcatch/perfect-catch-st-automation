/**
 * GHL Pipelines Routes Aggregator
 */

import { Router } from 'express';
import listRoute from './list.js';
import pendingRoute from './pending.js';
import processRoute from './process.js';
import moveRoute from './move.js';
import inProgressRoute from './in-progress.js';

const router = Router();

listRoute(router);
pendingRoute(router);
processRoute(router);
moveRoute(router);
inProgressRoute(router);

export default router;
