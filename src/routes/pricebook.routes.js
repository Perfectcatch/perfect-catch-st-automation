/**
 * Pricebook Routes
 * ServiceTitan Pricebook API endpoints
 * Includes: Services, Materials, Equipment, Categories, Discounts, etc.
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
  createExportHandler,
  createActionHandler,
} from '../controllers/generic.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════
router.get('/services', createListHandler(stEndpoints.services.list));
router.get('/services/export', createExportHandler(stEndpoints.services.export));
router.get('/services/:id', createGetHandler(stEndpoints.services.get));
router.post('/services', createCreateHandler(stEndpoints.services.create));
router.patch('/services/:id', createUpdateHandler(stEndpoints.services.update, 'PATCH'));
router.delete('/services/:id', createDeleteHandler(stEndpoints.services.delete));

// ═══════════════════════════════════════════════════════════════
// MATERIALS
// ═══════════════════════════════════════════════════════════════
router.get('/materials', createListHandler(stEndpoints.materials.list));
router.get('/materials/export', createExportHandler(stEndpoints.materials.export));
router.get('/materials/:id', createGetHandler(stEndpoints.materials.get));
router.post('/materials', createCreateHandler(stEndpoints.materials.create));
router.patch('/materials/:id', createUpdateHandler(stEndpoints.materials.update, 'PATCH'));
router.delete('/materials/:id', createDeleteHandler(stEndpoints.materials.delete));

// ═══════════════════════════════════════════════════════════════
// MATERIALS MARKUP
// ═══════════════════════════════════════════════════════════════
router.get('/materials-markup', createListHandler(stEndpoints.materialsMarkup.list));
router.get('/materials-markup/:id', createGetHandler(stEndpoints.materialsMarkup.get));
router.post('/materials-markup', createCreateHandler(stEndpoints.materialsMarkup.create));
router.patch('/materials-markup/:id', createUpdateHandler(stEndpoints.materialsMarkup.update, 'PATCH'));
router.delete('/materials-markup/:id', createDeleteHandler(stEndpoints.materialsMarkup.delete));

// ═══════════════════════════════════════════════════════════════
// EQUIPMENT
// ═══════════════════════════════════════════════════════════════
router.get('/equipment', createListHandler(stEndpoints.equipment.list));
router.get('/equipment/:id', createGetHandler(stEndpoints.equipment.get));
router.post('/equipment', createCreateHandler(stEndpoints.equipment.create));
router.patch('/equipment/:id', createUpdateHandler(stEndpoints.equipment.update, 'PATCH'));
router.delete('/equipment/:id', createDeleteHandler(stEndpoints.equipment.delete));

// ═══════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════
router.get('/categories', createListHandler(stEndpoints.categories.list));
router.get('/categories/:id', createGetHandler(stEndpoints.categories.get));
router.post('/categories', createCreateHandler(stEndpoints.categories.create));
router.patch('/categories/:id', createUpdateHandler(stEndpoints.categories.update, 'PATCH'));
router.delete('/categories/:id', createDeleteHandler(stEndpoints.categories.delete));

// ═══════════════════════════════════════════════════════════════
// DISCOUNTS AND FEES
// ═══════════════════════════════════════════════════════════════
router.get('/discounts-and-fees', createListHandler(stEndpoints.discountAndFees.list));
router.get('/discounts-and-fees/:id', createGetHandler(stEndpoints.discountAndFees.get));
router.post('/discounts-and-fees', createCreateHandler(stEndpoints.discountAndFees.create));
router.patch('/discounts-and-fees/:id', createUpdateHandler(stEndpoints.discountAndFees.update, 'PATCH'));
router.delete('/discounts-and-fees/:id', createDeleteHandler(stEndpoints.discountAndFees.delete));

// ═══════════════════════════════════════════════════════════════
// CLIENT SPECIFIC PRICING
// ═══════════════════════════════════════════════════════════════
router.get('/client-specific-pricing', createListHandler(stEndpoints.clientSpecificPricing.list));
router.patch('/client-specific-pricing/:id', createUpdateHandler(stEndpoints.clientSpecificPricing.update, 'PATCH'));

// ═══════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════
router.post('/bulk/import', createActionHandler(stEndpoints.pricebookBulk.import));
router.get('/bulk/export', createExportHandler(stEndpoints.pricebookBulk.export));

// ═══════════════════════════════════════════════════════════════
// IMAGES
// ═══════════════════════════════════════════════════════════════
router.post('/images', createActionHandler(stEndpoints.images.upload));

export default router;
