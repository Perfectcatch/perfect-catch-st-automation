/**
 * Accounting Module Fetchers
 *
 * Fetchers for:
 * - raw_st_invoices
 * - raw_st_payments
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// INVOICES FETCHER
// ============================================================================

export class InvoicesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_invoices',
      endpoint: '/accounting/v2/tenant/{tenant}/invoices',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'reference_number',
      'invoice_date',
      'due_date',
      'subtotal',
      'sales_tax',
      'total',
      'balance',
      'invoice_type',
      'customer',
      'customer_address',
      'location',
      'location_address',
      'business_unit',
      'job',
      'items',
      'custom_fields',
      'active',
      'sync_status',
      'paid_on',
      'summary',
      'discount_total',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      reference_number: record.referenceNumber,
      invoice_date: record.invoiceDate,
      due_date: record.dueDate,
      subtotal: record.subTotal || 0,
      sales_tax: record.salesTax || 0,
      total: record.total || 0,
      balance: record.balance || 0,
      invoice_type: record.invoiceType,
      customer: record.customer,
      customer_address: record.customerAddress,
      location: record.location,
      location_address: record.locationAddress,
      business_unit: record.businessUnit,
      job: record.job,
      items: record.items || [],
      custom_fields: record.customFields || [],
      active: record.active ?? true,
      sync_status: record.syncStatus,
      paid_on: record.paidOn,
      summary: record.summary,
      discount_total: record.discountTotal || 0,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// PAYMENTS FETCHER
// ============================================================================

export class PaymentsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_payments',
      endpoint: '/accounting/v2/tenant/{tenant}/payments',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'active',
      'applied_to',
      'auth_code',
      'batch',
      'business_unit',
      'check_number',
      'created_by',
      'customer',
      'custom_fields',
      'payment_date',
      'deposit',
      'gl_account',
      'memo',
      'reference_number',
      'total',
      'payment_type',
      'type_id',
      'unapplied_amount',
      'sync_status',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      active: record.active ?? true,
      applied_to: record.appliedTo || [],
      auth_code: record.authCode,
      batch: record.batch,
      business_unit: record.businessUnit,
      check_number: record.checkNumber,
      created_by: record.createdBy,
      customer: record.customer,
      custom_fields: record.customFields || [],
      payment_date: record.date,
      deposit: record.deposit,
      gl_account: record.generalLedgerAccount,
      memo: record.memo,
      reference_number: record.referenceNumber,
      total: record.total || 0,
      payment_type: record.type,
      type_id: record.typeId,
      unapplied_amount: record.unappliedAmount || 0,
      sync_status: record.syncStatus,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllAccounting() {
  const results = {};

  const fetchers = [
    { name: 'invoices', fetcher: new InvoicesFetcher() },
    { name: 'payments', fetcher: new PaymentsFetcher() },
  ];

  for (const { name, fetcher } of fetchers) {
    try {
      results[name] = await fetcher.fullSync();
    } catch (error) {
      results[name] = { success: false, error: error.message };
    } finally {
      await fetcher.close();
    }
  }

  return results;
}

export default {
  InvoicesFetcher,
  PaymentsFetcher,
  syncAllAccounting,
};
