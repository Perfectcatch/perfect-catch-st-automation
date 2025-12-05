/**
 * Marketing Routes
 * ServiceTitan Marketing API endpoints
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// Campaign Categories
router.get('/categories', createListHandler(stEndpoints.campaignCategories.list));
router.get('/categories/:id', createGetHandler(stEndpoints.campaignCategories.get));

// Campaigns
router.get('/campaigns', createListHandler(stEndpoints.campaigns.list));
router.get('/campaigns/:id', createGetHandler(stEndpoints.campaigns.get));
router.post('/campaigns', createCreateHandler(stEndpoints.campaigns.create));
router.patch('/campaigns/:id', createUpdateHandler(stEndpoints.campaigns.update, 'PATCH'));

// Campaign Costs
router.get('/campaign-costs', createListHandler(stEndpoints.campaignCosts.list));
router.get('/campaign-costs/:id', createGetHandler(stEndpoints.campaignCosts.get));
router.post('/campaign-costs', createCreateHandler(stEndpoints.campaignCosts.create));
router.patch('/campaign-costs/:id', createUpdateHandler(stEndpoints.campaignCosts.update, 'PATCH'));
router.delete('/campaign-costs/:id', createDeleteHandler(stEndpoints.campaignCosts.delete));

// Campaign Cost Summary
router.get('/campaign-cost-summary', createListHandler(stEndpoints.campaignCostSummary.list));

// Email Channel Cost
router.get('/email-channel-cost', createListHandler(stEndpoints.emailChannelCost.list));

// Suppressions
router.get('/suppressions', createListHandler(stEndpoints.suppressions.list));
router.post('/suppressions', createCreateHandler(stEndpoints.suppressions.create));
router.delete('/suppressions/:id', createDeleteHandler(stEndpoints.suppressions.delete));

export default router;
