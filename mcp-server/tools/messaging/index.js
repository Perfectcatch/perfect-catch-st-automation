/**
 * Messaging Tools Index
 * Exports all 6 communication tools
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

// Tool 1: Send Message
export const sendMessage = {
  name: 'send_message',
  description: 'Send a message to a customer via SMS or email',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      method: { type: 'string', enum: ['sms', 'email'], description: 'Delivery method' },
      message: { type: 'string', description: 'Message content' },
      templateId: { type: 'string', description: 'Template ID to use (optional)' }
    },
    required: ['customerId', 'method', 'message']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Get customer contact info
      const custResult = await client.query('SELECT name, email, phone FROM st_customers WHERE st_id = $1', [params.customerId]);
      if (custResult.rows.length === 0) return { success: false, error: 'Customer not found' };
      
      const customer = custResult.rows[0];
      const destination = params.method === 'sms' ? customer.phone : customer.email;
      
      if (!destination) return { success: false, error: `Customer has no ${params.method === 'sms' ? 'phone' : 'email'}` };
      
      // Log the message
      const msgId = Date.now();
      await client.query(`
        INSERT INTO messaging_log (id, customer_id, message_type, destination, content, status, created_at)
        VALUES ($1, $2, $3, $4, $5, 'queued', NOW())
      `, [msgId, params.customerId, params.method, destination, params.message]);
      
      return {
        success: true,
        messageId: msgId,
        method: params.method,
        destination,
        status: 'queued',
        message: `Message queued for delivery to ${customer.name}`
      };
    } finally { client.release(); }
  }
};

// Tool 2: Send Bulk Messages
export const sendBulkMessages = {
  name: 'send_bulk_messages',
  description: 'Send messages to multiple customers at once',
  inputSchema: {
    type: 'object',
    properties: {
      customerIds: { type: 'array', items: { type: 'number' }, description: 'Array of customer IDs' },
      method: { type: 'string', enum: ['sms', 'email'], description: 'Delivery method' },
      message: { type: 'string', description: 'Message content' }
    },
    required: ['customerIds', 'method', 'message']
  },
  async handler(params) {
    const results = [];
    for (const customerId of params.customerIds) {
      const result = await sendMessage.handler({ customerId, method: params.method, message: params.message });
      results.push({ customerId, ...result });
    }
    return {
      success: true,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
};

// Tool 3: Get Message History
export const getMessageHistory = {
  name: 'get_message_history',
  description: 'Get message history for a customer',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      limit: { type: 'number', default: 20 }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT id, message_type, destination, content, status, created_at, delivered_at
        FROM messaging_log
        WHERE customer_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [params.customerId, params.limit || 20]);
      
      return {
        success: true,
        customerId: params.customerId,
        count: result.rows.length,
        messages: result.rows.map(m => ({
          id: m.id,
          type: m.message_type,
          destination: m.destination,
          content: m.content?.substring(0, 100) + (m.content?.length > 100 ? '...' : ''),
          status: m.status,
          sentAt: m.created_at,
          deliveredAt: m.delivered_at
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 4: Create Campaign
export const createCampaign = {
  name: 'create_campaign',
  description: 'Create a marketing or communication campaign',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Campaign name' },
      type: { type: 'string', enum: ['marketing', 'reminder', 'followup'], description: 'Campaign type' },
      targetSegment: { type: 'string', description: 'Customer segment to target' },
      message: { type: 'string', description: 'Campaign message' },
      method: { type: 'string', enum: ['sms', 'email', 'both'], default: 'email' },
      scheduledFor: { type: 'string', description: 'Schedule date/time (ISO format)' }
    },
    required: ['name', 'type', 'message']
  },
  async handler(params) {
    // Campaign creation would integrate with workflow system
    return {
      success: true,
      campaignId: Date.now(),
      name: params.name,
      type: params.type,
      status: params.scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: params.scheduledFor,
      message: 'Campaign created. Configure targeting and activate when ready.'
    };
  }
};

// Tool 5: Get Campaign Performance
export const getCampaignPerformance = {
  name: 'get_campaign_performance',
  description: 'Get performance metrics for a campaign',
  inputSchema: {
    type: 'object',
    properties: {
      campaignId: { type: 'number', description: 'Campaign ID' }
    },
    required: ['campaignId']
  },
  async handler(params) {
    // Mock performance data
    return {
      success: true,
      campaignId: params.campaignId,
      metrics: {
        sent: 150,
        delivered: 145,
        opened: 89,
        clicked: 34,
        converted: 12,
        deliveryRate: '96.7%',
        openRate: '61.4%',
        clickRate: '23.4%',
        conversionRate: '8.3%'
      }
    };
  }
};

// Tool 6: Get Template Library
export const getTemplateLibrary = {
  name: 'get_template_library',
  description: 'Get available message templates',
  inputSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Filter by category' }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = 'SELECT id, name, category, content, variables FROM message_templates WHERE active = true';
      const values = [];
      
      if (params.category) {
        sql += ' AND category = $1';
        values.push(params.category);
      }
      
      sql += ' ORDER BY category, name';
      
      const result = await client.query(sql, values);
      
      return {
        success: true,
        count: result.rows.length,
        templates: result.rows.map(t => ({
          id: t.id,
          name: t.name,
          category: t.category,
          content: t.content,
          variables: t.variables
        }))
      };
    } catch (error) {
      // Return default templates if table doesn't exist
      return {
        success: true,
        count: 4,
        templates: [
          { id: 1, name: 'Appointment Reminder', category: 'reminder', content: 'Hi {customer_name}, reminder of your appointment tomorrow at {time}.', variables: ['customer_name', 'time'] },
          { id: 2, name: 'Estimate Follow-up', category: 'followup', content: 'Hi {customer_name}, following up on your estimate #{estimate_number}. Ready to proceed?', variables: ['customer_name', 'estimate_number'] },
          { id: 3, name: 'Invoice Reminder', category: 'billing', content: 'Hi {customer_name}, invoice #{invoice_number} for ${amount} is due. Pay online: {link}', variables: ['customer_name', 'invoice_number', 'amount', 'link'] },
          { id: 4, name: 'Service Complete', category: 'notification', content: 'Hi {customer_name}, your service is complete. Please review: {link}', variables: ['customer_name', 'link'] }
        ]
      };
    } finally { client.release(); }
  }
};
