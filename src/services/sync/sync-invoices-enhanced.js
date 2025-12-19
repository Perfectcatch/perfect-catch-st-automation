/**
 * Enhanced Invoices Sync Module
 * Syncs invoices with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class InvoiceSync extends SyncBase {
  constructor() {
    super('invoices');
  }
  
  async fetchList() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    return fetchAllPages('/accounting/v2/tenant/{tenant}/invoices', {
      createdOnOrAfter: oneYearAgo.toISOString()
    });
  }
  
  async enrichOne(invoice) {
    // Get full invoice details
    const details = await fetchDetails('/accounting/v2/tenant/{tenant}/invoices', invoice.id);
    
    if (!details) {
      return invoice;
    }
    
    // Get invoice items
    let items = [];
    try {
      const itemsData = await fetchDetails('/accounting/v2/tenant/{tenant}/invoices', `${invoice.id}/items`);
      items = itemsData?.data || itemsData || [];
    } catch (e) {
      items = details.items || details.lineItems || [];
    }
    
    // Get payments
    let payments = [];
    try {
      const paymentsData = await fetchDetails('/accounting/v2/tenant/{tenant}/invoices', `${invoice.id}/payments`);
      payments = paymentsData?.data || paymentsData || [];
    } catch (e) {
      payments = details.payments || [];
    }
    
    return {
      ...details,
      items,
      payments,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(invoice) {
    const items = invoice.items || [];
    const payments = invoice.payments || [];
    
    // Calculate paid amount from payments
    const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const balance = (invoice.total || 0) - paidAmount;
    
    // Determine status based on balance
    let status = invoice.status || 'Open';
    if (balance <= 0 && invoice.total > 0) {
      status = 'Paid';
    } else if (paidAmount > 0 && balance > 0) {
      status = 'Partial';
    }
    
    return {
      st_id: BigInt(invoice.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // References
      customer_id: invoice.customerId ? BigInt(invoice.customerId) : null,
      job_id: invoice.jobId ? BigInt(invoice.jobId) : null,
      location_id: invoice.locationId ? BigInt(invoice.locationId) : null,
      business_unit_id: invoice.businessUnitId ? BigInt(invoice.businessUnitId) : null,
      
      // Invoice info
      invoice_number: invoice.number || invoice.invoiceNumber || `INV${invoice.id}`,
      status: status,
      
      // Amounts
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || invoice.taxAmount || 0,
      total: invoice.total || 0,
      balance: balance,
      paid_amount: paidAmount,
      
      // Items and payments
      items: JSON.stringify(items),
      payments: JSON.stringify(payments),
      item_count: items.length,
      payment_count: payments.length,
      
      // Dates
      due_date: invoice.dueDate ? new Date(invoice.dueDate) : null,
      paid_on: status === 'Paid' && payments.length > 0 
        ? new Date(payments[payments.length - 1].date || payments[payments.length - 1].createdOn)
        : null,
      
      // Timestamps
      st_created_on: invoice.createdOn ? new Date(invoice.createdOn) : new Date(),
      st_modified_on: invoice.modifiedOn ? new Date(invoice.modifiedOn) : new Date(),
      
      // Raw data
      full_data: invoice,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(invoice) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_invoices WHERE st_id = $1',
        [invoice.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_invoices (
            st_id, tenant_id, customer_id, job_id, location_id, business_unit_id,
            invoice_number, status,
            subtotal, tax, total, balance, paid_amount,
            items, payments, item_count, payment_count,
            due_date, paid_on,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19,
            $20, $21, $22, $23
          )
        `, [
          invoice.st_id,
          invoice.tenant_id,
          invoice.customer_id,
          invoice.job_id,
          invoice.location_id,
          invoice.business_unit_id,
          invoice.invoice_number,
          invoice.status,
          invoice.subtotal,
          invoice.tax,
          invoice.total,
          invoice.balance,
          invoice.paid_amount,
          invoice.items,
          invoice.payments,
          invoice.item_count,
          invoice.payment_count,
          invoice.due_date,
          invoice.paid_on,
          invoice.st_created_on,
          invoice.st_modified_on,
          JSON.stringify(invoice.full_data),
          invoice.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_invoices SET
            customer_id = $2, job_id = $3, location_id = $4, business_unit_id = $5,
            invoice_number = $6, status = $7,
            subtotal = $8, tax = $9, total = $10, balance = $11, paid_amount = $12,
            items = $13, payments = $14, item_count = $15, payment_count = $16,
            due_date = $17, paid_on = $18,
            st_modified_on = $19, full_data = $20, last_synced_at = $21
          WHERE st_id = $1
        `, [
          invoice.st_id,
          invoice.customer_id,
          invoice.job_id,
          invoice.location_id,
          invoice.business_unit_id,
          invoice.invoice_number,
          invoice.status,
          invoice.subtotal,
          invoice.tax,
          invoice.total,
          invoice.balance,
          invoice.paid_amount,
          invoice.items,
          invoice.payments,
          invoice.item_count,
          invoice.payment_count,
          invoice.due_date,
          invoice.paid_on,
          invoice.st_modified_on,
          JSON.stringify(invoice.full_data),
          invoice.last_synced_at
        ]);
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
  
  async postProcess() {
    this.logger.info('[invoices] Calculating AR aging...');
    
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE balance > 0 AND due_date >= CURRENT_DATE) as current,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30) as days_1_30,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60) as days_31_60,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90) as days_61_90,
          COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 90) as over_90,
          SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) as total_outstanding
        FROM st_invoices
      `);
      
      this.logger.info('[invoices] AR Aging:', result.rows[0]);
      
      // Sync payments to separate table
      await this.syncPayments();
    } finally {
      client.release();
    }
  }
  
  async syncPayments() {
    this.logger.info('[invoices] Syncing payments...');
    
    const client = await getPool().connect();
    try {
      const invoicesWithPayments = await client.query(`
        SELECT st_id, customer_id, payments
        FROM st_invoices
        WHERE payment_count > 0
      `);
      
      let paymentCount = 0;
      
      for (const invoice of invoicesWithPayments.rows) {
        const payments = JSON.parse(invoice.payments || '[]');
        
        for (const payment of payments) {
          try {
            const paymentId = payment.id ? BigInt(payment.id) : BigInt(`${invoice.st_id}${paymentCount}`);
            
            await client.query(`
              INSERT INTO st_payments (st_id, invoice_id, customer_id, amount, payment_method, payment_date, reference, full_data, last_synced_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              ON CONFLICT (st_id) DO UPDATE SET
                amount = $4, payment_method = $5, payment_date = $6, reference = $7, full_data = $8, last_synced_at = NOW()
            `, [
              paymentId,
              invoice.st_id,
              invoice.customer_id,
              payment.amount || 0,
              payment.type || payment.method || 'Unknown',
              payment.date ? new Date(payment.date) : new Date(payment.createdOn),
              payment.checkNumber || payment.reference || null,
              JSON.stringify(payment)
            ]);
            paymentCount++;
          } catch (error) {
            this.logger.error('Failed to upsert payment:', error.message);
          }
        }
      }
      
      this.logger.info(`[invoices] Synced ${paymentCount} payments`);
    } finally {
      client.release();
    }
  }
}

export const invoiceSync = new InvoiceSync();

export async function syncInvoices() {
  return invoiceSync.run();
}

export default { InvoiceSync, syncInvoices };
