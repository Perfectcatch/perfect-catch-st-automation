/**
 * Customer Intelligence Service
 * Provides insights, predictions, and recommendations for customers
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

export class CustomerIntelligence {
  
  /**
   * Get comprehensive customer insights
   */
  async getCustomerInsights(customerId) {
    const client = await getPool().connect();
    
    try {
      // Get all customer data
      const [customerResult, jobsResult, estimatesResult, invoicesResult, messagesResult] = await Promise.all([
        client.query('SELECT * FROM st_customers WHERE st_id = $1', [customerId]),
        client.query('SELECT * FROM st_jobs WHERE customer_id = $1 ORDER BY st_created_on DESC', [customerId]),
        client.query('SELECT * FROM st_estimates WHERE customer_id = $1 ORDER BY st_created_on DESC', [customerId]),
        client.query('SELECT * FROM st_invoices WHERE customer_id = $1 ORDER BY st_created_on DESC', [customerId]),
        client.query('SELECT * FROM messaging_log WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20', [customerId])
      ]);
      
      const customer = customerResult.rows[0];
      const jobs = jobsResult.rows;
      const estimates = estimatesResult.rows;
      const invoices = invoicesResult.rows;
      const messages = messagesResult.rows;
      
      if (!customer) {
        return { error: 'Customer not found' };
      }
      
      // Calculate metrics
      const lifetimeValue = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
      const jobCount = jobs.length;
      const avgTicket = jobCount > 0 ? lifetimeValue / jobCount : 0;
      const lastService = jobs.length > 0 ? jobs[0].st_created_on : null;
      
      // Calculate days since last service
      const daysSinceService = lastService ? 
        Math.floor((Date.now() - new Date(lastService).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      
      // Calculate churn risk
      const riskScore = Math.min(daysSinceService / 180, 1.0); // High risk after 6 months
      
      // Predict next service date using AI
      let prediction = {};
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          const aiClient = getAnthropicClient();
          const response = await aiClient.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 512,
            system: 'You are a customer service prediction expert. Analyze customer history and predict when they will need service next.',
            messages: [{
              role: 'user',
              content: `Customer has had ${jobCount} jobs over the last 2 years. Last service: ${lastService}. Service types: pool maintenance. When will they likely need service next? Return JSON: { nextServiceDate: "YYYY-MM-DD", confidence: 0-1, reason: "..." }`
            }]
          });
          
          const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            prediction = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error('AI prediction failed:', e.message);
        }
      }
      
      return {
        customerId: Number(customer.st_id),
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone,
        lifetimeValue,
        jobCount,
        estimateCount: estimates.length,
        invoiceCount: invoices.length,
        avgTicket,
        lastService,
        nextPredictedService: prediction.nextServiceDate || null,
        daysSinceLastService: daysSinceService,
        riskScore,
        segment: this.determineSegment(lifetimeValue, riskScore),
        recommendedActions: this.getRecommendedActions(riskScore, daysSinceService),
        recentJobs: jobs.slice(0, 5).map(j => ({
          id: Number(j.st_id),
          number: j.job_number,
          status: j.job_status,
          date: j.st_created_on
        })),
        messageCount: messages.length
      };
    } finally {
      client.release();
    }
  }
  
  /**
   * Determine customer segment
   */
  determineSegment(ltv, risk) {
    if (ltv > 10000 && risk < 0.3) return 'VIP - Active';
    if (ltv > 10000 && risk >= 0.3) return 'VIP - At Risk';
    if (ltv > 5000 && risk < 0.3) return 'High Value';
    if (ltv > 5000 && risk >= 0.3) return 'High Value - At Risk';
    if (risk >= 0.7) return 'Churning';
    return 'Standard';
  }
  
  /**
   * Get recommended actions based on customer status
   */
  getRecommendedActions(risk, daysSince) {
    const actions = [];
    
    if (risk > 0.7) {
      actions.push('URGENT: Schedule win-back call');
      actions.push('Offer seasonal discount');
    } else if (risk > 0.5) {
      actions.push('Send check-in message');
      actions.push('Offer maintenance plan');
    }
    
    if (daysSince > 90) {
      actions.push('Schedule preventive maintenance');
    }
    
    if (daysSince > 30 && daysSince <= 90) {
      actions.push('Send service reminder');
    }
    
    return actions;
  }
  
  /**
   * Search customers with fuzzy matching
   */
  async searchCustomers(params) {
    const { query, fuzzyMatch = true, includeInactive = false, limit = 20 } = params;
    const client = await getPool().connect();
    
    try {
      let sql = `
        SELECT st_id, name, email, phone, address_line1, active
        FROM st_customers
        WHERE 1=1
      `;
      const values = [];
      let paramIndex = 1;
      
      if (!includeInactive) {
        sql += ` AND (active = true OR active IS NULL)`;
      }
      
      if (query) {
        if (fuzzyMatch) {
          sql += ` AND (
            LOWER(name) LIKE $${paramIndex}
            OR LOWER(email) LIKE $${paramIndex}
            OR phone LIKE $${paramIndex}
            OR LOWER(address_line1) LIKE $${paramIndex}
          )`;
          values.push(`%${query.toLowerCase()}%`);
          paramIndex++;
        } else {
          sql += ` AND LOWER(name) LIKE $${paramIndex}`;
          values.push(`%${query.toLowerCase()}%`);
          paramIndex++;
        }
      }
      
      sql += ` ORDER BY name LIMIT $${paramIndex}`;
      values.push(limit);
      
      const result = await client.query(sql, values);
      
      return result.rows.map(c => ({
        id: Number(c.st_id),
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address_line1,
        active: c.active
      }));
    } finally {
      client.release();
    }
  }
  
  /**
   * Get customers by segment
   */
  async getCustomersBySegment(segment, limit = 50) {
    const client = await getPool().connect();
    
    try {
      // Get customers with their lifetime value
      const result = await client.query(`
        SELECT 
          c.st_id,
          c.name,
          c.email,
          c.phone,
          COALESCE(SUM(i.total), 0) as lifetime_value,
          MAX(j.st_created_on) as last_service
        FROM st_customers c
        LEFT JOIN st_invoices i ON c.st_id = i.customer_id
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        GROUP BY c.st_id, c.name, c.email, c.phone
        ORDER BY lifetime_value DESC
        LIMIT $1
      `, [limit * 2]); // Get more to filter
      
      // Filter by segment
      const customers = result.rows.map(c => {
        const ltv = Number(c.lifetime_value);
        const lastService = c.last_service;
        const daysSince = lastService ? 
          Math.floor((Date.now() - new Date(lastService).getTime()) / (1000 * 60 * 60 * 24)) : 999;
        const risk = Math.min(daysSince / 180, 1.0);
        
        return {
          id: Number(c.st_id),
          name: c.name,
          email: c.email,
          phone: c.phone,
          lifetimeValue: ltv,
          lastService,
          daysSinceService: daysSince,
          riskScore: risk,
          segment: this.determineSegment(ltv, risk)
        };
      });
      
      // Filter by requested segment
      return customers
        .filter(c => c.segment.toLowerCase().includes(segment.toLowerCase()))
        .slice(0, limit);
    } finally {
      client.release();
    }
  }
  
  /**
   * Get customers needing follow-up
   */
  async getCustomersNeedingFollowup(daysThreshold = 90, limit = 50) {
    const client = await getPool().connect();
    
    try {
      const result = await client.query(`
        SELECT 
          c.st_id,
          c.name,
          c.email,
          c.phone,
          MAX(j.st_created_on) as last_service,
          COALESCE(SUM(i.total), 0) as lifetime_value
        FROM st_customers c
        LEFT JOIN st_jobs j ON c.st_id = j.customer_id
        LEFT JOIN st_invoices i ON c.st_id = i.customer_id
        GROUP BY c.st_id, c.name, c.email, c.phone
        HAVING MAX(j.st_created_on) < NOW() - INTERVAL '${daysThreshold} days'
           OR MAX(j.st_created_on) IS NULL
        ORDER BY lifetime_value DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows.map(c => ({
        id: Number(c.st_id),
        name: c.name,
        email: c.email,
        phone: c.phone,
        lastService: c.last_service,
        lifetimeValue: Number(c.lifetime_value),
        reason: c.last_service ? 
          `No service in ${Math.floor((Date.now() - new Date(c.last_service).getTime()) / (1000 * 60 * 60 * 24))} days` :
          'No service history'
      }));
    } finally {
      client.release();
    }
  }
}

export const customerIntel = new CustomerIntelligence();
