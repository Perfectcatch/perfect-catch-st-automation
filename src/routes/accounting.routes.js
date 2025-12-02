/**
 * Accounting Routes
 * ServiceTitan Accounting API endpoints
 * Includes: AP Bills, AP Credits, AP Payments, Invoices, Payments, GL Accounts, etc.
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

// ═══════════════════════════════════════════════════════════════
// AP BILLS
// ═══════════════════════════════════════════════════════════════
router.get('/ap-bills', createListHandler(stEndpoints.apBills.list));
router.get('/ap-bills/export', createExportHandler(stEndpoints.apBills.export));
router.get('/ap-bills/:id', createGetHandler(stEndpoints.apBills.get));
router.post('/ap-bills', createCreateHandler(stEndpoints.apBills.create));
router.patch('/ap-bills/:id', createUpdateHandler(stEndpoints.apBills.update, 'PATCH'));
router.delete('/ap-bills/:id', createDeleteHandler(stEndpoints.apBills.delete));

// ═══════════════════════════════════════════════════════════════
// AP CREDITS
// ═══════════════════════════════════════════════════════════════
router.get('/ap-credits', createListHandler(stEndpoints.apCredits.list));
router.get('/ap-credits/export', createExportHandler(stEndpoints.apCredits.export));
router.get('/ap-credits/:id', createGetHandler(stEndpoints.apCredits.get));

// ═══════════════════════════════════════════════════════════════
// AP PAYMENTS
// ═══════════════════════════════════════════════════════════════
router.get('/ap-payments', createListHandler(stEndpoints.apPayments.list));
router.get('/ap-payments/export', createExportHandler(stEndpoints.apPayments.export));
router.get('/ap-payments/:id', createGetHandler(stEndpoints.apPayments.get));

// ═══════════════════════════════════════════════════════════════
// CREDIT MEMOS
// ═══════════════════════════════════════════════════════════════
router.get('/credit-memos', createListHandler(stEndpoints.creditMemos.list));
router.get('/credit-memos/:id', createGetHandler(stEndpoints.creditMemos.get));

// ═══════════════════════════════════════════════════════════════
// DEPOSITS
// ═══════════════════════════════════════════════════════════════
router.get('/deposits', createListHandler(stEndpoints.deposits.list));
router.get('/deposits/:id', createGetHandler(stEndpoints.deposits.get));

// ═══════════════════════════════════════════════════════════════
// GL ACCOUNTS
// ═══════════════════════════════════════════════════════════════
router.get('/gl-accounts', createListHandler(stEndpoints.glAccounts.list));
router.get('/gl-accounts/:id', createGetHandler(stEndpoints.glAccounts.get));

// ═══════════════════════════════════════════════════════════════
// INVENTORY BILLS
// ═══════════════════════════════════════════════════════════════
router.get('/inventory-bills', createListHandler(stEndpoints.inventoryBills.list));
router.get('/inventory-bills/export', createExportHandler(stEndpoints.inventoryBills.export));
router.get('/inventory-bills/:id', createGetHandler(stEndpoints.inventoryBills.get));

// ═══════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════
router.get('/invoices', createListHandler(stEndpoints.invoices.list));
router.get('/invoices/export', createExportHandler(stEndpoints.invoices.export));
router.get('/invoices/:id', createGetHandler(stEndpoints.invoices.get));

// ═══════════════════════════════════════════════════════════════
// JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════════
router.get('/journal-entries', createListHandler(stEndpoints.journalEntries.list));
router.get('/journal-entries/export', createExportHandler(stEndpoints.journalEntries.export));
router.get('/journal-entries/:id', createGetHandler(stEndpoints.journalEntries.get));
router.post('/journal-entries', createCreateHandler(stEndpoints.journalEntries.create));

// ═══════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════
router.get('/payments', createListHandler(stEndpoints.payments.list));
router.get('/payments/export', createExportHandler(stEndpoints.payments.export));
router.get('/payments/:id', createGetHandler(stEndpoints.payments.get));

// ═══════════════════════════════════════════════════════════════
// PAYMENT TERMS
// ═══════════════════════════════════════════════════════════════
router.get('/payment-terms', createListHandler(stEndpoints.paymentTerms.list));
router.get('/payment-terms/:id', createGetHandler(stEndpoints.paymentTerms.get));

// ═══════════════════════════════════════════════════════════════
// PAYMENT TYPES
// ═══════════════════════════════════════════════════════════════
router.get('/payment-types', createListHandler(stEndpoints.paymentTypes.list));
router.get('/payment-types/:id', createGetHandler(stEndpoints.paymentTypes.get));

// ═══════════════════════════════════════════════════════════════
// REMITTANCE VENDORS
// ═══════════════════════════════════════════════════════════════
router.get('/remittance-vendors', createListHandler(stEndpoints.remittanceVendors.list));
router.get('/remittance-vendors/:id', createGetHandler(stEndpoints.remittanceVendors.get));

// ═══════════════════════════════════════════════════════════════
// TAX ZONES
// ═══════════════════════════════════════════════════════════════
router.get('/tax-zones', createListHandler(stEndpoints.taxZones.list));
router.get('/tax-zones/:id', createGetHandler(stEndpoints.taxZones.get));

export default router;
