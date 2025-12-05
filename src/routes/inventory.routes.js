/**
 * Inventory Routes
 * ServiceTitan Inventory API endpoints
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
} from '../controllers/generic.controller.js';

const router = Router();

// Adjustments
router.get('/adjustments', createListHandler(stEndpoints.adjustments.list));
router.get('/adjustments/export', createExportHandler(stEndpoints.adjustments.export));
router.get('/adjustments/:id', createGetHandler(stEndpoints.adjustments.get));
router.post('/adjustments', createCreateHandler(stEndpoints.adjustments.create));
router.patch('/adjustments/:id', createUpdateHandler(stEndpoints.adjustments.update, 'PATCH'));

// Purchase Orders
router.get('/purchase-orders', createListHandler(stEndpoints.purchaseOrders.list));
router.get('/purchase-orders/export', createExportHandler(stEndpoints.purchaseOrders.export));
router.get('/purchase-orders/:id', createGetHandler(stEndpoints.purchaseOrders.get));
router.post('/purchase-orders', createCreateHandler(stEndpoints.purchaseOrders.create));
router.patch('/purchase-orders/:id', createUpdateHandler(stEndpoints.purchaseOrders.update, 'PATCH'));
router.delete('/purchase-orders/:id', createDeleteHandler(stEndpoints.purchaseOrders.delete));

// Purchase Orders Markup
router.get('/purchase-orders-markup', createListHandler(stEndpoints.purchaseOrdersMarkup.list));
router.get('/purchase-orders-markup/:id', createGetHandler(stEndpoints.purchaseOrdersMarkup.get));

// Purchase Order Types
router.get('/purchase-order-types', createListHandler(stEndpoints.purchaseOrderTypes.list));
router.get('/purchase-order-types/:id', createGetHandler(stEndpoints.purchaseOrderTypes.get));

// Receipts
router.get('/receipts', createListHandler(stEndpoints.receipts.list));
router.get('/receipts/export', createExportHandler(stEndpoints.receipts.export));
router.get('/receipts/:id', createGetHandler(stEndpoints.receipts.get));
router.post('/receipts', createCreateHandler(stEndpoints.receipts.create));

// Returns
router.get('/returns', createListHandler(stEndpoints.returns.list));
router.get('/returns/export', createExportHandler(stEndpoints.returns.export));
router.get('/returns/:id', createGetHandler(stEndpoints.returns.get));
router.post('/returns', createCreateHandler(stEndpoints.returns.create));

// Return Types
router.get('/return-types', createListHandler(stEndpoints.returnTypes.list));
router.get('/return-types/:id', createGetHandler(stEndpoints.returnTypes.get));

// Transfers
router.get('/transfers', createListHandler(stEndpoints.transfers.list));
router.get('/transfers/export', createExportHandler(stEndpoints.transfers.export));
router.get('/transfers/:id', createGetHandler(stEndpoints.transfers.get));
router.post('/transfers', createCreateHandler(stEndpoints.transfers.create));
router.patch('/transfers/:id', createUpdateHandler(stEndpoints.transfers.update, 'PATCH'));

// Trucks
router.get('/trucks', createListHandler(stEndpoints.trucks.list));
router.get('/trucks/:id', createGetHandler(stEndpoints.trucks.get));

// Vendors
router.get('/vendors', createListHandler(stEndpoints.vendors.list));
router.get('/vendors/export', createExportHandler(stEndpoints.vendors.export));
router.get('/vendors/:id', createGetHandler(stEndpoints.vendors.get));
router.post('/vendors', createCreateHandler(stEndpoints.vendors.create));
router.patch('/vendors/:id', createUpdateHandler(stEndpoints.vendors.update, 'PATCH'));

// Warehouses
router.get('/warehouses', createListHandler(stEndpoints.warehouses.list));
router.get('/warehouses/:id', createGetHandler(stEndpoints.warehouses.get));

export default router;
