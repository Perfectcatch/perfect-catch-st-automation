/**
 * Conversational Bot
 * AI-powered Slack bot using Claude for natural language understanding
 */

import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';

const { Pool } = pg;

let anthropic = null;
let pool = null;

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

class ConversationalBot {
  
  /**
   * Process a conversational query
   */
  async process(query, context) {
    try {
      // Get user context
      const { slackClient } = await import('./slack-client.js');
      let slackUser = null;
      try {
        slackUser = await slackClient.getUserInfo(context.user);
      } catch (e) {
        // User info not available
      }
      
      const dbUser = await this.findUserBySlackId(context.user);
      
      // Determine intent using Claude
      const intent = await this.detectIntent(query, dbUser);
      
      // Execute action based on intent
      const result = await this.executeAction(intent, query, dbUser);
      
      // Format response for Slack
      return this.formatResponse(result);
      
    } catch (error) {
      console.error('ConversationalBot error:', error);
      return {
        text: `❌ Error: ${error.message}`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error processing request*\n${error.message}`
          }
        }]
      };
    }
  }
  
  /**
   * Detect intent using Claude AI
   */
  async detectIntent(query, user) {
    try {
      const client = getAnthropicClient();
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: `You are a field service assistant analyzing user requests.

Detect intent and extract parameters. Return JSON only.

Intents:
- get_revenue: Check revenue/sales (params: period: today|week|month)
- get_schedule: View schedule (params: date, technicianId)
- create_estimate: Generate quote (params: customerId, description)
- find_customer: Search customer (params: query)
- schedule_job: Book appointment (params: jobId, technicianId, date, time)
- check_status: System status
- get_analytics: Reports/analytics (params: type, period)
- find_technician: Tech availability (params: date)
- create_job: Create service call (params: customerId, description, priority)
- get_estimate: View estimate details (params: estimateId)
- send_estimate: Send quote to customer (params: estimateId)
- get_jobs: List jobs (params: status, customerId)
- get_customers_at_risk: Find customers needing follow-up

User role: ${user?.role || 'unknown'}

Return: { "intent": "...", "confidence": 0-1, "params": {...} }`,
        messages: [{
          role: 'user',
          content: query
        }]
      });
      
      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { intent: 'unknown', confidence: 0, params: {} };
    } catch (error) {
      console.error('Intent detection error:', error);
      return { intent: 'unknown', confidence: 0, params: {} };
    }
  }
  
  /**
   * Execute action based on detected intent
   */
  async executeAction(intent, query, user) {
    const { intent: intentType, params } = intent;
    
    switch (intentType) {
      case 'get_revenue':
        return await this.getRevenue(params);
      
      case 'get_schedule':
        return await this.getSchedule(params, user);
      
      case 'create_estimate':
        return await this.createEstimate(params, query);
      
      case 'find_customer':
        return await this.findCustomer(params);
      
      case 'schedule_job':
        return await this.scheduleJob(params);
      
      case 'check_status':
        return await this.checkStatus();
      
      case 'get_analytics':
        return await this.getAnalytics(params);
      
      case 'find_technician':
        return await this.findTechnician(params);
      
      case 'get_jobs':
        return await this.getJobs(params);
      
      case 'get_customers_at_risk':
        return await this.getCustomersAtRisk();
      
      default:
        return {
          type: 'help',
          message: "I can help you with:\n• *Revenue* - \"What's my revenue today?\"\n• *Schedule* - \"Show my schedule\"\n• *Quotes* - \"Generate a quote for [service]\"\n• *Customers* - \"Find customer [name]\"\n• *Status* - \"System status\"\n• *At-risk customers* - \"Show customers at risk\""
        };
    }
  }
  
  /**
   * Get revenue data
   */
  async getRevenue(params) {
    const client = await getPool().connect();
    try {
      const period = params.period || 'today';
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      
      if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      }
      
      const result = await client.query(`
        SELECT 
          COALESCE(SUM(total), 0) as total,
          COUNT(*) as count
        FROM st_invoices
        WHERE st_created_on >= $1
      `, [startDate]);
      
      // Get breakdown by business unit/type
      const breakdown = await client.query(`
        SELECT 
          COALESCE(j.business_unit_name, 'Other') as unit,
          COALESCE(SUM(i.total), 0) as amount,
          COUNT(*) as jobs
        FROM st_invoices i
        LEFT JOIN st_jobs j ON i.job_id = j.st_id
        WHERE i.st_created_on >= $1
        GROUP BY j.business_unit_name
        ORDER BY amount DESC
      `, [startDate]);
      
      return {
        type: 'revenue',
        period,
        total: Number(result.rows[0].total),
        count: Number(result.rows[0].count),
        byUnit: breakdown.rows.reduce((acc, row) => {
          acc[row.unit] = { amount: Number(row.amount), jobs: Number(row.jobs) };
          return acc;
        }, {}),
        date: startDate
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get schedule
   */
  async getSchedule(params, user) {
    const client = await getPool().connect();
    try {
      const date = params.date ? new Date(params.date) : new Date();
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      // Get technician from user or params
      let technicianId = params.technicianId;
      if (!technicianId && user?.email) {
        const techResult = await client.query(
          'SELECT st_id FROM st_technicians WHERE email = $1',
          [user.email]
        );
        technicianId = techResult.rows[0]?.st_id;
      }
      
      let query = `
        SELECT a.st_id, a.start_on, a.end_on, a.status,
               j.job_number, j.job_type_name, j.summary,
               c.name as customer_name, c.phone, c.address_line1, c.city
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE DATE(a.start_on) = $1
      `;
      const queryParams = [date.toISOString().split('T')[0]];
      
      if (technicianId) {
        query += ' AND a.technician_id = $2';
        queryParams.push(technicianId);
      }
      
      query += ' ORDER BY a.start_on';
      
      const result = await client.query(query, queryParams);
      
      return {
        type: 'schedule',
        date,
        appointments: result.rows.map(apt => ({
          id: Number(apt.st_id),
          time: apt.start_on,
          endTime: apt.end_on,
          status: apt.status,
          jobNumber: apt.job_number,
          jobType: apt.job_type_name,
          summary: apt.summary,
          customer: apt.customer_name,
          phone: apt.phone,
          address: `${apt.address_line1}, ${apt.city}`
        }))
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Create estimate
   */
  async createEstimate(params, originalQuery) {
    if (!params.customerId) {
      return {
        type: 'need_input',
        message: "Which customer is this estimate for? Please provide a customer ID or name.",
        action: 'select_customer'
      };
    }
    
    try {
      // Use AI Estimator service
      const { aiEstimator } = await import('../../../mcp-server/services/ai-estimator.js');
      
      const estimate = await aiEstimator.generateFromDescription({
        customerId: params.customerId,
        description: params.description || originalQuery,
        includeOptions: true
      });
      
      return {
        type: 'estimate_created',
        estimate
      };
    } catch (error) {
      return {
        type: 'error',
        message: `Failed to create estimate: ${error.message}`
      };
    }
  }
  
  /**
   * Find customer
   */
  async findCustomer(params) {
    const client = await getPool().connect();
    try {
      const query = params.query || '';
      
      const result = await client.query(`
        SELECT st_id, name, phone, email, address_line1, city
        FROM st_customers
        WHERE LOWER(name) LIKE $1 
           OR phone LIKE $1 
           OR LOWER(email) LIKE $1
        ORDER BY name
        LIMIT 10
      `, [`%${query.toLowerCase()}%`]);
      
      return {
        type: 'customer_search',
        query,
        results: result.rows.map(c => ({
          id: Number(c.st_id),
          name: c.name,
          phone: c.phone,
          email: c.email,
          address: `${c.address_line1}, ${c.city}`
        }))
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Check system status
   */
  async checkStatus() {
    const client = await getPool().connect();
    try {
      const [dbCheck, syncCheck, jobsCheck] = await Promise.all([
        client.query('SELECT 1'),
        client.query('SELECT started_at, status FROM st_sync_log ORDER BY started_at DESC LIMIT 1'),
        client.query("SELECT COUNT(*) as count FROM st_jobs WHERE job_status = 'InProgress'")
      ]);
      
      const lastSync = syncCheck.rows[0];
      
      return {
        type: 'system_status',
        database: 'healthy',
        lastSync: lastSync?.started_at,
        syncStatus: lastSync?.status,
        activeJobs: Number(jobsCheck.rows[0].count)
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get analytics
   */
  async getAnalytics(params) {
    const client = await getPool().connect();
    try {
      const days = params.period === 'month' ? 30 : params.period === 'week' ? 7 : 1;
      
      const result = await client.query(`
        SELECT 
          COUNT(DISTINCT j.st_id) as total_jobs,
          COUNT(DISTINCT j.st_id) FILTER (WHERE j.job_status = 'Completed') as completed_jobs,
          COALESCE(SUM(i.total), 0) as revenue,
          COUNT(DISTINCT i.st_id) as invoices
        FROM st_jobs j
        LEFT JOIN st_invoices i ON j.st_id = i.job_id
        WHERE j.st_created_on >= NOW() - INTERVAL '${days} days'
      `);
      
      const data = result.rows[0];
      
      return {
        type: 'analytics',
        period: `Last ${days} days`,
        metrics: {
          totalJobs: Number(data.total_jobs),
          completedJobs: Number(data.completed_jobs),
          revenue: Number(data.revenue),
          invoices: Number(data.invoices),
          completionRate: data.total_jobs > 0 
            ? ((data.completed_jobs / data.total_jobs) * 100).toFixed(1) + '%' 
            : '0%'
        }
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Find available technicians
   */
  async findTechnician(params) {
    const client = await getPool().connect();
    try {
      const date = params.date ? new Date(params.date) : new Date();
      
      const result = await client.query(`
        SELECT t.st_id, t.name,
               COUNT(a.st_id) as scheduled_appointments
        FROM st_technicians t
        LEFT JOIN st_appointments a ON t.st_id = a.technician_id 
          AND DATE(a.start_on) = $1
        WHERE t.active = true
        GROUP BY t.st_id, t.name
        ORDER BY scheduled_appointments ASC
      `, [date.toISOString().split('T')[0]]);
      
      return {
        type: 'technician_availability',
        date,
        technicians: result.rows.map(t => ({
          id: Number(t.st_id),
          name: t.name,
          scheduledJobs: Number(t.scheduled_appointments),
          available: Number(t.scheduled_appointments) < 8
        }))
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get jobs list
   */
  async getJobs(params) {
    const client = await getPool().connect();
    try {
      let query = `
        SELECT j.st_id, j.job_number, j.job_status, j.job_type_name, j.st_created_on,
               c.name as customer_name
        FROM st_jobs j
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE 1=1
      `;
      const queryParams = [];
      let idx = 1;
      
      if (params.status) {
        query += ` AND j.job_status = $${idx}`;
        queryParams.push(params.status);
        idx++;
      }
      
      if (params.customerId) {
        query += ` AND j.customer_id = $${idx}`;
        queryParams.push(params.customerId);
        idx++;
      }
      
      query += ' ORDER BY j.st_created_on DESC LIMIT 10';
      
      const result = await client.query(query, queryParams);
      
      return {
        type: 'jobs_list',
        jobs: result.rows.map(j => ({
          id: Number(j.st_id),
          jobNumber: j.job_number,
          status: j.job_status,
          type: j.job_type_name,
          customer: j.customer_name,
          createdOn: j.st_created_on
        }))
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Get customers at risk (needing follow-up)
   */
  async getCustomersAtRisk() {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT c.st_id, c.name, c.phone, c.email,
               MAX(j.st_created_on) as last_service,
               COALESCE(SUM(i.total), 0) as lifetime_value
        FROM st_customers c
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        LEFT JOIN st_invoices i ON j.st_id = i.job_id
        GROUP BY c.st_id, c.name, c.phone, c.email
        HAVING MAX(j.st_created_on) < NOW() - INTERVAL '90 days'
           AND COALESCE(SUM(i.total), 0) > 1000
        ORDER BY lifetime_value DESC
        LIMIT 10
      `);
      
      return {
        type: 'customers_at_risk',
        customers: result.rows.map(c => ({
          id: Number(c.st_id),
          name: c.name,
          phone: c.phone,
          email: c.email,
          lastService: c.last_service,
          lifetimeValue: Number(c.lifetime_value),
          daysSinceService: c.last_service 
            ? Math.floor((Date.now() - new Date(c.last_service).getTime()) / 86400000)
            : null
        }))
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Format response for Slack
   */
  formatResponse(result) {
    switch (result.type) {
      case 'revenue':
        return this.formatRevenueResponse(result);
      
      case 'schedule':
        return this.formatScheduleResponse(result);
      
      case 'estimate_created':
        return this.formatEstimateResponse(result);
      
      case 'customer_search':
        return this.formatCustomerSearchResponse(result);
      
      case 'system_status':
        return this.formatStatusResponse(result);
      
      case 'analytics':
        return this.formatAnalyticsResponse(result);
      
      case 'technician_availability':
        return this.formatTechnicianResponse(result);
      
      case 'jobs_list':
        return this.formatJobsResponse(result);
      
      case 'customers_at_risk':
        return this.formatAtRiskResponse(result);
      
      case 'help':
        return this.formatHelpResponse(result);
      
      case 'need_input':
        return { text: result.message };
      
      case 'error':
        return { text: `❌ ${result.message}` };
      
      default:
        return { text: result.message || 'Done!' };
    }
  }
  
  formatRevenueResponse(data) {
    const { total, count, byUnit, period } = data;
    
    let unitBreakdown = '';
    for (const [unit, info] of Object.entries(byUnit)) {
      unitBreakdown += `• ${unit}: $${info.amount.toFixed(2)} (${info.jobs} jobs)\n`;
    }
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `💰 Revenue (${period})` }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Total: $${total.toFixed(2)}* from ${count} invoices\n\n${unitBreakdown || 'No breakdown available'}`
          }
        }
      ]
    };
  }
  
  formatScheduleResponse(data) {
    const { appointments, date } = data;
    
    if (appointments.length === 0) {
      return { text: `📅 No appointments scheduled for ${date.toLocaleDateString()}` };
    }
    
    let schedule = '';
    const now = new Date();
    
    for (const apt of appointments) {
      const time = new Date(apt.time);
      const isPast = time < now;
      const icon = isPast ? '✅' : (time - now < 3600000 ? '⏰' : '•');
      
      schedule += `${icon} *${time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}* - ${apt.customer}\n   ${apt.address}\n`;
    }
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📅 Schedule - ${date.toLocaleDateString()}` }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${appointments.length} appointments*\n\n${schedule}`
          }
        }
      ]
    };
  }
  
  formatEstimateResponse(data) {
    const { estimate } = data;
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📋 Estimate Created' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Estimate #${estimate.estimateNumber}*\nTotal: $${estimate.total.toFixed(2)}\n\n${estimate.items.length} items included`
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
            }
          ]
        }
      ]
    };
  }
  
  formatCustomerSearchResponse(data) {
    const { query, results } = data;
    
    if (results.length === 0) {
      return { text: `No customers found matching "${query}"` };
    }
    
    let customerList = results.slice(0, 5).map(c => 
      `• *${c.name}* - ${c.phone}\n   ${c.address}`
    ).join('\n');
    
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Found ${results.length} customers matching "${query}"*\n\n${customerList}`
          }
        }
      ]
    };
  }
  
  formatStatusResponse(data) {
    const { database, lastSync, syncStatus, activeJobs } = data;
    
    const syncInfo = lastSync 
      ? `Last sync: ${new Date(lastSync).toLocaleString()} (${syncStatus})`
      : 'Never synced';
    
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*System Status*\n\n✅ Database: ${database}\n📊 ${syncInfo}\n🔧 Active jobs: ${activeJobs}`
          }
        }
      ]
    };
  }
  
  formatAnalyticsResponse(data) {
    const { period, metrics } = data;
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📊 Analytics - ${period}` }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Total Jobs*\n${metrics.totalJobs}` },
            { type: 'mrkdwn', text: `*Completed*\n${metrics.completedJobs}` },
            { type: 'mrkdwn', text: `*Revenue*\n$${metrics.revenue.toFixed(2)}` },
            { type: 'mrkdwn', text: `*Completion Rate*\n${metrics.completionRate}` }
          ]
        }
      ]
    };
  }
  
  formatTechnicianResponse(data) {
    const { date, technicians } = data;
    
    const techList = technicians.map(t => 
      `${t.available ? '✅' : '⚠️'} *${t.name}* - ${t.scheduledJobs} jobs scheduled`
    ).join('\n');
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `👷 Technician Availability - ${date.toLocaleDateString()}` }
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: techList || 'No technicians found' }
        }
      ]
    };
  }
  
  formatJobsResponse(data) {
    const { jobs } = data;
    
    if (jobs.length === 0) {
      return { text: 'No jobs found' };
    }
    
    const jobList = jobs.map(j => 
      `• *#${j.jobNumber}* - ${j.customer} (${j.status})`
    ).join('\n');
    
    return {
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Recent Jobs*\n\n${jobList}` }
        }
      ]
    };
  }
  
  formatAtRiskResponse(data) {
    const { customers } = data;
    
    if (customers.length === 0) {
      return { text: '✅ No high-value customers at risk!' };
    }
    
    const customerList = customers.slice(0, 5).map(c => 
      `• *${c.name}* - $${c.lifetimeValue.toFixed(0)} LTV - ${c.daysSinceService} days since service`
    ).join('\n');
    
    return {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 Customers At Risk' }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${customers.length} high-value customers haven't been serviced in 90+ days:*\n\n${customerList}`
          }
        }
      ]
    };
  }
  
  formatHelpResponse(data) {
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: data.message
          }
        }
      ]
    };
  }
  
  /**
   * Find database user by Slack ID
   */
  async findUserBySlackId(slackUserId) {
    // In production, this would query a slack_users mapping table
    // For now, return a default user
    return { id: 1, role: 'manager', email: 'user@company.com' };
  }
}

export const conversationalBot = new ConversationalBot();
