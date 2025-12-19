/**
 * Customer Tools Index
 * Exports all 8 customer intelligence tools
 */

import { customerIntel } from '../../services/customer-intel.js';
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

// Tool 1: Get Customer Insights
export const getCustomerInsights = {
  name: 'get_customer_insights',
  description: 'Get complete customer intelligence: lifetime value, churn risk, predictions, recommended actions',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' }
    },
    required: ['customerId']
  },
  async handler(params) {
    try {
      const insights = await customerIntel.getCustomerInsights(params.customerId);
      return { success: true, insights };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 2: Search Customers
export const searchCustomers = {
  name: 'search_customers',
  description: 'Search for customers by name, email, phone, or address with fuzzy matching',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      fuzzyMatch: { type: 'boolean', description: 'Enable fuzzy matching', default: true },
      includeInactive: { type: 'boolean', description: 'Include inactive customers', default: false },
      limit: { type: 'number', description: 'Maximum results', default: 20 }
    },
    required: ['query']
  },
  async handler(params) {
    try {
      const customers = await customerIntel.searchCustomers(params);
      return { success: true, count: customers.length, customers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 3: Get Customers by Segment
export const getCustomersBySegment = {
  name: 'get_customers_by_segment',
  description: 'Get customers filtered by segment (VIP, High Value, At Risk, Churning, Standard)',
  inputSchema: {
    type: 'object',
    properties: {
      segment: { type: 'string', description: 'Segment name', enum: ['VIP', 'High Value', 'At Risk', 'Churning', 'Standard'] },
      limit: { type: 'number', description: 'Maximum results', default: 50 }
    },
    required: ['segment']
  },
  async handler(params) {
    try {
      const customers = await customerIntel.getCustomersBySegment(params.segment, params.limit);
      return { success: true, segment: params.segment, count: customers.length, customers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 4: Get Customers Needing Followup
export const getCustomersNeedingFollowup = {
  name: 'get_customers_needing_followup',
  description: 'Find customers who need follow-up based on time since last service',
  inputSchema: {
    type: 'object',
    properties: {
      daysThreshold: { type: 'number', description: 'Days since last service threshold', default: 90 },
      limit: { type: 'number', description: 'Maximum results', default: 50 }
    }
  },
  async handler(params) {
    try {
      const customers = await customerIntel.getCustomersNeedingFollowup(params.daysThreshold, params.limit);
      return { success: true, threshold: `${params.daysThreshold || 90} days`, count: customers.length, customers };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 5: Get Customer Timeline
export const getCustomerTimeline = {
  name: 'get_customer_timeline',
  description: 'Get complete history timeline for a customer including jobs, estimates, invoices, and messages',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      limit: { type: 'number', description: 'Maximum events', default: 50 }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const [jobs, estimates, invoices, messages] = await Promise.all([
        client.query('SELECT st_id, job_number, job_status, st_created_on FROM st_jobs WHERE customer_id = $1 ORDER BY st_created_on DESC LIMIT $2', [params.customerId, params.limit]),
        client.query('SELECT st_id, estimate_number, status, total, st_created_on FROM st_estimates WHERE customer_id = $1 ORDER BY st_created_on DESC LIMIT $2', [params.customerId, params.limit]),
        client.query('SELECT st_id, invoice_number, status, total, st_created_on FROM st_invoices WHERE customer_id = $1 ORDER BY st_created_on DESC LIMIT $2', [params.customerId, params.limit]),
        client.query('SELECT id, message_type, status, created_at FROM messaging_log WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2', [params.customerId, params.limit])
      ]);
      
      // Combine and sort by date
      const timeline = [
        ...jobs.rows.map(j => ({ type: 'job', id: Number(j.st_id), number: j.job_number, status: j.job_status, date: j.st_created_on })),
        ...estimates.rows.map(e => ({ type: 'estimate', id: Number(e.st_id), number: e.estimate_number, status: e.status, total: Number(e.total), date: e.st_created_on })),
        ...invoices.rows.map(i => ({ type: 'invoice', id: Number(i.st_id), number: i.invoice_number, status: i.status, total: Number(i.total), date: i.st_created_on })),
        ...messages.rows.map(m => ({ type: 'message', id: m.id, messageType: m.message_type, status: m.status, date: m.created_at }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, params.limit);
      
      return { success: true, customerId: params.customerId, eventCount: timeline.length, timeline };
    } finally { client.release(); }
  }
};

// Tool 6: Can Contact Customer
export const canContactCustomer = {
  name: 'can_contact_customer',
  description: 'Check if a customer can be contacted via SMS or email based on their preferences',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      method: { type: 'string', enum: ['sms', 'email', 'both'], description: 'Contact method to check' }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT c.st_id, c.name, c.email, c.phone, cp.sms_opt_in, cp.email_opt_in
        FROM st_customers c
        LEFT JOIN communication_preferences cp ON c.st_id = cp.customer_id
        WHERE c.st_id = $1
      `, [params.customerId]);
      
      if (result.rows.length === 0) return { success: false, error: 'Customer not found' };
      
      const customer = result.rows[0];
      const canSMS = customer.phone && (customer.sms_opt_in !== false);
      const canEmail = customer.email && (customer.email_opt_in !== false);
      
      return {
        success: true,
        customerId: params.customerId,
        customerName: customer.name,
        canContactViaSMS: canSMS,
        canContactViaEmail: canEmail,
        phone: customer.phone,
        email: customer.email
      };
    } finally { client.release(); }
  }
};

// Tool 7: Update Customer Preferences
export const updateCustomerPreferences = {
  name: 'update_customer_preferences',
  description: 'Update customer communication preferences',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      smsOptIn: { type: 'boolean', description: 'SMS opt-in status' },
      emailOptIn: { type: 'boolean', description: 'Email opt-in status' },
      preferredContactMethod: { type: 'string', enum: ['sms', 'email', 'phone', 'any'], description: 'Preferred contact method' }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Upsert preferences
      await client.query(`
        INSERT INTO communication_preferences (customer_id, sms_opt_in, email_opt_in, preferred_method, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          sms_opt_in = COALESCE($2, communication_preferences.sms_opt_in),
          email_opt_in = COALESCE($3, communication_preferences.email_opt_in),
          preferred_method = COALESCE($4, communication_preferences.preferred_method),
          updated_at = NOW()
      `, [params.customerId, params.smsOptIn, params.emailOptIn, params.preferredContactMethod]);
      
      return { success: true, customerId: params.customerId, message: 'Preferences updated' };
    } finally { client.release(); }
  }
};

// Tool 8: Find Similar Customers
export const findSimilarCustomers = {
  name: 'find_similar_customers',
  description: 'Find customers with similar profiles based on service history and value',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Reference customer ID' },
      limit: { type: 'number', description: 'Maximum results', default: 10 }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Get reference customer's profile
      const refResult = await client.query(`
        SELECT c.st_id, COALESCE(SUM(i.total), 0) as ltv, COUNT(DISTINCT j.st_id) as job_count
        FROM st_customers c
        LEFT JOIN st_invoices i ON c.st_id = i.customer_id
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        WHERE c.st_id = $1
        GROUP BY c.st_id
      `, [params.customerId]);
      
      if (refResult.rows.length === 0) return { success: false, error: 'Customer not found' };
      
      const ref = refResult.rows[0];
      const refLTV = Number(ref.ltv);
      
      // Find similar customers by LTV range
      const result = await client.query(`
        SELECT c.st_id, c.name, c.email, COALESCE(SUM(i.total), 0) as ltv, COUNT(DISTINCT j.st_id) as job_count
        FROM st_customers c
        LEFT JOIN st_invoices i ON c.st_id = i.customer_id
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        WHERE c.st_id != $1
        GROUP BY c.st_id, c.name, c.email
        HAVING COALESCE(SUM(i.total), 0) BETWEEN $2 AND $3
        ORDER BY ABS(COALESCE(SUM(i.total), 0) - $4)
        LIMIT $5
      `, [params.customerId, refLTV * 0.5, refLTV * 1.5, refLTV, params.limit || 10]);
      
      return {
        success: true,
        referenceCustomerId: params.customerId,
        referenceLTV: refLTV,
        similarCustomers: result.rows.map(c => ({
          id: Number(c.st_id),
          name: c.name,
          email: c.email,
          ltv: Number(c.ltv),
          jobCount: Number(c.job_count)
        }))
      };
    } finally { client.release(); }
  }
};
