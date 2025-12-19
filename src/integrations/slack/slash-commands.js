/**
 * Slack Slash Commands
 * Handlers for /quote, /schedule, /customer, /revenue, /status commands
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

export const slashCommands = {
  
  /**
   * /quote [description] - Generate estimate
   */
  async quote(command) {
    const { text, user_id, trigger_id } = command;
    
    if (!text) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /quote [description]\nExample: /quote replace pool heater 400k BTU'
      };
    }
    
    // Open modal for customer selection
    await slackClient.openModal(trigger_id, {
      type: 'modal',
      callback_id: 'quote_modal',
      private_metadata: JSON.stringify({ description: text }),
      title: { type: 'plain_text', text: 'Generate Quote' },
      submit: { type: 'plain_text', text: 'Generate' },
      blocks: [
        {
          type: 'input',
          block_id: 'customer',
          element: {
            type: 'external_select',
            action_id: 'customer_select',
            placeholder: { type: 'plain_text', text: 'Search customer...' },
            min_query_length: 2
          },
          label: { type: 'plain_text', text: 'Customer' }
        },
        {
          type: 'input',
          block_id: 'description',
          element: {
            type: 'plain_text_input',
            action_id: 'description_input',
            multiline: true,
            initial_value: text
          },
          label: { type: 'plain_text', text: 'Service Description' }
        },
        {
          type: 'input',
          block_id: 'options',
          optional: true,
          element: {
            type: 'checkboxes',
            action_id: 'options_checkboxes',
            initial_options: [
              { text: { type: 'plain_text', text: 'Include materials' }, value: 'materials' },
              { text: { type: 'plain_text', text: 'Include add-ons' }, value: 'addons' }
            ],
            options: [
              { text: { type: 'plain_text', text: 'Include materials' }, value: 'materials' },
              { text: { type: 'plain_text', text: 'Include add-ons' }, value: 'addons' },
              { text: { type: 'plain_text', text: 'Apply customer discount' }, value: 'discount' }
            ]
          },
          label: { type: 'plain_text', text: 'Options' }
        }
      ]
    });
    
    return { response_type: 'ephemeral', text: 'Opening quote generator...' };
  },
  
  /**
   * /schedule [job details] - Schedule job
   */
  async schedule(command) {
    const { text, trigger_id } = command;
    
    // Get technician options
    const techOptions = await this.getTechnicianOptions();
    
    // Open scheduling modal
    await slackClient.openModal(trigger_id, {
      type: 'modal',
      callback_id: 'schedule_modal',
      title: { type: 'plain_text', text: 'Schedule Job' },
      submit: { type: 'plain_text', text: 'Schedule' },
      blocks: [
        {
          type: 'input',
          block_id: 'job',
          element: {
            type: 'external_select',
            action_id: 'job_select',
            placeholder: { type: 'plain_text', text: 'Search job...' },
            min_query_length: 2
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
            action_id: 'date_picker',
            placeholder: { type: 'plain_text', text: 'Select date' }
          },
          label: { type: 'plain_text', text: 'Date' }
        },
        {
          type: 'input',
          block_id: 'time',
          element: {
            type: 'timepicker',
            action_id: 'time_picker',
            placeholder: { type: 'plain_text', text: 'Select time' }
          },
          label: { type: 'plain_text', text: 'Start Time' }
        }
      ]
    });
    
    return { response_type: 'ephemeral', text: 'Opening scheduler...' };
  },
  
  /**
   * /customer [search] - Find customer
   */
  async customer(command) {
    const { text } = command;
    
    if (!text) {
      return {
        response_type: 'ephemeral',
        text: 'Usage: /customer [name/phone/email]'
      };
    }
    
    const client = await getPool().connect();
    try {
      // Search customers
      const result = await client.query(`
        SELECT c.st_id, c.name, c.phone, c.email,
               MAX(j.st_created_on) as last_service
        FROM st_customers c
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        WHERE LOWER(c.name) LIKE $1 
           OR c.phone LIKE $1 
           OR LOWER(c.email) LIKE $1
        GROUP BY c.st_id, c.name, c.phone, c.email
        ORDER BY c.name
        LIMIT 5
      `, [`%${text.toLowerCase()}%`]);
      
      if (result.rows.length === 0) {
        return {
          response_type: 'ephemeral',
          text: `No customers found matching "${text}"`
        };
      }
      
      const blocks = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Found ${result.rows.length} customers:*` }
        }
      ];
      
      for (const customer of result.rows) {
        const lastService = customer.last_service 
          ? new Date(customer.last_service).toLocaleDateString()
          : 'Never';
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${customer.name}*\n${customer.phone || 'No phone'} • ${customer.email || 'No email'}\nLast service: ${lastService}`
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'View Profile' },
            action_id: 'view_customer',
            value: customer.st_id.toString()
          }
        });
      }
      
      return { response_type: 'ephemeral', blocks };
    } finally {
      client.release();
    }
  },
  
  /**
   * /revenue [today/week/month] - Check revenue
   */
  async revenue(command) {
    const { text = 'today' } = command;
    
    const client = await getPool().connect();
    try {
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let periodLabel = 'Today';
      
      if (text.toLowerCase() === 'week') {
        startDate.setDate(startDate.getDate() - 7);
        periodLabel = 'This Week';
      } else if (text.toLowerCase() === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
        periodLabel = 'This Month';
      }
      
      const result = await client.query(`
        SELECT 
          COALESCE(SUM(total), 0) as total,
          COUNT(*) as count
        FROM st_invoices
        WHERE st_created_on >= $1
      `, [startDate]);
      
      const total = Number(result.rows[0].total);
      const count = Number(result.rows[0].count);
      
      return {
        response_type: 'in_channel',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Revenue (${periodLabel})*\n💰 *$${total.toFixed(2)}* from ${count} invoices`
            }
          }
        ]
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * /status - Check system status
   */
  async status(command) {
    const client = await getPool().connect();
    try {
      const [dbCheck, syncLog, activeJobs] = await Promise.all([
        client.query('SELECT 1'),
        client.query('SELECT started_at, status FROM st_sync_log ORDER BY started_at DESC LIMIT 1'),
        client.query("SELECT COUNT(*) as count FROM st_jobs WHERE job_status = 'InProgress'")
      ]);
      
      const lastSync = syncLog.rows[0];
      const syncInfo = lastSync 
        ? `${Math.floor((Date.now() - new Date(lastSync.started_at).getTime()) / 60000)} min ago (${lastSync.status})`
        : 'Never';
      
      return {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*System Status*\n\n✅ Database: Connected\n📊 Last sync: ${syncInfo}\n🔧 Active jobs: ${activeJobs.rows[0].count}`
            }
          }
        ]
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * /jobs [status] - List recent jobs
   */
  async jobs(command) {
    const { text } = command;
    
    const client = await getPool().connect();
    try {
      let query = `
        SELECT j.st_id, j.job_number, j.job_status, j.job_type_name,
               c.name as customer_name
        FROM st_jobs j
        JOIN st_customers c ON j.customer_id = c.st_id
      `;
      const params = [];
      
      if (text) {
        query += ' WHERE j.job_status = $1';
        params.push(text);
      }
      
      query += ' ORDER BY j.st_created_on DESC LIMIT 10';
      
      const result = await client.query(query, params);
      
      if (result.rows.length === 0) {
        return {
          response_type: 'ephemeral',
          text: text ? `No jobs found with status "${text}"` : 'No recent jobs found'
        };
      }
      
      const jobList = result.rows.map(j => 
        `• *#${j.job_number}* - ${j.customer_name} (${j.job_status})`
      ).join('\n');
      
      return {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Recent Jobs${text ? ` (${text})` : ''}*\n\n${jobList}`
            }
          }
        ]
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * /techs - List technician availability
   */
  async techs(command) {
    const client = await getPool().connect();
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const result = await client.query(`
        SELECT t.st_id, t.name,
               COUNT(a.st_id) as scheduled
        FROM st_technicians t
        LEFT JOIN st_appointments a ON t.st_id = a.technician_id 
          AND DATE(a.start_on) = $1
        WHERE t.active = true
        GROUP BY t.st_id, t.name
        ORDER BY scheduled ASC, t.name
      `, [today]);
      
      const techList = result.rows.map(t => {
        const status = Number(t.scheduled) < 6 ? '✅' : '⚠️';
        return `${status} *${t.name}* - ${t.scheduled} jobs today`;
      }).join('\n');
      
      return {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Technician Availability (Today)*\n\n${techList || 'No technicians found'}`
            }
          }
        ]
      };
    } finally {
      client.release();
    }
  },
  
  /**
   * Helper: Get technician options for select menu
   */
  async getTechnicianOptions() {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT st_id, name
        FROM st_technicians
        WHERE active = true
        ORDER BY name
      `);
      
      if (result.rows.length === 0) {
        return [{ text: { type: 'plain_text', text: 'No technicians' }, value: '0' }];
      }
      
      return result.rows.map(tech => ({
        text: { type: 'plain_text', text: tech.name },
        value: tech.st_id.toString()
      }));
    } finally {
      client.release();
    }
  }
};
