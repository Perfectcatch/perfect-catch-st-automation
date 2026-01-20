/**
 * GHL Opportunities Routes Aggregator
 */

import { Router } from 'express';
import byCustomerRoute from './by-customer.js';
import installPipelineRoute from './install-pipeline.js';
import jobTraceRoute from './job-trace.js';

const router = Router();

byCustomerRoute(router);
installPipelineRoute(router);
jobTraceRoute(router);

export default router;
