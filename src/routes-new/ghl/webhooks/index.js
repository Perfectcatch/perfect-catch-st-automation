/**
 * GHL Webhooks Routes Aggregator
 */

import { Router } from 'express';
import contactCreatedRoute from './contact-created.js';
import contactUpdatedRoute from './contact-updated.js';
import opportunityCreatedRoute from './opportunity-created.js';
import opportunityStageChangedRoute from './opportunity-stage-changed.js';

const router = Router();

contactCreatedRoute(router);
contactUpdatedRoute(router);
opportunityCreatedRoute(router);
opportunityStageChangedRoute(router);

export default router;
