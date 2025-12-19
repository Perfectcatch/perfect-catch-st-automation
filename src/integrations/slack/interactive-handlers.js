/**
 * Slack Interactive Handlers
 * Handlers for buttons, modals, and select menus
 */

import { slackClient } from './slack-client.js';
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

export const interactiveHandlers = {
  
  /**
   * Handle modal submissions
   */
  async handleViewSubmission(payload) {
    const { view, user } = payload;
    const callback_id = view.callback_id;
    
    switch (callback_id) {
      case 'quote_modal':
        return await this.handleQuoteSubmission(view, user);
      
      case 'schedule_modal':
        return await this.handleScheduleSubmission(view, user);
      
      case 'create_job_modal':
        return await this.handleCreateJobSubmission(view, user);
      
      default:
        return { response_action: 'clear' };
    }
  },
  
  /**
   * Handle quote modal submission
   */
  async handleQuoteSubmission(view, user) {
    const values = view.state.values;
    const metadata = view.private_metadata ? JSON.parse(view.private_metadata) : {};
    
    const customerOption = values.customer?.customer_select?.selected_option;
    const description = values.description?.description_input?.value;
    const options = values.options?.options_checkboxes?.selected_options || [];
    
    if (!customerOption) {
      return {
        response_action: 'errors',
        errors: { customer: 'Please select a customer' }
      };
    }
    
    const customerId = customerOption.value;
    const includeMaterials = options.some(opt => opt.value === 'materials');
    const includeAddons = options.some(opt => opt.value === 'addons');
    const applyDiscount = options.some(opt => opt.value === 'discount');
    
    try {
      // Generate estimate using AI
      const { aiEstimator } = await import('../../../mcp-server/services/ai-estimator.js');
      
      const estimate = await aiEstimator.generateFromDescription({
        customerId: parseInt(customerId),
        description: description || metadata.description,
        includeMaterials,
        includeOptions: includeAddons,
        applyDiscounts: applyDiscount
      });
      
      // Send result to user
      await slackClient.sendMessage(user.id, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '✅ Estimate Created!' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Estimate #${estimate.estimateNumber}*\nTotal: $${estimate.total.toFixed(2)}\n${estimate.items.length} items`
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: estimate.items.slice(0, 10).map(item => 
                `• ${item.description} - $${item.lineTotal.toFixed(2)}`
              ).join('\n') + (estimate.items.length > 10 ? `\n...and ${estimate.items.length - 10} more items` : '')
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Send to Customer' },
                style: 'primary',
                action_id: 'send_estimate',
                value: estimate.estimateId?.toString()
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Full Estimate' },
                action_id: 'view_estimate',
                url: `${process.env.APP_URL || 'http://localhost:3001'}/estimates/${estimate.estimateId}`
              }
            ]
          }
        ]
      });
      
      return { response_action: 'clear' };
      
    } catch (error) {
      console.error('Quote submission error:', error);
      return {
        response_action: 'errors',
        errors: { description: error.message }
      };
    }
  },
  
  /**
   * Handle schedule modal submission
   */
  async handleScheduleSubmission(view, user) {
    const values = view.state.values;
    
    const jobOption = values.job?.job_select?.selected_option;
    const techOption = values.technician?.tech_select?.selected_option;
    const date = values.date?.date_picker?.selected_date;
    const time = values.time?.time_picker?.selected_time;
    
    if (!jobOption || !techOption || !date || !time) {
      return {
        response_action: 'errors',
        errors: {
          job: !jobOption ? 'Please select a job' : undefined,
          technician: !techOption ? 'Please select a technician' : undefined,
          date: !date ? 'Please select a date' : undefined,
          time: !time ? 'Please select a time' : undefined
        }
      };
    }
    
    const client = await getPool().connect();
    try {
      const jobId = jobOption.value;
      const technicianId = techOption.value;
      const startTime = new Date(`${date}T${time}`);
      
      // Create appointment
      const appointmentId = Date.now();
      await client.query(`
        INSERT INTO st_appointments (st_id, job_id, technician_id, start_on, status, local_synced_at)
        VALUES ($1, $2, $3, $4, 'Scheduled', NOW())
      `, [appointmentId, jobId, technicianId, startTime]);
      
      // Get job and tech details for notification
      const [jobResult, techResult] = await Promise.all([
        client.query('SELECT job_number FROM st_jobs WHERE st_id = $1', [jobId]),
        client.query('SELECT name FROM st_technicians WHERE st_id = $1', [technicianId])
      ]);
      
      // Notify dispatcher channel
      const dispatchChannel = process.env.SLACK_DISPATCH_CHANNEL;
      if (dispatchChannel) {
        await slackClient.sendMessage(dispatchChannel, {
          text: `✅ Job #${jobResult.rows[0]?.job_number} scheduled\n${techResult.rows[0]?.name} - ${startTime.toLocaleString()}\nScheduled by <@${user.id}>`
        });
      }
      
      return { response_action: 'clear' };
      
    } catch (error) {
      console.error('Schedule submission error:', error);
      return {
        response_action: 'errors',
        errors: { job: error.message }
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * Handle button clicks
   */
  async handleButtonAction(payload) {
    const action = payload.actions[0];
    const { action_id, value } = action;
    const { user, channel, message } = payload;
    
    switch (action_id) {
      case 'send_estimate':
        return await this.sendEstimateToCustomer(value, user, channel);
      
      case 'schedule_job':
        return await this.openScheduleModalForJob(value, payload.trigger_id);
      
      case 'create_job_from_estimate':
        return await this.createJobFromEstimate(value, user, channel);
      
      case 'accept_emergency':
        return await this.acceptEmergency(value, user, channel, message);
      
      case 'create_invoice':
        return await this.createInvoice(value, user, channel);
      
      case 'view_customer':
        return await this.viewCustomer(value, user, channel);
      
      case 'send_invoice_reminder':
        return await this.sendInvoiceReminder(value, user, channel);
      
      default:
        console.log(`Unknown action: ${action_id}`);
        return;
    }
  },
  
  /**
   * Send estimate to customer
   */
  async sendEstimateToCustomer(estimateId, user, channel) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT e.*, c.name as customer_name, c.email, c.phone
        FROM st_estimates e
        JOIN st_customers c ON e.customer_id = c.st_id
        WHERE e.st_id = $1
      `, [estimateId]);
      
      if (result.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Estimate not found'
        });
        return;
      }
      
      const estimate = result.rows[0];
      
      // In production, this would send via email/SMS
      // For now, just confirm the action
      await slackClient.sendEphemeral(channel.id, user.id, {
        text: `✅ Estimate #${estimate.estimate_number} would be sent to ${estimate.customer_name} (${estimate.email || estimate.phone})\n\n_Note: Email/SMS integration pending_`
      });
    } finally {
      client.release();
    }
  },
  
  /**
   * Open schedule modal pre-filled with job
   */
  async openScheduleModalForJob(jobId, triggerId) {
    const { slashCommands } = await import('./slash-commands.js');
    const techOptions = await slashCommands.getTechnicianOptions();
    
    await slackClient.openModal(triggerId, {
      type: 'modal',
      callback_id: 'schedule_modal',
      private_metadata: JSON.stringify({ jobId }),
      title: { type: 'plain_text', text: 'Schedule Job' },
      submit: { type: 'plain_text', text: 'Schedule' },
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Job ID:* ${jobId}` }
        },
        {
          type: 'input',
          block_id: 'job',
          element: {
            type: 'external_select',
            action_id: 'job_select',
            placeholder: { type: 'plain_text', text: 'Confirm job...' },
            min_query_length: 0
          },
          label: { type: 'plain_text', text: 'Job' }
        },
        {
          type: 'input',
          block_id: 'technician',
          element: {
            type: 'static_select',
            action_id: 'tech_select',
            placeholder: { type: 'plain_text', text: 'Select technician' },
            options: techOptions
          },
          label: { type: 'plain_text', text: 'Technician' }
        },
        {
          type: 'input',
          block_id: 'date',
          element: {
            type: 'datepicker',
            action_id: 'date_picker'
          },
          label: { type: 'plain_text', text: 'Date' }
        },
        {
          type: 'input',
          block_id: 'time',
          element: {
            type: 'timepicker',
            action_id: 'time_picker'
          },
          label: { type: 'plain_text', text: 'Start Time' }
        }
      ]
    });
  },
  
  /**
   * Create job from estimate
   */
  async createJobFromEstimate(estimateId, user, channel) {
    const client = await getPool().connect();
    try {
      const estimateResult = await client.query(
        'SELECT * FROM st_estimates WHERE st_id = $1',
        [estimateId]
      );
      
      if (estimateResult.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Estimate not found'
        });
        return;
      }
      
      const estimate = estimateResult.rows[0];
      
      // Create job
      const jobId = Date.now();
      const jobNumber = `J${jobId.toString().slice(-6)}`;
      
      await client.query(`
        INSERT INTO st_jobs (st_id, customer_id, job_number, summary, job_status, job_type_name, local_synced_at)
        VALUES ($1, $2, $3, $4, 'New', 'Service', NOW())
      `, [jobId, estimate.customer_id, jobNumber, estimate.name || 'Service from estimate']);
      
      await slackClient.sendMessage(channel.id, {
        text: `✅ Job #${jobNumber} created from estimate #${estimate.estimate_number}`
      });
    } finally {
      client.release();
    }
  },
  
  /**
   * Accept emergency call
   */
  async acceptEmergency(jobId, user, channel, message) {
    const client = await getPool().connect();
    try {
      // Get user's technician profile
      const slackUser = await slackClient.getUserInfo(user.id);
      const techResult = await client.query(
        'SELECT st_id, name FROM st_technicians WHERE email = $1',
        [slackUser.profile?.email]
      );
      
      if (techResult.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Could not find your technician profile'
        });
        return;
      }
      
      const tech = techResult.rows[0];
      
      // Assign job to technician
      await client.query(
        'UPDATE st_jobs SET technician_id = $1 WHERE st_id = $2',
        [tech.st_id, jobId]
      );
      
      // Update original message
      const updatedBlocks = message.blocks.map(block => {
        if (block.type === 'actions') {
          return {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ *Accepted by ${tech.name}* (<@${user.id}>)`
            }
          };
        }
        return block;
      });
      
      await slackClient.updateMessage(channel.id, message.ts, { blocks: updatedBlocks });
      
    } finally {
      client.release();
    }
  },
  
  /**
   * Create invoice from job
   */
  async createInvoice(jobId, user, channel) {
    const client = await getPool().connect();
    try {
      const jobResult = await client.query(`
        SELECT j.*, e.total as estimate_total
        FROM st_jobs j
        LEFT JOIN st_estimates e ON j.st_id = e.job_id
        WHERE j.st_id = $1
      `, [jobId]);
      
      if (jobResult.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Job not found'
        });
        return;
      }
      
      const job = jobResult.rows[0];
      const total = Number(job.estimate_total) || 0;
      
      // Create invoice
      const invoiceId = Date.now();
      const invoiceNumber = `INV${invoiceId.toString().slice(-6)}`;
      
      await client.query(`
        INSERT INTO st_invoices (st_id, job_id, customer_id, invoice_number, total, balance, status, local_synced_at)
        VALUES ($1, $2, $3, $4, $5, $5, 'Open', NOW())
      `, [invoiceId, jobId, job.customer_id, invoiceNumber, total]);
      
      await slackClient.sendMessage(channel.id, {
        text: `💰 Invoice #${invoiceNumber} created for $${total.toFixed(2)}`
      });
    } finally {
      client.release();
    }
  },
  
  /**
   * View customer details
   */
  async viewCustomer(customerId, user, channel) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT c.*,
               COUNT(DISTINCT j.st_id) as total_jobs,
               COALESCE(SUM(i.total), 0) as lifetime_value,
               MAX(j.st_created_on) as last_service
        FROM st_customers c
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        LEFT JOIN st_invoices i ON j.st_id = i.job_id
        WHERE c.st_id = $1
        GROUP BY c.st_id
      `, [customerId]);
      
      if (result.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Customer not found'
        });
        return;
      }
      
      const customer = result.rows[0];
      
      await slackClient.sendEphemeral(channel.id, user.id, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `👤 ${customer.name}` }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Phone*\n${customer.phone || 'N/A'}` },
              { type: 'mrkdwn', text: `*Email*\n${customer.email || 'N/A'}` },
              { type: 'mrkdwn', text: `*Total Jobs*\n${customer.total_jobs}` },
              { type: 'mrkdwn', text: `*Lifetime Value*\n$${Number(customer.lifetime_value).toFixed(2)}` }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Address*\n${customer.address_line1 || ''} ${customer.city || ''} ${customer.state || ''} ${customer.zip || ''}`
            }
          }
        ]
      });
    } finally {
      client.release();
    }
  },
  
  /**
   * Send invoice reminder
   */
  async sendInvoiceReminder(invoiceId, user, channel) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT i.*, c.name as customer_name, c.email, c.phone
        FROM st_invoices i
        JOIN st_customers c ON i.customer_id = c.st_id
        WHERE i.st_id = $1
      `, [invoiceId]);
      
      if (result.rows.length === 0) {
        await slackClient.sendEphemeral(channel.id, user.id, {
          text: '❌ Invoice not found'
        });
        return;
      }
      
      const invoice = result.rows[0];
      
      // In production, this would send via email/SMS
      await slackClient.sendEphemeral(channel.id, user.id, {
        text: `✅ Reminder would be sent to ${invoice.customer_name} for Invoice #${invoice.invoice_number} ($${Number(invoice.balance || invoice.total).toFixed(2)})\n\n_Note: Email/SMS integration pending_`
      });
    } finally {
      client.release();
    }
  },
  
  /**
   * Handle external select options (for customer/job search)
   */
  async handleOptionsLoad(payload) {
    const { action_id, value } = payload;
    
    switch (action_id) {
      case 'customer_select':
        return await this.searchCustomers(value);
      
      case 'job_select':
        return await this.searchJobs(value);
      
      default:
        return { options: [] };
    }
  },
  
  /**
   * Search customers for select menu
   */
  async searchCustomers(query) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT st_id, name, phone
        FROM st_customers
        WHERE LOWER(name) LIKE $1 OR phone LIKE $1
        ORDER BY name
        LIMIT 10
      `, [`%${(query || '').toLowerCase()}%`]);
      
      return {
        options: result.rows.map(c => ({
          text: { type: 'plain_text', text: `${c.name} - ${c.phone || 'No phone'}` },
          value: c.st_id.toString()
        }))
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * Search jobs for select menu
   */
  async searchJobs(query) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT j.st_id, j.job_number, j.summary, c.name as customer_name
        FROM st_jobs j
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE j.job_number LIKE $1 
           OR LOWER(j.summary) LIKE $1
           OR LOWER(c.name) LIKE $1
        ORDER BY j.st_created_on DESC
        LIMIT 10
      `, [`%${(query || '').toLowerCase()}%`]);
      
      return {
        options: result.rows.map(j => ({
          text: { type: 'plain_text', text: `#${j.job_number} - ${j.customer_name}` },
          value: j.st_id.toString()
        }))
      };
    } finally {
      client.release();
    }
  }
};
