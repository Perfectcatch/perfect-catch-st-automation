/**
 * Invoicing Tools Index
 * Exports all 6 invoice and payment tools
 */

import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

// Tool 1: Create Invoice from Job
export const createInvoiceFromJob = {
  name: 'create_invoice_from_job',
  description: 'Create an invoice from a completed job',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' },
      includeEstimateItems: { type: 'boolean', description: 'Include items from approved estimate', default: true }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const jobResult = await client.query('SELECT * FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (jobResult.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const job = jobResult.rows[0];
      
      // Get estimate if exists
      const estimateResult = await client.query(
        "SELECT * FROM st_estimates WHERE job_id = $1 AND status = 'Sold' LIMIT 1",
        [params.jobId]
      );
      
      const estimate = estimateResult.rows[0];
      const total = estimate ? Number(estimate.total) : 0;
      
      // Create invoice
      const invoiceId = Date.now();
      const lastNum = await client.query('SELECT invoice_number FROM st_invoices ORDER BY invoice_number DESC LIMIT 1');
      const nextNumber = lastNum.rows.length > 0 ? parseInt(lastNum.rows[0].invoice_number) + 1 : 1000;
      
      await client.query(`
        INSERT INTO st_invoices (st_id, job_id, customer_id, invoice_number, status, subtotal, total, st_created_on, local_synced_at)
        VALUES ($1, $2, $3, $4, 'Pending', $5, $6, NOW(), NOW())
      `, [invoiceId, params.jobId, job.customer_id, nextNumber.toString(), total, total]);
      
      return {
        success: true,
        invoiceId,
        invoiceNumber: nextNumber.toString(),
        total,
        message: `Created invoice #${nextNumber} for $${total.toFixed(2)}`
      };
    } finally { client.release(); }
  }
};

// Tool 2: Get Invoice Details
export const getInvoiceDetails = {
  name: 'get_invoice_details',
  description: 'Get complete details for an invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'number', description: 'Invoice ID' },
      invoiceNumber: { type: 'string', description: 'Invoice number (alternative)' }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let query, queryParams;
      if (params.invoiceId) {
        query = 'SELECT i.*, c.name as customer_name, c.email, c.phone FROM st_invoices i LEFT JOIN st_customers c ON i.customer_id = c.st_id WHERE i.st_id = $1';
        queryParams = [params.invoiceId];
      } else if (params.invoiceNumber) {
        query = 'SELECT i.*, c.name as customer_name, c.email, c.phone FROM st_invoices i LEFT JOIN st_customers c ON i.customer_id = c.st_id WHERE i.invoice_number = $1';
        queryParams = [params.invoiceNumber];
      } else {
        return { success: false, error: 'Either invoiceId or invoiceNumber required' };
      }
      
      const result = await client.query(query, queryParams);
      if (result.rows.length === 0) return { success: false, error: 'Invoice not found' };
      
      const inv = result.rows[0];
      return {
        success: true,
        invoice: {
          id: Number(inv.st_id),
          invoiceNumber: inv.invoice_number,
          status: inv.status,
          subtotal: Number(inv.subtotal),
          tax: Number(inv.tax) || 0,
          total: Number(inv.total),
          balance: Number(inv.balance) || Number(inv.total),
          dueDate: inv.due_date,
          createdOn: inv.st_created_on,
          customer: { id: Number(inv.customer_id), name: inv.customer_name, email: inv.email, phone: inv.phone }
        }
      };
    } finally { client.release(); }
  }
};

// Tool 3: Update Invoice Status
export const updateInvoiceStatus = {
  name: 'update_invoice_status',
  description: 'Update the status of an invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'number', description: 'Invoice ID' },
      status: { type: 'string', enum: ['Pending', 'Sent', 'Paid', 'Overdue', 'Void'], description: 'New status' }
    },
    required: ['invoiceId', 'status']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'UPDATE st_invoices SET status = $1, st_modified_on = NOW() WHERE st_id = $2 RETURNING invoice_number',
        [params.status, params.invoiceId]
      );
      if (result.rows.length === 0) return { success: false, error: 'Invoice not found' };
      return { success: true, invoiceNumber: result.rows[0].invoice_number, newStatus: params.status };
    } finally { client.release(); }
  }
};

// Tool 4: Send Invoice Reminder
export const sendInvoiceReminder = {
  name: 'send_invoice_reminder',
  description: 'Send a payment reminder for an outstanding invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'number', description: 'Invoice ID' },
      method: { type: 'string', enum: ['email', 'sms', 'both'], default: 'email' },
      message: { type: 'string', description: 'Custom reminder message' }
    },
    required: ['invoiceId']
  },
  async handler(params) {
    // Integration with messaging system would go here
    return {
      success: true,
      invoiceId: params.invoiceId,
      method: params.method,
      message: `Reminder would be sent via ${params.method}. Integration pending.`
    };
  }
};

// Tool 5: Record Payment
export const recordPayment = {
  name: 'record_payment',
  description: 'Record a payment against an invoice',
  inputSchema: {
    type: 'object',
    properties: {
      invoiceId: { type: 'number', description: 'Invoice ID' },
      amount: { type: 'number', description: 'Payment amount' },
      paymentMethod: { type: 'string', enum: ['cash', 'check', 'credit_card', 'ach'], description: 'Payment method' },
      reference: { type: 'string', description: 'Payment reference/check number' }
    },
    required: ['invoiceId', 'amount', 'paymentMethod']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_invoices WHERE st_id = $1', [params.invoiceId]);
      if (result.rows.length === 0) return { success: false, error: 'Invoice not found' };
      
      const invoice = result.rows[0];
      const currentBalance = Number(invoice.balance) || Number(invoice.total);
      const newBalance = Math.max(0, currentBalance - params.amount);
      const newStatus = newBalance === 0 ? 'Paid' : invoice.status;
      
      await client.query(
        'UPDATE st_invoices SET balance = $1, status = $2, paid_on = CASE WHEN $1 = 0 THEN NOW() ELSE paid_on END, st_modified_on = NOW() WHERE st_id = $3',
        [newBalance, newStatus, params.invoiceId]
      );
      
      return {
        success: true,
        invoiceId: params.invoiceId,
        paymentAmount: params.amount,
        previousBalance: currentBalance,
        newBalance,
        status: newStatus,
        message: newBalance === 0 ? 'Invoice paid in full' : `Remaining balance: $${newBalance.toFixed(2)}`
      };
    } finally { client.release(); }
  }
};

// Tool 6: Get Outstanding Invoices
export const getOutstandingInvoices = {
  name: 'get_outstanding_invoices',
  description: 'Get all outstanding invoices with optional filters',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Filter by customer' },
      minAmount: { type: 'number', description: 'Minimum balance' },
      daysOverdue: { type: 'number', description: 'Minimum days overdue' },
      limit: { type: 'number', default: 50 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = `
        SELECT i.st_id, i.invoice_number, i.total, i.balance, i.due_date, i.st_created_on,
               c.name as customer_name, c.phone, c.email
        FROM st_invoices i
        LEFT JOIN st_customers c ON i.customer_id = c.st_id
        WHERE i.status NOT IN ('Paid', 'Void') AND (i.balance > 0 OR i.balance IS NULL)
      `;
      const values = [];
      let idx = 1;
      
      if (params.customerId) {
        sql += ` AND i.customer_id = $${idx}`;
        values.push(params.customerId);
        idx++;
      }
      if (params.minAmount) {
        sql += ` AND COALESCE(i.balance, i.total) >= $${idx}`;
        values.push(params.minAmount);
        idx++;
      }
      if (params.daysOverdue) {
        sql += ` AND i.due_date < NOW() - INTERVAL '${params.daysOverdue} days'`;
      }
      
      sql += ` ORDER BY i.due_date ASC NULLS LAST LIMIT $${idx}`;
      values.push(params.limit || 50);
      
      const result = await client.query(sql, values);
      
      const totalOutstanding = result.rows.reduce((sum, inv) => sum + (Number(inv.balance) || Number(inv.total)), 0);
      
      return {
        success: true,
        count: result.rows.length,
        totalOutstanding,
        invoices: result.rows.map(inv => ({
          id: Number(inv.st_id),
          invoiceNumber: inv.invoice_number,
          total: Number(inv.total),
          balance: Number(inv.balance) || Number(inv.total),
          dueDate: inv.due_date,
          createdOn: inv.st_created_on,
          customer: { name: inv.customer_name, phone: inv.phone, email: inv.email },
          daysOverdue: inv.due_date ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date)) / 86400000)) : null
        }))
      };
    } finally { client.release(); }
  }
};
